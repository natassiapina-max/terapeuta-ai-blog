import { getCollection } from 'astro:content';

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export async function GET({ site }) {
  const articles = (await getCollection('articles'))
    .filter((article) => article.data?.draft !== true)
    .sort((a, b) => (b.data.pubDate?.getTime?.() ?? 0) - (a.data.pubDate?.getTime?.() ?? 0));

  const baseUrl = (site ?? 'https://blog.terapeutaai.com.br').toString().replace(/\/$/, '');

  const items = articles.map((article) => {
    const published = article.data.pubDate?.toISOString?.() ?? new Date(0).toISOString();
    const link = `${baseUrl}/artigos/${article.id}`;

    return `<item>
      <title>${escapeXml(article.data.title)}</title>
      <description>${escapeXml(article.data.description)}</description>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${new Date(published).toUTCString()}</pubDate>
    </item>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Blog Terapeuta AI</title>
    <description>Conhecimento para quem cuida de pessoas.</description>
    <link>${escapeXml(baseUrl)}</link>
    <language>pt-BR</language>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8'
    }
  });
}
