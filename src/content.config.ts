import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { slideSchema, templateSchema, themeSchema } from './slide-schema';
import { wsUrl } from '../workspace.mjs';

export { layouts } from './slide-schema';

// As pastas abaixo ficam na área de trabalho (workspace.mjs): o projeto ou a pasta do comando `libreslide`.

// Cada arquivo .md dentro de slides/<apresentacao>/ é um slide.
// A ordem é a ordem alfabética dos arquivos (use 01-, 02-, ...).
// Arquivos que começam com "_" são ignorados.
const slides = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: wsUrl('slides') }),
  schema: slideSchema,
});

// Temas do usuário: themes/<nome>.yaml → use `theme: <nome>` no slide.
const themes = defineCollection({
  loader: glob({ pattern: '*.{yaml,yml}', base: wsUrl('themes') }),
  schema: themeSchema,
});

// Templates: templates/<nome>/template.yaml → use `template: <nome>` no primeiro slide.
const templates = defineCollection({
  loader: glob({
    pattern: '*/template.{yaml,yml}',
    base: wsUrl('templates'),
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: templateSchema,
});

export const collections = { slides, themes, templates };
