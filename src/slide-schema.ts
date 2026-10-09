import { z } from 'astro/zod';
import { backgrounds, fonts, modes } from './lib/themes';

export const layouts = [
  'default', 'cover', 'section', 'center', 'statement',
  'quote', 'split', 'image', 'columns',
] as const;

const slug = z.string().regex(/^[a-z0-9-]+$/, 'use só letras minúsculas, números e hífen');

// Frontmatter de cada slide. Usado pela coleção (content.config.ts)
// e pelo editor (editor/plugin.mjs), que valida enquanto você digita.
export const slideSchema = z.object({
  layout: z.enum(layouts).default('default'),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  kicker: z.string().optional(),
  // Tema: no primeiro slide define o tema da apresentação; nos demais, sobrescreve só aquele slide.
  // Um dos prontos (aurora, paper, noir, sunset) ou o nome de um arquivo em themes/.
  theme: slug.optional(),
  // Só lido no primeiro slide: nome de uma pasta em templates/ (logo, rodapé, fontes, animações…).
  template: slug.optional(),
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
});

const color = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'use uma cor no formato #rrggbb');

// Arquivo de tema em themes/<nome>.yaml (ver themes/oceano.yaml).
export const themeSchema = z.object({
  mode: z.enum(modes).default('dark'),
  background: z.enum(backgrounds).default('aurora'),
  font: z.enum(fonts).default('sans'),
  colors: z.object({
    background: color,
    text: color,
    muted: color,
    accent: color,
    accent2: color,
    accent3: color,
  }),
  corners: z.number().min(0).max(60).default(28),
  grain: z.number().min(0).max(0.3).default(0.07),
});

export const logoPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

// Template em templates/<nome>/template.yaml: o padrão visual de uma instituição
// (ver templates/instituicao-exemplo/). Vale para a apresentação inteira.
export const templateSchema = z.object({
  name: z.string().optional(), // nome exibido
  theme: slug.optional(),
  lockTheme: z.boolean().default(false), // slides não podem trocar o tema
  logo: z.string().optional(), // arquivo na pasta do template ou /img/...
  logoPosition: z.enum(logoPositions).default('top-right'),
  logoSize: z.number().min(24).max(300).default(72), // altura em px (slide de 1920×1080)
  logoOnCover: z.boolean().default(true),
  footer: z.string().default('{title}'), // {title} = nome da apresentação
  slideNumbers: z.boolean().default(true),
  textSize: z.number().min(0.6).max(1.6).default(1),
  titleSize: z.number().min(0.6).max(1.6).default(1),
  animations: z.boolean().default(true),
});
