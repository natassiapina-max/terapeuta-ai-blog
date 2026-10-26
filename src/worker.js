const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/careers') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { Allow: 'POST', 'Cache-Control': 'no-store' }
        });
      }
      return handleCareerApplication(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};

async function handleCareerApplication(request, env) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });

  if (!env.RESEND_API_KEY) return json({ error: 'O formulário está temporariamente indisponível.' }, 503);
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_FILE_BYTES + 100_000) return json({ error: 'O currículo deve ter até 5 MB.' }, 413);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Não foi possível ler o formulário.' }, 400);
  }

  // Honeypot field: quietly accept bot submissions without sending email.
  if (String(form.get('website') || '').trim()) return json({ ok: true });

  const name = String(form.get('name') || '').trim();
  const phone = String(form.get('phone') || '').trim();
  const consent = form.get('consent') === 'on';
  const cv = form.get('resume');
  if (name.length < 2 || name.length > 120) return json({ error: 'Informe seu nome (até 120 caracteres).' }, 400);
  if (!/^[+\d() .-]{8,25}$/.test(phone)) return json({ error: 'Confira o telefone informado.' }, 400);
  if (!consent) return json({ error: 'É necessário autorizar o uso dos dados para análise da candidatura.' }, 400);
  if (!(cv instanceof File) || cv.size === 0) return json({ error: 'Anexe seu currículo em PDF, DOC ou DOCX.' }, 400);
  if (cv.size > MAX_FILE_BYTES) return json({ error: 'O currículo deve ter até 5 MB.' }, 413);

  const extension = cv.name.toLowerCase().split('.').pop();
  const accepted = new Set(['pdf', 'doc', 'docx']);
  if (!accepted.has(extension) || !ALLOWED_TYPES.has(cv.type)) {
    return json({ error: 'Formato inválido. Envie o currículo em PDF, DOC ou DOCX.' }, 415);
  }
  const bytes = new Uint8Array(await cv.arrayBuffer());
  if (!hasValidSignature(bytes, extension)) return json({ error: 'O arquivo não corresponde ao formato informado.' }, 415);

  const safeName = name.replace(/[<>\r\n]/g, '').slice(0, 120);
  const safePhone = phone.replace(/[<>\r\n]/g, '').slice(0, 25);
  const base64 = toBase64(bytes);
  const filename = `curriculo.${extension}`;
  const email = {
    from: 'TerapeutaAI <contato@terapeutaai.com.br>',
    to: ['contato@terapeutaai.com.br'],
    subject: `Candidatura recebida — ${safeName}`,
    text: `Nova candidatura pelo blog TerapeutaAI.\n\nNome: ${safeName}\nTelefone: ${safePhone}\nCurrículo anexado: ${filename}\n\nO candidato autorizou o uso desses dados para análise da candidatura.`,
    attachments: [{ filename, content: base64 }]
  };

  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(email)
    });
  } catch {
    return json({ error: 'Falha temporária no envio. Tente novamente mais tarde.' }, 502);
  }
  if (!response.ok) return json({ error: 'Não foi possível enviar agora. Tente novamente mais tarde.' }, 502);
  return json({ ok: true });
}

function hasValidSignature(bytes, extension) {
  if (extension === 'pdf') return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  if (extension === 'doc') return bytes.length >= 8 && [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((v, i) => bytes[i] === v);
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function toBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
