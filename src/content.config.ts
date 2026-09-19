import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum([
      'Inteligência Artificial',
      'Gestão Clínica',
      'Prontuário',
      'Marketing',
      'Carreira e Negócios',
      'Ética e LGPD'
    ]),
    categorySlug: z.enum([
      'inteligencia-artificial',
      'gestao-clinica',
      'prontuario',
      'marketing',
      'carreira-e-negocios',
      'etica-e-lgpd'
    ]),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('Equipe Terapeuta AI'),
    reviewer: z.string().optional(),
    readTime: z.number().int().positive().default(6),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    sources: z.array(z.object({ label: z.string(), url: z.string().url() })).default([]),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { articles };
