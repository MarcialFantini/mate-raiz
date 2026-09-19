import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    author: z.string().default('Taller Raíz'),
    category: z.enum(['cuidados', 'cultura', 'oficio', 'guia']),
    image: z.string().url().or(z.string().startsWith('https://picsum.photos/')),
    imageAlt: z.string(),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { blog };
