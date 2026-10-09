import { getCollection, type CollectionEntry } from 'astro:content';
import { builtinInfo, themeCss, type ThemeInfo } from './themes';

export type SlideEntry = CollectionEntry<'slides'>;

export type TemplateData = CollectionEntry<'templates'>['data'];
export interface Template extends TemplateData {
  id: string;
  /** URL da logo, pronta para o <img>. */
  logoUrl?: string;
}

export interface Deck {
  name: string;
  title: string;
  theme: string;
  template?: Template;
  slides: SlideEntry[];
}

// Logos e outras imagens dentro de templates/<nome>/ (o Vite copia para o build).
const templateFiles = import.meta.glob<string>('/templates/*/*.{svg,png,jpg,jpeg,webp,gif,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Todos os templates de templates/<nome>/template.yaml. */
export async function getTemplates(): Promise<Record<string, Template>> {
  const out: Record<string, Template> = {};
  for (const t of await getCollection('templates')) {
    const { logo } = t.data;
    let logoUrl: string | undefined;
    if (logo?.startsWith('/')) logoUrl = asset(logo);
    else if (logo) {
      logoUrl = templateFiles[`/templates/${t.id}/${logo}`];
      if (!logoUrl) console.warn(`[templates] templates/${t.id}/${logo} não existe.`);
    }
    out[t.id] = { ...t.data, id: t.id, logoUrl };
  }
  return out;
}

/** Junta a apresentação a um template (ou a nenhum). Também usado pela prévia de templates do editor. */
export function applyTemplate(deck: Deck, templates: Record<string, Template>, name: string | undefined) {
  const template = name ? templates[name] : undefined;
  if (name && !template) {
    console.warn(`[templates] Template "${name}" não existe (templates/${name}/template.yaml).`);
  }
  const own = deck.slides[0].data.theme;
  return {
    ...deck,
    template,
    theme: (template?.lockTheme ? template.theme : own ?? template?.theme) ?? 'aurora',
  };
}

const byPath = (a: SlideEntry, b: SlideEntry) =>
  (a.filePath ?? a.id).localeCompare(b.filePath ?? b.id, undefined, { numeric: true });

export async function getDecks(): Promise<Deck[]> {
  const all = (await getCollection('slides')).sort(byPath);
  const templates = await getTemplates();
  const groups = new Map<string, SlideEntry[]>();
  for (const slide of all) {
    const name = slide.id.split('/')[0];
    groups.set(name, [...(groups.get(name) ?? []), slide]);
  }
  return [...groups].map(([name, slides]) => {
    const first = slides[0].data;
    const deck = { name, title: first.deckTitle ?? stripInline(first.title ?? name), theme: 'aurora', slides };
    return applyTemplate(deck, templates, first.template);
  });
}

/** Resolve caminhos "/img/foto.jpg" (da pasta public/) respeitando o `base` do Astro. */
export function asset(path: string) {
  if (!path.startsWith('/')) return path;
  return import.meta.env.BASE_URL.replace(/\/$/, '') + path;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Markdown mínimo para textos do frontmatter: **negrito**, *destaque* e quebras de linha. */
export function inline(s?: string) {
  if (!s) return '';
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n|&lt;br\s*\/?&gt;/g, '<br>');
}

export function stripInline(s: string) {
  return s.replace(/\*+/g, '').replace(/\n|<br\s*\/?>/g, ' ');
}

/** Todos os temas (prontos + themes/*.yaml) e o CSS dos personalizados. */
export async function getThemes() {
  const info: Record<string, ThemeInfo> = { ...builtinInfo };
  let css = '';
  for (const t of await getCollection('themes')) {
    if (info[t.id]) {
      console.warn(`[temas] themes/${t.id} tem o nome de um tema pronto e foi ignorado.`);
      continue;
    }
    info[t.id] = { name: t.id, mode: t.data.mode, background: t.data.background, builtin: false };
    css += themeCss(t.id, t.data) + '\n';
  }
  return { info, css };
}

/** Tema existente ou, se não existir, o padrão (com aviso no terminal). */
export function resolveTheme(themes: Record<string, ThemeInfo>, name: string | undefined, fallback = 'aurora') {
  if (!name) return themes[fallback] ?? builtinInfo.aurora;
  if (themes[name]) return themes[name];
  console.warn(`[temas] Tema "${name}" não existe; usando "${fallback}". Crie themes/${name}.yaml ou use: ${Object.keys(themes).join(', ')}.`);
  return themes[fallback] ?? builtinInfo.aurora;
}
