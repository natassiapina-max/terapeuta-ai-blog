import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('dist');
const origin = 'https://blog.terapeutaai.com.br';
const failures = [];
const titles = new Map();
const checkedImages = new Set();
const files = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? files(path) : [path];
});
const htmlFiles = files(root).filter((path) => path.endsWith('.html'));
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1];
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => match[0]);
const decode = (value) => value.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const localPath = (pathname) => {
  const path = resolve(root, '.' + decodeURIComponent(pathname));
  if (!path.startsWith(root + '/') && path !== root) return null;
  return pathname.endsWith('/') ? join(path, 'index.html') :
    existsSync(path) && !pathname.endsWith('.html') && !pathname.split('/').at(-1).includes('.') ? join(path, 'index.html') : path;
};
const sitemap = readFileSync(join(root, 'sitemap-0.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1]));
const fail = (page, message) => failures.push(`${page}: ${message}`);

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const pathname = '/' + file.slice(root.length + 1).replace(/index\.html$/, '');
  if (pathname.startsWith('/admin/')) continue;
  const page = new URL(pathname, origin);
  const meta = tags(html, 'meta');
  const robots = attr(meta.find((tag) => attr(tag, 'name') === 'robots') ?? '', 'content') ?? '';
  const indexable = !robots.includes('noindex');
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  if (!title) fail(pathname, 'título ausente');
  if (indexable) {
    if (titles.has(title)) fail(pathname, `título duplicado com ${titles.get(title)}`);
    titles.set(title, pathname);
    if (tags(html, 'h1').length !== 1) fail(pathname, 'precisa de exatamente um H1');
    if (!attr(meta.find((tag) => attr(tag, 'name') === 'description') ?? '', 'content')) fail(pathname, 'descrição ausente');
    const canonical = attr(tags(html, 'link').find((tag) => attr(tag, 'rel') === 'canonical') ?? '', 'href');
    if (canonical !== page.href) fail(pathname, `canonical incorreto: ${canonical}`);
    if (!sitemapUrls.includes(page.href)) fail(pathname, 'página indexável ausente no sitemap');
  } else if (sitemapUrls.includes(page.href)) fail(pathname, 'página noindex incluída no sitemap');

  for (const tag of tags(html, 'img')) {
    if (attr(tag, 'alt') === undefined) fail(pathname, 'imagem sem atributo alt');
  }
  for (const tag of [...tags(html, 'img'), ...tags(html, 'script'), ...tags(html, 'link')]) {
    const value = attr(tag, 'src') ?? (attr(tag, 'rel') === 'stylesheet' ? attr(tag, 'href') : undefined);
    if (!value || value.startsWith('data:')) continue;
    const url = new URL(decode(value), page);
    if (url.origin !== origin) continue;
    const path = localPath(url.pathname);
    if (!path || !existsSync(path)) { fail(pathname, `recurso ausente: ${url.pathname}`); continue; }
    if (path.endsWith('.webp') && !checkedImages.has(path)) {
      checkedImages.add(path);
      const bytes = readFileSync(path);
      if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length) fail(pathname, `WebP inválido ou truncado: ${url.pathname}`);
    }
  }
  for (const tag of tags(html, 'a')) {
    const href = attr(tag, 'href');
    if (!href || /^(mailto:|tel:)/.test(href)) continue;
    const url = new URL(decode(href), page);
    if (url.origin !== origin) continue;
    const path = localPath(url.pathname);
    if (!path || !existsSync(path)) { fail(pathname, `link interno quebrado: ${href}`); continue; }
    if (url.hash && path.endsWith('.html')) {
      const target = readFileSync(path, 'utf8');
      const ids = [...target.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
      if (!ids.includes(decodeURIComponent(url.hash.slice(1)))) fail(pathname, `âncora inexistente: ${href}`);
    }
  }
  const schemas = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((match) => {
    try { return JSON.parse(match[1]); } catch { fail(pathname, 'JSON-LD inválido'); return {}; }
  });
  const allSchemas = schemas.flatMap((schema) => schema['@graph'] ?? [schema]);
  for (const schema of allSchemas) {
    const images = [schema.image, schema.author?.image, schema.mainEntity?.image].flat().filter((value) => typeof value === 'string');
    for (const image of images) {
      const url = new URL(image, page);
      if (url.origin === origin && !existsSync(localPath(url.pathname) ?? '')) fail(pathname, `imagem do schema ausente: ${image}`);
    }
  }
  if (indexable && pathname.startsWith('/artigos/') && pathname !== '/artigos/') {
    const article = allSchemas.find((schema) => ['BlogPosting', 'Article'].includes(schema['@type']));
    if (!article?.author?.name || !article?.datePublished || !article?.image?.length) fail(pathname, 'schema de artigo incompleto');
    if (!allSchemas.some((schema) => schema['@type'] === 'BreadcrumbList')) fail(pathname, 'breadcrumb estruturado ausente');
  }
}
for (const value of sitemapUrls) {
  const url = new URL(value);
  if (url.origin !== origin || !existsSync(localPath(url.pathname) ?? '')) fail('sitemap', `URL inválida: ${value}`);
  if (/\/(preview|admin|404)(\/|$)/.test(url.pathname)) fail('sitemap', `URL privada ou de erro: ${value}`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Auditoria aprovada: ${htmlFiles.length} páginas, ${sitemapUrls.length} URLs no sitemap e ${checkedImages.size} imagens WebP verificadas.`);
