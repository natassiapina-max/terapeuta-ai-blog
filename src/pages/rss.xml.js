---
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const articles = (await getCollection('articles')).filter((article) => article.data?.draft !== true)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  return rss({
    title: 'Blog Terapeuta AI',
    description: 'Conhecimento para quem cuida de pessoas.',
    site: context.site,
    items: articles.map((article) => ({
      title: article.data.title,
      description: article.data.description,
      pubDate: article.data.pubDate,
      link: `/artigos/${article.id}`,
    })),
    customData: '<language>pt-BR</language>',
  });
}
