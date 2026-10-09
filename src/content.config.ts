import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { slideSchema, themeSchema } from './slide-schema';

export { layouts } from './slide-schema';

// Cada arquivo .md dentro de slides/<apresentacao>/ é um slide.
// A ordem é a ordem alfabética dos arquivos (use 01-, 02-, ...).
// Arquivos que começam com "_" são ignorados.
const slides = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './slides' }),
  schema: slideSchema,
});

// Temas do usuário: themes/<nome>.yaml → use `theme: <nome>` no slide.
const themes = defineCollection({
  loader: glob({ pattern: '*.{yaml,yml}', base: './themes' }),
  schema: themeSchema,
});

export const collections = { slides, themes };
