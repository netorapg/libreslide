import { getCollection, type CollectionEntry } from 'astro:content';
import { builtinInfo, themeCss, type ThemeInfo } from './themes';

export type SlideEntry = CollectionEntry<'slides'>;

export interface Deck {
  name: string;
  title: string;
  theme: string;
  slides: SlideEntry[];
}

const byPath = (a: SlideEntry, b: SlideEntry) =>
  (a.filePath ?? a.id).localeCompare(b.filePath ?? b.id, undefined, { numeric: true });

export async function getDecks(): Promise<Deck[]> {
  const all = (await getCollection('slides')).sort(byPath);
  const groups = new Map<string, SlideEntry[]>();
  for (const slide of all) {
    const name = slide.id.split('/')[0];
    groups.set(name, [...(groups.get(name) ?? []), slide]);
  }
  return [...groups].map(([name, slides]) => {
    const first = slides[0].data;
    return {
      name,
      title: first.deckTitle ?? stripInline(first.title ?? name),
      theme: first.theme ?? 'aurora',
      slides,
    };
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
