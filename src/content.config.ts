import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const themes = ['aurora', 'paper', 'noir', 'sunset'] as const;
export const layouts = [
  'default', 'cover', 'section', 'center', 'statement',
  'quote', 'split', 'image', 'columns',
] as const;

// Cada arquivo .md dentro de slides/<apresentacao>/ é um slide.
// A ordem é a ordem alfabética dos arquivos (use 01-, 02-, ...).
// Arquivos que começam com "_" são ignorados.
const slides = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './slides' }),
  schema: z.object({
    layout: z.enum(layouts).default('default'),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    kicker: z.string().optional(),
    // Tema: no primeiro slide define o tema da apresentação; nos demais, sobrescreve só aquele slide.
    theme: z.enum(themes).optional(),
    // Só lido no primeiro slide: nome exibido no rodapé e na página inicial.
    deckTitle: z.string().optional(),
    author: z.string().optional(),
    // Aceita "Setembro 2026", 2026 ou 2026-09-24.
    date: z
      .union([z.string(), z.number(), z.date()])
      .transform((v) => (v instanceof Date ? v.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : String(v)))
      .optional(),
    image: z.string().optional(),
    imagePosition: z.enum(['left', 'right']).default('right'),
    accent: z.string().optional(),
    // Revela os itens de lista um a um.
    steps: z.boolean().default(false),
    notes: z.string().optional(),
  }),
});

export const collections = { slides };
