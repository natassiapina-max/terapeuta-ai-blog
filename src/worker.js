import { CHECKLIST_PDF_BASE64 } from './data/lead-magnet-pdf.js';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_MESSAGE_LENGTH = 2000;
const LEAD_WINDOW_MS = 10 * 60 * 1000;
const LEAD_MAX_SUBMISSIONS = 5;
// Best-effort per-isolate protection for this pilot.
const leadAttempts = new Map();
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
    if (url.pathname === '/api/lead-magnet') {
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
      return handleLeadMagnet(request, env);
    }
    if (url.pathname === '/api/lead-magnet/download') {
      if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } });
      return handleLeadMagnetDownload(request, env);
    }
    if (url.pathname === '/api/lead-magnet/agenda-clinica') {
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
      return handleAgendaLead(request, env);
    }
    if (url.pathname === '/api/lead-magnet/agenda-clinica/download') {
      if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } });
      return handleAgendaDownload(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};

async function handleLeadMagnet(request, env) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });

  const leadSecret = env.LEAD_DOWNLOAD_SECRET || env.RESEND_API_KEY;
  if (!env.RESEND_API_KEY || !leadSecret) {
    return json({ error: 'O formulário está temporariamente indisponível.' }, 503);
  }
  if (Number(request.headers.get('content-length') || 0) > 12_000) {
    return json({ error: 'Os dados enviados excedem o limite permitido.' }, 413);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Não foi possível ler os dados do formulário.' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const attempts = (leadAttempts.get(ip) || []).filter((time) => now - time < LEAD_WINDOW_MS);
  if (attempts.length >= LEAD_MAX_SUBMISSIONS) {
    return json({ error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.' }, 429);
  }
  attempts.push(now);
  leadAttempts.set(ip, attempts);

  // Honeypot: return an indistinguishable successful response without mailing.
  if (String(data.website || '').trim()) {
    return json({ ok: true, downloadToken: await createDownloadToken(leadSecret) });
  }

  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const whatsapp = String(data.whatsapp || '').trim();
  const digits = whatsapp.replace(/\D/g, '');
  if (name.length < 2 || name.length > 100 || /[<>\r\n]/.test(name)) {
    return json({ error: 'Informe seu nome com até 100 caracteres.' }, 400);
  }
  if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Confira o e-mail informado.' }, 400);
  }
  if (digits.length < 10 || digits.length > 15 || !/^[+\d() .-]{8,25}$/.test(whatsapp)) {
    return json({ error: 'Confira o WhatsApp com DDD.' }, 400);
  }
  if (data.consent !== true) {
    return json({ error: 'É necessário autorizar o uso dos dados para receber o material.' }, 400);
  }

  const safeName = name.replace(/[<>\r\n]/g, '').slice(0, 100);
  const safeEmail = email.replace(/[<>\r\n]/g, '').slice(0, 160);
  const safeWhatsapp = whatsapp.replace(/[<>\r\n]/g, '').slice(0, 25);
  const emailMessage = {
    from: 'TerapeutaAI Blog <contato@terapeutaai.com.br>',
    to: ['contato@terapeutaai.com.br'],
    subject: `Novo lead do checklist — ${safeName}`,
    text: [
      'Novo pedido do checklist Clínica multidisciplinar em ordem.',
      '',
      `Nome: ${safeName}`,
      `E-mail: ${safeEmail}`,
      `WhatsApp: ${safeWhatsapp}`,
      `Autorizou novidades por e-mail/WhatsApp: ${data.marketingConsent === true ? 'Sim' : 'Não'}`,
      '',
      'Consentimento para processar o pedido e disponibilizar o material: Sim.'
    ].join('\n')
  };

  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailMessage)
    });
  } catch {
    return json({ error: 'Falha temporária ao registrar o pedido. Tente novamente.' }, 502);
  }
  if (!response.ok) return json({ error: 'Não foi possível registrar seu pedido agora. Tente novamente.' }, 502);

  return json({ ok: true, downloadToken: await createDownloadToken(leadSecret) });
}

async function handleLeadMagnetDownload(request, env) {
  const leadSecret = env.LEAD_DOWNLOAD_SECRET || env.RESEND_API_KEY;
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!leadSecret || !(await verifyDownloadToken(token, leadSecret))) {
    return new Response('Link de download inválido ou expirado.', {
      status: 403,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  }

  const binary = atob(CHECKLIST_PDF_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="Clinica_Multidisciplinar_em_Ordem_TerapeutaAI.pdf"',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function createDownloadToken(secret, resource = null, honeypot = false) {
  const claims = { exp: Date.now() + 15 * 60 * 1000 };
  if (resource) claims.resource = resource;
  if (honeypot) claims.honeypot = true;
  const payload = new TextEncoder().encode(JSON.stringify(claims));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, payload));
  return `${toBase64Url(payload)}.${toBase64Url(signature)}`;
}

async function verifyDownloadToken(token, secret) {
  try {
    const [payloadPart, signaturePart] = token.split('.');
    if (!payloadPart || !signaturePart) return false;
    const payload = fromBase64Url(payloadPart);
    const signature = fromBase64Url(signaturePart);
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    if (!(await crypto.subtle.verify('HMAC', key, signature, payload))) return false;
    const decoded = JSON.parse(new TextDecoder().decode(payload));
    return Number.isFinite(decoded.exp) && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}


const AGENDA_PDF_KEY = 'Agenda clínica sem gargalos.pdf';
const AGENDA_RESOURCE_ID = 'agenda-clinica-sem-gargalos';

async function handleAgendaLead(request, env) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });

  const leadSecret = env.LEAD_DOWNLOAD_SECRET || env.RESEND_API_KEY;
  if (!env.RESEND_API_KEY || !leadSecret || !env.LEAD_MAGNETS) {
    return json({ error: 'O formulário está temporariamente indisponível.' }, 503);
  }
  if (Number(request.headers.get('content-length') || 0) > 12_000) {
    return json({ error: 'Os dados enviados excedem o limite permitido.' }, 413);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Não foi possível ler os dados do formulário.' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimitKey = AGENDA_RESOURCE_ID + ':' + ip;
  const now = Date.now();
  const attempts = (leadAttempts.get(rateLimitKey) || []).filter((time) => now - time < LEAD_WINDOW_MS);
  if (attempts.length >= LEAD_MAX_SUBMISSIONS) {
    return json({ error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.' }, 429);
  }
  attempts.push(now);
  leadAttempts.set(rateLimitKey, attempts);

  if (String(data.website || '').trim()) {
    return json({ ok: true, downloadToken: await createDownloadToken(leadSecret, AGENDA_RESOURCE_ID, true) });
  }

  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const whatsapp = String(data.whatsapp || '').trim();
  const digits = whatsapp.replace(/\D/g, '');
  if (name.length < 2 || name.length > 100 || /[<>\r\n]/.test(name)) {
    return json({ error: 'Informe seu nome com até 100 caracteres.' }, 400);
  }
  if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Confira o e-mail informado.' }, 400);
  }
  if (digits.length < 10 || digits.length > 15 || !/^[+\d() .-]{8,25}$/.test(whatsapp)) {
    return json({ error: 'Confira o WhatsApp com DDD.' }, 400);
  }
  if (data.consent !== true) {
    return json({ error: 'É necessário autorizar o uso dos dados para receber o material.' }, 400);
  }

  try {
    const pdf = await env.LEAD_MAGNETS.head(AGENDA_PDF_KEY);
    if (!pdf) return json({ error: 'O guia está temporariamente indisponível. Tente novamente mais tarde.' }, 503);
  } catch {
    return json({ error: 'O guia está temporariamente indisponível. Tente novamente mais tarde.' }, 503);
  }

  const safeName = name.replace(/[<>\r\n]/g, '').slice(0, 100);
  const safeEmail = email.replace(/[<>\r\n]/g, '').slice(0, 160);
  const safeWhatsapp = whatsapp.replace(/[<>\r\n]/g, '').slice(0, 25);
  const emailMessage = {
    from: 'TerapeutaAI Blog <contato@terapeutaai.com.br>',
    to: ['contato@terapeutaai.com.br'],
    subject: 'Novo pedido do guia Agenda clínica sem gargalos',
    text: [
      'Novo lead da página do guia gratuito Agenda clínica sem gargalos.',
      '',
      'Nome: ' + safeName,
      'E-mail: ' + safeEmail,
      'WhatsApp: ' + safeWhatsapp,
      'Autorizou receber conteúdos e novidades: ' + (data.marketingConsent === true ? 'Sim' : 'Não'),
      '',
      'Consentimento para processar o pedido e disponibilizar o material: Sim.'
    ].join('\n')
  };

  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailMessage)
    });
  } catch {
    return json({ error: 'Falha temporária ao registrar o pedido. Tente novamente.' }, 502);
  }
  if (!response.ok) return json({ error: 'Não foi possível registrar seu pedido agora. Tente novamente.' }, 502);

  return json({ ok: true, downloadToken: await createDownloadToken(leadSecret, AGENDA_RESOURCE_ID) });
}

async function handleAgendaDownload(request, env) {
  const leadSecret = env.LEAD_DOWNLOAD_SECRET || env.RESEND_API_KEY;
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!leadSecret || !env.LEAD_MAGNETS || !(await verifyDownloadTokenForResource(token, leadSecret, AGENDA_RESOURCE_ID))) {
    return new Response('Link de download inválido ou expirado.', {
      status: 403,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  }

  let pdf;
  try {
    pdf = await env.LEAD_MAGNETS.get(AGENDA_PDF_KEY);
  } catch {
    return new Response('O guia está temporariamente indisponível.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  }
  if (!pdf) {
    return new Response('O guia está temporariamente indisponível.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  }

  return new Response(pdf.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.size),
      'Content-Disposition': "attachment; filename=\"Agenda clinica sem gargalos.pdf\"; filename*=UTF-8''Agenda%20cl%C3%ADnica%20sem%20gargalos.pdf",
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function verifyDownloadTokenForResource(token, secret, resource) {
  try {
    const [payloadPart, signaturePart] = token.split('.');
    if (!payloadPart || !signaturePart) return false;
    const payload = fromBase64Url(payloadPart);
    const signature = fromBase64Url(signaturePart);
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    if (!(await crypto.subtle.verify('HMAC', key, signature, payload))) return false;
    const claims = JSON.parse(new TextDecoder().decode(payload));
    return claims.resource === resource && claims.honeypot !== true && Number.isFinite(claims.exp) && claims.exp > Date.now();
  } catch {
    return false;
  }
}

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
  const message = String(form.get('message') || '').replace(/\0/g, '').trim().slice(0, MAX_MESSAGE_LENGTH);
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
    text: `Nova candidatura pelo blog TerapeutaAI.\n\nNome: ${safeName}\nTelefone: ${safePhone}\n\nMensagem:\n${message || '—'}\n\nCurrículo anexado: ${filename}\n\nO candidato autorizou o uso desses dados para análise da candidatura.`,
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
