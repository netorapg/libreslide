import { EditorView, basicSetup } from 'codemirror';
import { EditorState, type Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { yamlFrontmatter } from '@codemirror/lang-yaml';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { backgrounds, fonts, themeCss, type ThemeFile } from '../src/lib/themes';
import { linter, type Diagnostic } from '@codemirror/lint';
// Fontes via Vite (?url), que acha os pacotes onde quer que o npm os tenha instalado.
import interCss from '@fontsource-variable/inter/index.css?url';
import monoCss from '@fontsource-variable/jetbrains-mono/index.css?url';
import frauncesCss from '@fontsource-variable/fraunces/index.css?url';

for (const href of [interCss, monoCss, frauncesCss]) {
  document.head.prepend(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
}

// Espelha src/content.config.ts
const LAYOUTS = ['default', 'cover', 'section', 'center', 'statement', 'quote', 'split', 'image', 'columns'];
// Lista de temas (prontos + themes/*.yaml), atualizada pelo servidor.
let THEMES = ['aurora', 'paper', 'noir', 'sunset'];
// Templates (templates/<nome>/), também atualizados pelo servidor.
let TEMPLATE_NAMES: string[] = [];
const KEYS: Record<string, string> = {
  layout: 'Tipo de slide',
  title: 'Título (*texto* = destaque)',
  subtitle: 'Subtítulo',
  kicker: 'Rótulo acima do título',
  theme: 'Tema (no 1º slide vale para tudo)',
  template: 'Template de instituição (1º slide)',
  deckTitle: 'Nome da apresentação (1º slide)',
  author: 'Autor',
  date: 'Data',
  image: 'Imagem (/img/...)',
  imagePosition: 'left | right',
  accent: 'Cor de destaque',
  steps: 'Revela listas aos poucos',
  notes: 'Notas do apresentador',
};

const SNIPPETS: { label: string; text: string }[] = [
  { label: 'Cartões', text: '<div class="cards">\n\n<div>\n\n### Um\n\nTexto do cartão.\n\n</div>\n<div>\n\n### Dois\n\nTexto do cartão.\n\n</div>\n\n</div>\n' },
  { label: 'Número em destaque', text: '<span class="stat">42%</span>' },
  { label: 'Separador de colunas', text: '\n***\n\n' },
  { label: 'Item em etapa', text: '<p class="step">Aparece no próximo clique</p>' },
  { label: 'Bloco de código', text: '```ts\nconst ola = "mundo";\n```\n' },
  { label: 'Tabela', text: '| Coluna | Coluna |\n| ------ | ------ |\n| a      | b      |\n' },
  { label: 'Citação', text: '> Uma frase marcante.\n' },
];

// ───────────────────────── estado ─────────────────────────

type Deck = { name: string; files: string[] };
let decks: Deck[] = [];
let current: string | null = null; // "deck/arquivo.md"
let saved = ''; // conteúdo que está no disco
let saveTimer: number | undefined;
let saving: Promise<void> = Promise.resolve();
let previewDeck: string | null = null;
let previewReady = false;
const open = new Set<string>();

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const deckOf = (p: string) => p.split('/')[0];
const fileOf = (p: string) => p.split('/')[1];
const visible = (deck: string) =>
  (decks.find((d) => d.name === deck)?.files ?? []).filter((f) => !f.startsWith('_')).sort(byName);
const indexOf = (p: string) => visible(deckOf(p)).indexOf(fileOf(p));

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};

async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  if (json !== undefined) {
    rest.body = JSON.stringify(json);
    rest.headers = { 'Content-Type': 'application/json' };
  }
  const res = await fetch(`/__editor/api/${path}`, rest);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}
const q = (p: string) => `path=${encodeURIComponent(p)}`;

// ───────────────────────── interface ─────────────────────────

function toast(msg: string, error = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('error', error);
  t.hidden = false;
  clearTimeout((t as any).timer);
  (t as any).timer = setTimeout(() => (t.hidden = true), error ? 5000 : 2500);
}

function setStatus(state: 'idle' | 'dirty' | 'saving' | 'saved' | 'error', text = '') {
  const s = $('status');
  s.dataset.state = state;
  s.textContent = text || { idle: '', dirty: 'Editando…', saving: 'Salvando…', saved: 'Salvo', error: 'Erro ao salvar' }[state];
}

type Choice = string | { group: string; options: { value: string; label: string }[] };
const option = (value: string, label = value) => `<option value="${esc(value)}">${esc(label)}</option>`;

/** Diálogo simples: texto (input) ou escolha (select). Resolve null se cancelar. */
function ask(title: string, opts: { text?: string; value?: string; choices?: Choice[]; ok?: string; danger?: boolean } = {}) {
  const dialog = $<HTMLDialogElement>('dialog');
  const input = $<HTMLInputElement>('dialog-input');
  const select = $<HTMLSelectElement>('dialog-select');
  $('dialog-title').textContent = title;
  $('dialog-text').textContent = opts.text ?? '';
  $('dialog-text').hidden = !opts.text;
  $('dialog-ok').textContent = opts.ok ?? 'OK';
  $('dialog-ok').classList.toggle('danger', !!opts.danger);
  input.hidden = opts.value === undefined;
  input.value = opts.value ?? '';
  select.hidden = !opts.choices;
  select.innerHTML = (opts.choices ?? [])
    .map((c) => typeof c === 'string'
      ? option(c)
      : `<optgroup label="${esc(c.group)}">${c.options.map((o) => option(o.value, o.label)).join('')}</optgroup>`)
    .join('');
  dialog.returnValue = '';
  dialog.showModal();
  if (!input.hidden) {
    input.focus();
    const dot = input.value.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
  }
  return new Promise<{ value: string; choice: string } | null>((done) =>
    dialog.addEventListener(
      'close',
      () => done(dialog.returnValue === 'ok' ? { value: input.value.trim(), choice: select.value } : null),
      { once: true },
    ),
  );
}

const icon = (d: string) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICONS = {
  caret: icon('<path d="m9 18 6-6-6-6"/>'),
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  edit: icon('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  trash: icon('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function renderTree() {
  $('tree').innerHTML = decks
    .map((d) => {
      const isOpen = open.has(d.name);
      const files = [...d.files]
        .sort((a, b) => Number(a.startsWith('_')) - Number(b.startsWith('_')) || byName(a, b))
        .map((f) => {
          const p = `${d.name}/${f}`;
          const m = f.match(/^(\d+)[-_ ]?(.*)\.md$/);
          const label = m ? `<i>${m[1]}</i>${esc(m[2])}` : esc(f.replace(/\.md$/, ''));
          return `<li class="file${p === current ? ' active' : ''}${f.startsWith('_') ? ' draft' : ''}" data-path="${esc(p)}">
            <span class="label">${label}</span>
            <button class="icon" data-act="rename" title="Renomear">${ICONS.edit}</button>
            <button class="icon" data-act="delete" title="Excluir">${ICONS.trash}</button>
          </li>`;
        })
        .join('');
      return `<div class="deck${isOpen ? ' open' : ''}" data-deck="${esc(d.name)}">
        <div class="deck-row">
          <span class="caret">${ICONS.caret}</span>
          <span class="label">${esc(d.name)}</span>
          <span class="n">${d.files.length}</span>
          <button class="icon" data-act="new-slide" title="Novo slide">${ICONS.plus}</button>
          <button class="icon" data-act="delete-deck" title="Excluir apresentação">${ICONS.trash}</button>
        </div>
        <ul>${files}</ul>
      </div>`;
    })
    .join('');
}

$('tree').addEventListener('click', async (e) => {
  const el = e.target as HTMLElement;
  const act = el.closest<HTMLElement>('[data-act]')?.dataset.act;
  const file = el.closest<HTMLElement>('.file')?.dataset.path;
  const deck = el.closest<HTMLElement>('.deck')!.dataset.deck!;
  try {
    if (act === 'new-slide') {
      const r = await ask('Novo slide', { text: `Em slides/${deck}/`, value: 'Novo slide', ok: 'Criar' });
      if (!r?.value) return;
      const { path } = await api('slide', { method: 'POST', json: { deck, name: r.value } });
      open.add(deck);
      await refreshTree();
      await openFile(path);
    } else if (act === 'rename' && file) {
      const r = await ask('Renomear', { text: 'A ordem dos slides segue o nome do arquivo (01-, 02-, …). Comece com _ para virar rascunho.', value: fileOf(file), ok: 'Renomear' });
      if (!r?.value || r.value === fileOf(file)) return;
      const to = `${deck}/${r.value.endsWith('.md') ? r.value : r.value + '.md'}`;
      if (file === current) await flush();
      await api('rename', { method: 'POST', json: { from: file, to } });
      await refreshTree();
      if (file === current) await openFile(to);
    } else if (act === 'delete' && file) {
      const r = await ask('Excluir slide?', { text: `slides/${file} será apagado do disco.`, ok: 'Excluir', danger: true });
      if (!r) return;
      await api(`file?${q(file)}`, { method: 'DELETE' });
      if (file === current) closeFile();
      await refreshTree();
    } else if (act === 'delete-deck') {
      const n = decks.find((d) => d.name === deck)?.files.length ?? 0;
      const r = await ask('Excluir apresentação?', {
        text: `A pasta slides/${deck}/ e ${n === 1 ? 'o slide dela' : `os ${n} slides dela`} serão apagados do disco.`,
        ok: 'Excluir',
        danger: true,
      });
      if (!r) return;
      if (current && deckOf(current) === deck) closeFile();
      await api(`deck?name=${encodeURIComponent(deck)}`, { method: 'DELETE' });
      if (previewDeck === deck) {
        previewDeck = null;
        iframe.removeAttribute('src');
      }
      open.delete(deck);
      await refreshTree();
    } else if (file) {
      await openFile(file);
    } else {
      open.has(deck) ? open.delete(deck) : open.add(deck);
      renderTree();
    }
  } catch (err) {
    toast((err as Error).message, true);
  }
});

$('new-deck').addEventListener('click', async () => {
  const choices: Choice[] = [{ group: 'Tema', options: THEMES.map((t) => ({ value: `theme:${t}`, label: t })) }];
  if (templates.length) {
    choices.unshift({
      group: 'Template (com os slides iniciais dele)',
      options: templates.filter((t) => !t.error).map((t) => ({ value: `template:${t.name}`, label: t.title ?? t.name })),
    });
  }
  const r = await ask('Nova apresentação', { text: 'Nome da pasta em slides/ e o ponto de partida.', value: 'minha-palestra', choices, ok: 'Criar' });
  if (!r?.value) return;
  const [kind, value] = r.choice.split(':');
  try {
    const { path } = await api('deck', { method: 'POST', json: { name: r.value, [kind]: value } });
    open.add(deckOf(path));
    await refreshTree();
    await openFile(path);
  } catch (err) {
    toast((err as Error).message, true);
  }
});

async function refreshTree() {
  decks = await api<Deck[]>('tree');
  renderTree();
  updatePreviewBar();
}

// ───────────────────────── editor ─────────────────────────

function frontmatterCompletions(ctx: CompletionContext): CompletionResult | null {
  const doc = ctx.state.doc;
  const line = doc.lineAt(ctx.pos);
  // Só dentro do bloco --- ... --- do topo
  if (doc.line(1).text.trim() !== '---' || line.number === 1) return null;
  for (let n = 2; n < line.number; n++) if (doc.line(n).text.trim() === '---') return null;

  const before = line.text.slice(0, ctx.pos - line.from);
  const value = before.match(/^(layout|theme|template|imagePosition|steps):\s*([\w-]*)$/);
  if (value) {
    const opts = { layout: LAYOUTS, theme: THEMES, template: TEMPLATE_NAMES, imagePosition: ['left', 'right'], steps: ['true', 'false'] }[value[1]]!;
    return { from: ctx.pos - value[2].length, options: opts.map((label) => ({ label, type: 'enum' })) };
  }
  const key = before.match(/^(\w*)$/);
  if (key && (key[1] || ctx.explicit)) {
    return {
      from: line.from,
      options: Object.entries(KEYS).map(([k, info]) => ({ label: k, detail: info, type: 'property', apply: `${k}: ` })),
    };
  }
  return null;
}

function uploadAndInsert(files: FileList | File[], pos?: number) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  if (!images.length) return false;
  (async () => {
    for (const file of images) {
      try {
        const res = await fetch(`/__editor/api/upload?name=${encodeURIComponent(file.name || 'imagem.png')}`, { method: 'POST', body: file });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const at = pos ?? view.state.selection.main.head;
        const text = `![](${data.src})`;
        view.dispatch({ changes: { from: at, insert: text }, selection: { anchor: at + 2 } });
        toast(`Imagem salva em public${data.src}`);
      } catch (err) {
        toast((err as Error).message, true);
      }
    }
    view.focus();
  })();
  return true;
}

type Problem = { line: number; severity: 'error' | 'warning'; message: string };

/** Valida o frontmatter no servidor, com o mesmo schema que o Astro usa. */
async function checkFrontmatter(v: EditorView): Promise<Diagnostic[]> {
  if (!current) return [];
  const text = v.state.doc.toString();
  let problems: Problem[] = [];
  try {
    ({ diagnostics: problems } = await api<{ diagnostics: Problem[] }>(`validate?${q(current)}`, { method: 'POST', body: text }));
  } catch {
    return [];
  }
  if (v.state.doc.toString() !== text) return []; // já mudou; o próximo ciclo valida
  showProblems(problems);
  return problems.map((p) => {
    const line = v.state.doc.line(Math.min(Math.max(p.line, 1), v.state.doc.lines));
    return { from: line.from, to: line.to, severity: p.severity, message: p.message, source: 'frontmatter' };
  });
}

function showProblems(problems: Problem[]) {
  const el = $('problems');
  const errors = problems.filter((p) => p.severity === 'error');
  const first = errors[0] ?? problems[0];
  el.hidden = !first;
  if (!first) return;
  el.classList.toggle('warning', !errors.length);
  el.dataset.line = String(first.line);
  el.innerHTML = `<b>Linha ${first.line}</b> ${esc(first.message)}${
    errors.length ? '<span>O preview mostra a última versão válida.</span>' : ''
  }${problems.length > 1 ? `<i>+${problems.length - 1}</i>` : ''}`;
}

$('problems').addEventListener('click', (e) => {
  const n = Number((e.currentTarget as HTMLElement).dataset.line);
  if (!n) return;
  const line = view.state.doc.line(Math.min(n, view.state.doc.lines));
  view.dispatch({ selection: { anchor: line.to }, scrollIntoView: true });
  view.focus();
});

const extensions: Extension[] = [
  basicSetup,
  keymap.of([
    indentWithTab,
    { key: 'Mod-s', preventDefault: true, run: () => (flush(), true) },
    { key: 'Mod-PageUp', preventDefault: true, run: () => (step(-1), true) },
    { key: 'Mod-PageDown', preventDefault: true, run: () => (step(1), true) },
  ]),
  yamlFrontmatter({ content: markdown({ base: markdownLanguage, codeLanguages: languages }) }),
  EditorState.languageData.of(() => [{ autocomplete: frontmatterCompletions }]),
  oneDark,
  EditorView.lineWrapping,
  linter(checkFrontmatter, { delay: 400 }),
  EditorView.updateListener.of((u) => {
    if (!u.docChanged || !current) return;
    syncLayoutSelect();
    if (view.state.doc.toString() === saved) return setStatus('saved');
    setStatus('dirty');
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flush, 700);
  }),
  EditorView.domEventHandlers({
    drop: (e, v) => {
      if (!e.dataTransfer?.files.length) return false;
      e.preventDefault();
      const pos = v.posAtCoords({ x: e.clientX, y: e.clientY }) ?? undefined;
      return uploadAndInsert(e.dataTransfer.files, pos);
    },
    paste: (e) => {
      if (!e.clipboardData?.files.length) return false;
      e.preventDefault();
      return uploadAndInsert(e.clipboardData.files);
    },
  }),
];

const view = new EditorView({ parent: $('editor'), state: EditorState.create({ extensions }) });

/** Grava o arquivo aberto agora (se houver mudanças). */
function flush(): Promise<void> {
  clearTimeout(saveTimer);
  saving = saving.then(async () => {
    const path = current;
    const text = view.state.doc.toString();
    if (!path || text === saved) return;
    setStatus('saving');
    try {
      await api(`file?${q(path)}`, { method: 'PUT', body: text });
      if (path === current) {
        saved = text;
        setStatus(view.state.doc.toString() === saved ? 'saved' : 'dirty');
      }
    } catch (err) {
      setStatus('error');
      toast((err as Error).message, true);
    }
  });
  return saving;
}

async function openFile(path: string, keepView = false) {
  if (path !== current) await flush();
  if (editingTheme) closeTheme();
  if (editingTemplate) closeTemplate();
  const { text } = await api<{ text: string }>(`file?${q(path)}`);
  const sameFile = path === current;
  current = path;
  saved = text;
  const sel = view.state.selection.main;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection: sameFile ? { anchor: Math.min(sel.anchor, text.length), head: Math.min(sel.head, text.length) } : { anchor: 0 },
    scrollIntoView: !sameFile,
  });
  setStatus('saved');

  open.add(deckOf(path));
  renderTree();
  document.querySelector('.file.active')?.scrollIntoView({ block: 'nearest' });
  $('crumb').innerHTML = `<span>slides/${esc(deckOf(path))}/</span>${esc(fileOf(path))}`;
  $('tools').hidden = false;
  $('present').hidden = false;
  $('export').hidden = false;
  $('empty').hidden = true;
  syncLayoutSelect();
  history.replaceState(null, '', `#${path}`);
  store.set('editor:last', path);
  if (!keepView) view.focus();
  showPreview();
}

function closeFile() {
  current = null;
  saved = '';
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
  $('crumb').textContent = 'Nenhum arquivo aberto';
  $('tools').hidden = true;
  $('present').hidden = true;
  $('export').hidden = true;
  $('empty').hidden = false;
  $('problems').hidden = true;
  setStatus('idle');
  history.replaceState(null, '', location.pathname);
}

/** Abre o slide anterior/seguinte da mesma apresentação. */
function step(delta: number) {
  if (!current) return;
  const files = visible(deckOf(current));
  const i = Math.max(0, files.indexOf(fileOf(current)));
  const next = files[Math.min(files.length - 1, Math.max(0, i + delta))];
  if (next && next !== fileOf(current)) openFile(`${deckOf(current)}/${next}`);
}
$('prev').addEventListener('click', () => step(-1));
$('next').addEventListener('click', () => step(1));

// ── Layout no frontmatter ──

$('layout').innerHTML = LAYOUTS.map((l) => `<option value="${l}">${l}</option>`).join('');

function frontmatter() {
  const doc = view.state.doc;
  if (doc.lines < 2 || doc.line(1).text.trim() !== '---') return null;
  for (let n = 2; n <= doc.lines; n++) if (doc.line(n).text.trim() === '---') return { start: 1, end: n };
  return null;
}

function syncLayoutSelect() {
  const fm = frontmatter();
  let layout = 'default';
  if (fm) {
    for (let n = fm.start + 1; n < fm.end; n++) {
      const m = view.state.doc.line(n).text.match(/^layout:\s*["']?(\w+)/);
      if (m) layout = m[1];
    }
  }
  $<HTMLSelectElement>('layout').value = layout;
}

$('layout').addEventListener('change', (e) => {
  const value = (e.target as HTMLSelectElement).value;
  const doc = view.state.doc;
  const fm = frontmatter();
  if (!fm) {
    view.dispatch({ changes: { from: 0, insert: `---\nlayout: ${value}\n---\n\n` } });
  } else {
    let line = null;
    for (let n = fm.start + 1; n < fm.end; n++) if (/^layout:/.test(doc.line(n).text)) line = doc.line(n);
    view.dispatch({
      changes: line
        ? { from: line.from, to: line.to, insert: `layout: ${value}` }
        : { from: doc.line(fm.start).to, insert: `\nlayout: ${value}` },
    });
  }
  view.focus();
});

// ── Menu Inserir ──

const menu = $('insert-menu');
menu.innerHTML = SNIPPETS.map((s, i) => `<button data-i="${i}">${s.label}</button>`).join('');
$('insert-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  menu.hidden = !menu.hidden;
});
document.addEventListener('click', () => (menu.hidden = true));
menu.addEventListener('click', (e) => {
  const i = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')?.dataset.i;
  if (i === undefined) return;
  const text = SNIPPETS[+i].text;
  const { from, to } = view.state.selection.main;
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
  view.focus();
});

// ── Exportar ──

const exportMenu = $('export-menu');
$('export-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  menu.hidden = true;
  exportMenu.hidden = !exportMenu.hidden;
});
document.addEventListener('click', () => (exportMenu.hidden = true));
$('insert-btn').addEventListener('click', () => (exportMenu.hidden = true));

// Sem Chrome/Chromium no computador, só a impressão pelo navegador funciona.
api<{ browser: boolean }>('export?check').then(({ browser }) => {
  if (browser) return;
  for (const kind of ['pdf', 'png']) {
    const b = exportMenu.querySelector<HTMLButtonElement>(`[data-export="${kind}"]`)!;
    b.disabled = true;
    b.querySelector('small')!.textContent = 'Precisa do Chrome ou Chromium instalado (ou CHROME_PATH)';
  }
}).catch(() => {});

exportMenu.addEventListener('click', async (e) => {
  const kind = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-export]')?.dataset.export;
  if (!kind || !current) return;
  const deck = deckOf(current);
  await flush();
  if (kind === 'print') {
    window.open(`/${deck}/?print`, '_blank');
    return;
  }
  const slide = Math.max(0, indexOf(current));
  const wrap = $('export');
  wrap.classList.add('busy');
  toast(kind === 'pdf' ? `Gerando PDF de ${visible(deck).length} slides…` : 'Gerando PNG…');
  try {
    const res = await fetch(`/__editor/api/export?deck=${encodeURIComponent(deck)}&format=${kind}&slide=${slide}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
    const name = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? `${deck}.${kind}`;
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await res.blob()), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast(`${name} baixado`);
  } catch (err) {
    toast(`Não deu para exportar: ${(err as Error).message}`, true);
  } finally {
    wrap.classList.remove('busy');
  }
});

$('image-btn').addEventListener('click', () => $('image-input').click());
$<HTMLInputElement>('image-input').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.files) uploadAndInsert(input.files);
  input.value = '';
});

// ───────────────────────── preview ─────────────────────────

const iframe = $<HTMLIFrameElement>('preview');

function showPreview() {
  if (!current) return;
  const deck = deckOf(current);
  const i = indexOf(current);
  $('draft-note').hidden = i >= 0;
  $<HTMLAnchorElement>('present').href = `/${deck}/#${Math.max(0, i) + 1}`;
  updatePreviewBar();
  if (i < 0) return;
  if (deck !== previewDeck || !previewReady) {
    retries = 0;
    previewDeck = deck;
    previewReady = false;
    iframe.src = `/${deck}/?embed#${i + 1}`;
  } else {
    iframe.contentWindow?.postMessage({ type: 'editor:go', index: i }, '*');
  }
}

function updatePreviewBar() {
  if (!current) return ($('slide-count').textContent = '—');
  const i = indexOf(current);
  $('slide-count').textContent = i < 0 ? 'rascunho' : `${i + 1} / ${visible(deckOf(current)).length}`;
}

// O Astro leva um instante para registrar pastas/arquivos novos; se o preview
// chegar antes (404 ou com slides a menos), tenta de novo algumas vezes.
let retries = 0;
let retryTimer: number | undefined;
function previewIsStale() {
  if (!previewDeck) return false;
  let doc: Document | null = null;
  try { doc = iframe.contentDocument; } catch {}
  if (!doc) return false;
  const stage = doc.getElementById('stage');
  if (!stage) return !doc.querySelector('vite-error-overlay'); // 404 (não erro de compilação)
  return Number(stage.dataset.count) < visible(previewDeck).length;
}

iframe.addEventListener('load', () => {
  clearTimeout(retryTimer);
  if (previewIsStale() && retries < 10) {
    retries++;
    retryTimer = window.setTimeout(() => iframe.contentWindow?.location.reload(), 400 + retries * 200);
    return;
  }
  retries = 0;
  previewReady = true;
  if (editingTheme) return postTheme();
  if (editingTemplate) return;
  // Depois de um recarregamento (o Astro recarrega a cada salvamento), garante o slide certo.
  if (current && deckOf(current) === previewDeck && indexOf(current) >= 0) {
    iframe.contentWindow?.postMessage({ type: 'editor:go', index: indexOf(current) }, '*');
  }
});

// Navegou no preview (setas/clique)? Abre o arquivo correspondente.
window.addEventListener('message', (e) => {
  if (e.source !== iframe.contentWindow || e.data?.type !== 'deck:slide' || !current) return;
  if (deckOf(current) !== previewDeck) return;
  const file = visible(previewDeck)[e.data.index];
  if (file && file !== fileOf(current)) openFile(`${previewDeck}/${file}`, true);
});

// Ajusta a escala do slide de 1920×1080 dentro do quadro
const frame = $('frame');
new ResizeObserver(([e]) => {
  const { width, height } = e.contentRect;
  const s = Math.min(width / 1920, height / 1080);
  iframe.style.width = `${1920 * s}px`;
  iframe.style.height = `${1080 * s}px`;
}).observe(frame);

// ── Divisória arrastável ──

const main = $('main');
const setSplit = (px: number) => main.style.setProperty('--preview-w', `${Math.round(px)}px`);
const savedSplit = Number(store.get('editor:split'));
if (savedSplit) setSplit(savedSplit);
$('gutter').addEventListener('pointerdown', (e) => {
  const gutter = e.currentTarget as HTMLElement;
  gutter.setPointerCapture(e.pointerId);
  main.classList.add('dragging');
  const move = (ev: PointerEvent) => {
    const w = Math.min(Math.max(window.innerWidth - ev.clientX, 280), window.innerWidth - 520);
    setSplit(w);
    store.set('editor:split', String(Math.round(w)));
  };
  const up = () => {
    main.classList.remove('dragging');
    gutter.removeEventListener('pointermove', move);
  };
  gutter.addEventListener('pointermove', move);
  gutter.addEventListener('pointerup', up, { once: true });
});

// ───────────────────────── temas ─────────────────────────

type ThemeItem = { name: string; builtin: boolean };
let themes: ThemeItem[] = [];
let editingTheme: string | null = null;
let themeData: ThemeFile | null = null;
let themeDeck: string | null = null; // apresentação usada para visualizar o tema
let themeTimer: number | undefined;
const panel = $<HTMLFormElement>('theme-panel');

const COLOR_FIELDS: [keyof ThemeFile['colors'], string, string][] = [
  ['background', 'Fundo', ''],
  ['text', 'Texto', ''],
  ['muted', 'Texto secundário', 'subtítulos, rodapé'],
  ['accent', 'Destaque', 'negrito, marcadores e luzes do fundo'],
  ['accent2', 'Destaque 2', 'gradiente dos títulos'],
  ['accent3', 'Destaque 3', 'gradiente dos títulos'],
];
const BG_LABELS: Record<string, string> = { aurora: 'Aurora', paper: 'Papel', noir: 'Pontos', sunset: 'Pôr do sol', plain: 'Liso' };
const FONT_LABELS: Record<string, string> = { sans: 'Sem serifa', serif: 'Serifada', mono: 'Mono' };

async function refreshThemes() {
  themes = await api<ThemeItem[]>('themes');
  THEMES = themes.map((t) => t.name);
  renderThemes();
}

function renderThemes() {
  $('theme-list').innerHTML = themes
    .map((t) => `<div class="theme-item${t.builtin ? ' builtin' : ''}${t.name === editingTheme ? ' active' : ''}" data-theme-name="${esc(t.name)}">
      <span class="label">${esc(t.name)}</span>
      ${t.builtin
        ? `<span class="tag">pronto</span><button class="icon" data-act="copy" title="Criar um tema a partir deste">${ICONS.plus}</button>`
        : `<button class="icon" data-act="delete-theme" title="Excluir tema">${ICONS.trash}</button>`}
    </div>`)
    .join('');
}

async function newTheme(base = editingTheme ?? 'aurora') {
  const r = await ask('Novo tema', {
    text: 'Nome do tema (vira themes/<nome>.yaml) e o tema de partida.',
    value: 'meu-tema',
    choices: [base, ...THEMES.filter((t) => t !== base)],
    ok: 'Criar',
  });
  if (!r?.value) return;
  try {
    const { name } = await api('theme', { method: 'POST', json: { name: r.value, base: r.choice } });
    await refreshThemes();
    await openTheme(name);
  } catch (err) {
    toast((err as Error).message, true);
  }
}

$('new-theme').addEventListener('click', () => newTheme());

$('theme-list').addEventListener('click', async (e) => {
  const el = e.target as HTMLElement;
  const name = el.closest<HTMLElement>('[data-theme-name]')?.dataset.themeName;
  if (!name) return;
  const act = el.closest<HTMLElement>('[data-act]')?.dataset.act;
  const item = themes.find((t) => t.name === name)!;
  if (act === 'delete-theme') {
    const r = await ask('Excluir tema?', { text: `themes/${name}.yaml será apagado. Slides que usam "${name}" voltam ao tema padrão.`, ok: 'Excluir', danger: true });
    if (!r) return;
    await api(`theme?name=${encodeURIComponent(name)}`, { method: 'DELETE' }).catch((err) => toast(err.message, true));
    if (editingTheme === name) closeTheme(true);
    await refreshThemes();
  } else if (item.builtin) {
    newTheme(name);
  } else {
    openTheme(name);
  }
});

async function openTheme(name: string) {
  await flush();
  if (editingTheme) closeTheme(); // salva o que estiver pendente
  if (editingTemplate) closeTemplate();
  let data: ThemeFile;
  try {
    ({ theme: data } = await api<{ theme: ThemeFile }>(`theme?name=${encodeURIComponent(name)}`));
  } catch (err) {
    return toast(`themes/${name}.yaml: ${(err as Error).message}`, true);
  }
  themeDeck = current ? deckOf(current) : themeDeck ?? (decks.find((d) => d.name === 'exemplo') ?? decks[0])?.name ?? null;
  if (current) closeFile();
  editingTheme = name;
  themeData = data;

  $('editor').hidden = true;
  $('empty').hidden = true;
  panel.hidden = false;
  $('crumb').innerHTML = `<span>themes/</span>${esc(name)}.yaml`;
  setStatus('saved');
  history.replaceState(null, '', `#tema:${name}`);
  renderThemePanel();
  renderThemes();

  $('draft-note').hidden = true;
  $('slide-count').textContent = themeDeck ? `prévia: ${themeDeck}` : '—';
  if (!themeDeck) return;
  if (previewDeck !== themeDeck || !previewReady) {
    previewDeck = themeDeck;
    previewReady = false;
    retries = 0;
    iframe.src = `/${themeDeck}/?embed#1`;
  } else postTheme();
}

/** Sai do modo tema. `reset`: volta para a tela vazia. */
function closeTheme(reset = false) {
  clearTimeout(themeTimer);
  if (themeTimer !== undefined && editingTheme && themeData) saveTheme(editingTheme, themeData);
  editingTheme = null;
  themeData = null;
  panel.hidden = true;
  $('editor').hidden = false;
  previewReady = false; // recarrega o preview sem o tema provisório
  renderThemes();
  if (reset) {
    closeFile();
    iframe.removeAttribute('src');
  }
}

function postTheme() {
  if (!editingTheme || !themeData) return;
  iframe.contentWindow?.postMessage(
    { type: 'editor:theme', name: editingTheme, css: themeCss(editingTheme, themeData), background: themeData.background, mode: themeData.mode },
    '*',
  );
}

async function saveTheme(name: string, data: ThemeFile) {
  themeTimer = undefined;
  setStatus('saving');
  try {
    await api(`theme?name=${encodeURIComponent(name)}`, { method: 'PUT', json: data });
    if (name === editingTheme) setStatus('saved');
  } catch (err) {
    setStatus('error');
    toast((err as Error).message, true);
  }
}

function themeChanged() {
  if (!editingTheme || !themeData) return;
  postTheme();
  setStatus('dirty');
  clearTimeout(themeTimer);
  const [name, data] = [editingTheme, structuredClone(themeData)];
  themeTimer = window.setTimeout(() => saveTheme(name, data), 600);
}

const radios = (key: string, options: readonly string[], labels: Record<string, string>, current: string) =>
  `<div class="seg" role="radiogroup">${options
    .map((o) => `<label class="seg-opt seg-${key}-${o}"><input type="radio" name="${key}" value="${o}"${o === current ? ' checked' : ''} /><span>${labels[o] ?? o}</span></label>`)
    .join('')}</div>`;

function renderThemePanel() {
  const t = themeData!;
  panel.innerHTML = `
    <header class="tp-head">
      <div>
        <h2>${esc(editingTheme!)}</h2>
        <p>Use com <code>theme: ${esc(editingTheme!)}</code> no primeiro slide. Fica em <code>themes/${esc(editingTheme!)}.yaml</code>.</p>
      </div>
      ${themeDeck ? `<button type="button" class="btn primary" id="apply-theme">Usar em ${esc(themeDeck)}</button>` : ''}
    </header>

    <section>
      <h3>Cores</h3>
      <div class="colors">
        ${COLOR_FIELDS.map(([k, label, hint]) => `
          <label class="color">
            <input type="color" data-color="${k}" value="${t.colors[k]}" />
            <span><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span>
            <input type="text" class="hex" data-hex="${k}" value="${t.colors[k]}" maxlength="7" spellcheck="false" />
          </label>`).join('')}
      </div>
    </section>

    <section>
      <h3>Modo</h3>
      ${radios('mode', ['dark', 'light'], { dark: 'Escuro', light: 'Claro' }, t.mode)}
    </section>

    <section>
      <h3>Fonte dos títulos</h3>
      ${radios('font', fonts, FONT_LABELS, t.font)}
    </section>

    <section>
      <h3>Fundo</h3>
      ${radios('background', backgrounds, BG_LABELS, t.background)}
    </section>

    <section class="ranges">
      <label><span>Cantos <output id="corners-out">${t.corners}px</output></span>
        <input type="range" name="corners" min="0" max="60" step="1" value="${t.corners}" /></label>
      <label><span>Granulado <output id="grain-out">${t.grain}</output></span>
        <input type="range" name="grain" min="0" max="0.3" step="0.01" value="${t.grain}" /></label>
    </section>
  `;
}

panel.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  const t = themeData;
  if (!t) return;
  if (el.dataset.color) {
    const k = el.dataset.color as keyof ThemeFile['colors'];
    t.colors[k] = el.value;
    panel.querySelector<HTMLInputElement>(`[data-hex="${k}"]`)!.value = el.value;
  } else if (el.dataset.hex) {
    const v = el.value.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
    const k = el.dataset.hex as keyof ThemeFile['colors'];
    t.colors[k] = v.toLowerCase();
    panel.querySelector<HTMLInputElement>(`[data-color="${k}"]`)!.value = v.toLowerCase();
  } else if (el.name === 'corners') {
    t.corners = Number(el.value);
    $('corners-out').textContent = `${el.value}px`;
  } else if (el.name === 'grain') {
    t.grain = Number(el.value);
    $('grain-out').textContent = el.value;
  } else if (el.name === 'mode' || el.name === 'font' || el.name === 'background') {
    (t as any)[el.name] = el.value;
  } else return;
  themeChanged();
});
panel.addEventListener('submit', (e) => e.preventDefault());

// "Usar em <apresentação>": grava theme: <nome> no primeiro slide.
panel.addEventListener('click', async (e) => {
  if (!(e.target as HTMLElement).closest('#apply-theme') || !themeDeck || !editingTheme) return;
  const first = visible(themeDeck)[0];
  if (!first) return;
  const path = `${themeDeck}/${first}`;
  try {
    let { text } = await api<{ text: string }>(`file?${q(path)}`);
    const line = `theme: ${editingTheme}`;
    if (/^---\r?\n/.test(text)) {
      const end = text.indexOf('\n---', 3);
      const head = text.slice(0, end);
      text = /^theme:.*$/m.test(head)
        ? head.replace(/^theme:.*$/m, line) + text.slice(end)
        : text.replace(/^---\r?\n/, `---\n${line}\n`);
    } else text = `---\n${line}\n---\n\n${text}`;
    await api(`file?${q(path)}`, { method: 'PUT', body: text });
    toast(`${themeDeck} agora usa o tema ${editingTheme}`);
  } catch (err) {
    toast((err as Error).message, true);
  }
});

async function onThemeFileChange(name: string) {
  await refreshThemes();
  if (name !== editingTheme) return;
  if (!themes.some((t) => t.name === name)) {
    toast(`themes/${name}.yaml foi removido.`, true);
    return closeTheme(true);
  }
  if (themeTimer !== undefined) return; // há alterações nossas para salvar
  try {
    const { theme } = await api<{ theme: ThemeFile }>(`theme?name=${encodeURIComponent(name)}`);
    if (JSON.stringify(theme) === JSON.stringify(themeData)) return; // eco do nosso salvamento
    themeData = theme;
    renderThemePanel();
    postTheme();
    toast('Tema recarregado do disco');
  } catch (err) {
    toast(`themes/${name}.yaml: ${(err as Error).message}`, true);
  }
}

// ───────────────────────── templates ─────────────────────────
// Um template (templates/<nome>/) é o padrão de uma instituição: logo, rodapé,
// tema, tamanho das fontes, animações e os slides iniciais.

type TemplateFile = {
  name?: string;
  theme?: string;
  lockTheme: boolean;
  logo?: string;
  logoPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  logoSize: number;
  logoOnCover: boolean;
  footer: string;
  slideNumbers: boolean;
  textSize: number;
  titleSize: number;
  animations: boolean;
};
type TemplateItem = { name: string; title?: string; error?: string };

let templates: TemplateItem[] = [];
let editingTemplate: string | null = null;
let templateData: TemplateFile | null = null;
let templateMeta = { slides: [] as string[], logoUrl: null as string | null };
let templateDeck: string | null = null; // apresentação usada para visualizar o template
let templateTimer: number | undefined;
const tplPanel = $<HTMLFormElement>('template-panel');

const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
const POS_LABELS: Record<string, string> = {
  'top-left': '↖ Em cima, à esquerda',
  'top-right': '↗ Em cima, à direita',
  'bottom-left': '↙ Embaixo, à esquerda',
  'bottom-right': '↘ Embaixo, à direita',
};
const pct = (n: number) => `${Math.round(n * 100)}%`;

async function refreshTemplates() {
  templates = await api<TemplateItem[]>('templates');
  TEMPLATE_NAMES = templates.map((t) => t.name);
  renderTemplates();
}

function renderTemplates() {
  $('template-list').innerHTML = templates.length
    ? templates
        .map((t) => `<div class="theme-item${t.error ? ' broken' : ''}${t.name === editingTemplate ? ' active' : ''}" data-template-name="${esc(t.name)}" title="${esc(t.error ?? `templates/${t.name}/`)}">
          <span class="label">${esc(t.title ?? t.name)}</span>
          <button class="icon" data-act="copy-template" title="Criar um template a partir deste">${ICONS.plus}</button>
          <button class="icon" data-act="delete-template" title="Excluir template">${ICONS.trash}</button>
        </div>`)
        .join('')
    : '<p class="side-tip">Nenhum template. Um template fixa logo, rodapé, fontes e animações para todas as apresentações de uma instituição.</p>';
}

async function newTemplate(base?: string) {
  const r = await ask('Novo template', {
    text: base
      ? `Uma cópia de templates/${base}/ (com logo e slides iniciais).`
      : 'Nome da pasta em templates/. Depois escolha logo, rodapé, fontes e animações.',
    value: base ? `${base}-copia` : 'minha-instituicao',
    ok: 'Criar',
  });
  if (!r?.value) return;
  try {
    const { name } = await api('template', { method: 'POST', json: { name: r.value, base } });
    await refreshTemplates();
    await openTemplate(name);
  } catch (err) {
    toast((err as Error).message, true);
  }
}

$('new-template').addEventListener('click', () => newTemplate());
$('workspace').addEventListener('click', () => api('reveal', { method: 'POST' }).catch((err) => toast(err.message, true)));

$('template-list').addEventListener('click', async (e) => {
  const el = e.target as HTMLElement;
  const name = el.closest<HTMLElement>('[data-template-name]')?.dataset.templateName;
  if (!name) return;
  const act = el.closest<HTMLElement>('[data-act]')?.dataset.act;
  if (act === 'copy-template') return newTemplate(name);
  if (act === 'delete-template') {
    const r = await ask('Excluir template?', {
      text: `A pasta templates/${name}/ (logo e slides iniciais incluídos) será apagada. Apresentações que usam "${name}" ficam sem template.`,
      ok: 'Excluir',
      danger: true,
    });
    if (!r) return;
    await api(`template?name=${encodeURIComponent(name)}`, { method: 'DELETE' }).catch((err) => toast(err.message, true));
    if (editingTemplate === name) closeTemplate(true);
    return refreshTemplates();
  }
  openTemplate(name);
});

async function loadTemplate(name: string) {
  const r = await api<{ template: TemplateFile; slides: string[]; logoUrl: string | null }>(`template?name=${encodeURIComponent(name)}`);
  templateMeta = { slides: r.slides, logoUrl: r.logoUrl };
  return r.template;
}

async function openTemplate(name: string) {
  await flush();
  if (editingTheme) closeTheme();
  if (editingTemplate) closeTemplate();
  let data: TemplateFile;
  try {
    data = await loadTemplate(name);
  } catch (err) {
    return toast(`templates/${name}/template.yaml: ${(err as Error).message}`, true);
  }
  templateDeck = current ? deckOf(current) : templateDeck ?? (decks.find((d) => d.name === 'exemplo') ?? decks[0])?.name ?? null;
  if (current) closeFile();
  editingTemplate = name;
  templateData = data;

  $('editor').hidden = true;
  $('empty').hidden = true;
  tplPanel.hidden = false;
  $('crumb').innerHTML = `<span>templates/${esc(name)}/</span>template.yaml`;
  setStatus('saved');
  history.replaceState(null, '', `#template:${name}`);
  renderTemplatePanel();
  renderTemplates();

  $('draft-note').hidden = true;
  $('slide-count').textContent = templateDeck ? `prévia: ${templateDeck}` : '—';
  if (!templateDeck) return;
  // Página só do servidor de desenvolvimento: a apresentação com este template aplicado.
  previewDeck = templateDeck;
  previewReady = false;
  retries = 0;
  iframe.src = `/template-preview/${name}/${templateDeck}/?embed#1`;
}

/** Sai do modo template. `reset`: volta para a tela vazia. */
function closeTemplate(reset = false) {
  clearTimeout(templateTimer);
  if (templateTimer !== undefined && editingTemplate && templateData) saveTemplate(editingTemplate, templateData);
  editingTemplate = null;
  templateData = null;
  tplPanel.hidden = true;
  $('editor').hidden = false;
  previewReady = false; // o preview volta para a apresentação sem o template provisório
  renderTemplates();
  if (reset) {
    closeFile();
    iframe.removeAttribute('src');
  }
}

async function saveTemplate(name: string, data: TemplateFile) {
  templateTimer = undefined;
  setStatus('saving');
  try {
    await api(`template?name=${encodeURIComponent(name)}`, { method: 'PUT', json: data });
    if (name === editingTemplate) setStatus('saved');
    const item = templates.find((t) => t.name === name);
    if (item && item.title !== data.name) {
      item.title = data.name;
      renderTemplates();
    }
  } catch (err) {
    setStatus('error');
    toast((err as Error).message, true);
  }
}

/** Salva pouco depois de mexer (o preview recarrega sozinho quando o arquivo muda). */
function templateChanged(delay = 500) {
  if (!editingTemplate || !templateData) return;
  setStatus('dirty');
  clearTimeout(templateTimer);
  const [name, data] = [editingTemplate, structuredClone(templateData)];
  templateTimer = window.setTimeout(() => saveTemplate(name, data), delay);
}

const checked = (on: boolean) => (on ? ' checked' : '');

function renderTemplatePanel() {
  const t = templateData!;
  const n = esc(editingTemplate!);
  const { slides, logoUrl } = templateMeta;
  tplPanel.innerHTML = `
    <header class="tp-head">
      <div>
        <h2 id="tpl-title">${esc(t.name || editingTemplate!)}</h2>
        <p>Use com <code>template: ${n}</code> no primeiro slide. Fica em <code>templates/${n}/</code>: copie a pasta para compartilhar com outras pessoas.</p>
      </div>
      ${templateDeck ? `<button type="button" class="btn primary" id="apply-template">Usar em ${esc(templateDeck)}</button>` : ''}
    </header>

    <section>
      <h3>Nome</h3>
      <label class="field">
        <input type="text" name="name" value="${esc(t.name ?? '')}" placeholder="Ex.: Universidade Federal de …" />
        <small>Aparece na lista de templates e na página inicial.</small>
      </label>
    </section>

    <section>
      <h3>Logo</h3>
      <div class="logo-box">
        <div class="logo-prev">${logoUrl ? `<img src="${esc(logoUrl)}?v=${Date.now()}" alt="" />` : 'sem logo'}</div>
        <button type="button" class="btn" id="logo-upload">${t.logo ? 'Trocar logo' : 'Enviar logo'}</button>
        ${t.logo ? '<button type="button" class="btn" id="logo-remove">Remover</button>' : ''}
      </div>
      ${t.logo ? `
        <div class="fields" style="margin-top: 14px">
          ${radios('logoPosition', POSITIONS, POS_LABELS, t.logoPosition)}
          <div class="ranges">
            <label><span>Altura <output id="logoSize-out">${t.logoSize}px</output></span>
              <input type="range" name="logoSize" min="24" max="300" step="2" value="${t.logoSize}" /></label>
          </div>
          <label class="check"><input type="checkbox" name="logoOnCover"${checked(t.logoOnCover)} /> Mostrar também na capa</label>
        </div>` : ''}
    </section>

    <section>
      <h3>Tema</h3>
      <div class="fields">
        <label class="field">
          <select name="theme">${['', ...THEMES].map((o) => `<option value="${esc(o)}"${o === (t.theme ?? '') ? ' selected' : ''}>${o ? esc(o) : '— nenhum: cada apresentação escolhe'}</option>`).join('')}</select>
        </label>
        <label class="check"><input type="checkbox" name="lockTheme"${checked(t.lockTheme)} /> Travar o tema <small>o <code>theme</code> dos slides é ignorado</small></label>
      </div>
    </section>

    <section>
      <h3>Rodapé</h3>
      <div class="fields">
        <label class="field">
          <input type="text" name="footer" value="${esc(t.footer)}" placeholder="vazio = sem texto" />
          <small><code>{title}</code> vira o nome da apresentação.</small>
        </label>
        <label class="check"><input type="checkbox" name="slideNumbers"${checked(t.slideNumbers)} /> Numerar os slides</label>
      </div>
    </section>

    <section>
      <h3>Tamanho das letras</h3>
      <div class="ranges">
        <label><span>Texto <output id="textSize-out">${pct(t.textSize)}</output></span>
          <input type="range" name="textSize" min="0.6" max="1.6" step="0.05" value="${t.textSize}" /></label>
        <label><span>Títulos <output id="titleSize-out">${pct(t.titleSize)}</output></span>
          <input type="range" name="titleSize" min="0.6" max="1.6" step="0.05" value="${t.titleSize}" /></label>
      </div>
    </section>

    <section>
      <h3>Animações</h3>
      <label class="check"><input type="checkbox" name="animations"${checked(t.animations)} /> Transições entre slides e itens revelados aos poucos <small>desligado: tudo aparece de uma vez</small></label>
    </section>

    <section>
      <h3>Slides iniciais</h3>
      <div class="starters">
        <p>${slides.length
          ? `${slides.length} ${slides.length === 1 ? 'slide copiado' : 'slides copiados'} para cada apresentação nova criada com este template.`
          : 'Nenhum: apresentações novas com este template começam só com uma capa.'}</p>
        ${templateDeck ? `<button type="button" class="btn" id="save-starters">Usar os slides de ${esc(templateDeck)}</button>` : ''}
      </div>
    </section>
  `;
}

tplPanel.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  const t = templateData;
  if (!t || !el.name) return;
  let delay = 500;
  switch (el.name) {
    case 'name':
      t.name = el.value.trim() || undefined;
      $('tpl-title').textContent = t.name || editingTemplate!;
      delay = 900;
      break;
    case 'footer':
      t.footer = el.value;
      delay = 900;
      break;
    case 'theme':
      t.theme = el.value || undefined;
      break;
    case 'logoPosition':
      t.logoPosition = el.value as TemplateFile['logoPosition'];
      break;
    case 'logoSize':
      t.logoSize = Number(el.value);
      $('logoSize-out').textContent = `${el.value}px`;
      break;
    case 'textSize':
    case 'titleSize':
      (t as any)[el.name] = Number(el.value);
      $(`${el.name}-out`).textContent = pct(Number(el.value));
      break;
    case 'lockTheme':
    case 'logoOnCover':
    case 'slideNumbers':
    case 'animations':
      (t as any)[el.name] = el.checked;
      break;
    default:
      return;
  }
  templateChanged(delay);
});
tplPanel.addEventListener('submit', (e) => e.preventDefault());

tplPanel.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[id]');
  const name = editingTemplate;
  if (!btn || !name || !templateData) return;
  try {
    if (btn.id === 'logo-upload') {
      $('logo-input').click();
    } else if (btn.id === 'logo-remove') {
      templateData.logo = undefined;
      templateMeta.logoUrl = null;
      renderTemplatePanel();
      templateChanged(0);
    } else if (btn.id === 'apply-template' && templateDeck) {
      await api('use-template', { method: 'POST', json: { name, deck: templateDeck } });
      toast(`${templateDeck} agora usa o template ${templateData.name ?? name}`);
    } else if (btn.id === 'save-starters' && templateDeck) {
      const r = await ask('Trocar os slides iniciais?', {
        text: `Os slides de slides/${templateDeck}/ serão copiados para templates/${name}/ e substituem os atuais. Apresentações novas com este template começam com eles.`,
        ok: 'Copiar slides',
      });
      if (!r) return;
      const { slides } = await api('template-slides', { method: 'POST', json: { name, deck: templateDeck } });
      templateMeta.slides = (await api(`template?name=${encodeURIComponent(name)}`)).slides;
      renderTemplatePanel();
      toast(`${slides} slides copiados para o template`);
    }
  } catch (err) {
    toast((err as Error).message, true);
  }
});

$<HTMLInputElement>('logo-input').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  const name = editingTemplate;
  if (!file || !name) return;
  // Alterações pendentes primeiro, para o servidor não sobrescrevê-las.
  if (templateTimer !== undefined && templateData) {
    clearTimeout(templateTimer);
    await saveTemplate(name, templateData);
  }
  try {
    const res = await fetch(`/__editor/api/template-logo?name=${encodeURIComponent(name)}&file=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (name !== editingTemplate) return;
    templateData = await loadTemplate(name);
    renderTemplatePanel();
    toast(`Logo salva em templates/${name}/${data.logo}`);
  } catch (err) {
    toast((err as Error).message, true);
  }
});

async function onTemplateFileChange(name: string) {
  await refreshTemplates();
  if (name !== editingTemplate) return;
  if (!TEMPLATE_NAMES.includes(name)) {
    toast(`templates/${name}/ foi removido.`, true);
    return closeTemplate(true);
  }
  if (templateTimer !== undefined) return; // há alterações nossas para salvar
  try {
    const before = JSON.stringify([templateData, templateMeta.slides]);
    const data = await loadTemplate(name);
    if (JSON.stringify([data, templateMeta.slides]) === before) return; // eco do nosso salvamento
    templateData = data;
    renderTemplatePanel();
  } catch (err) {
    toast(`templates/${name}/template.yaml: ${(err as Error).message}`, true);
  }
}

// ───────────────────────── mudanças no disco ─────────────────────────

let treeTimer: number | undefined;
const events = new EventSource('/__editor/api/events');
events.onmessage = async (e) => {
  const { kind, path } = JSON.parse(e.data) as { kind: string; path: string };
  if (kind === 'themes') return onThemeFileChange(path);
  if (kind === 'templates') return onTemplateFileChange(path);
  if (kind !== 'change') {
    clearTimeout(treeTimer);
    treeTimer = window.setTimeout(async () => {
      await refreshTree();
      if (current && !decks.some((d) => d.name === deckOf(current!) && d.files.includes(fileOf(current!)))) {
        toast(`${current} foi removido do disco.`, true);
        closeFile();
      } else if (current) showPreview();
    }, 150);
    return;
  }
  if (path !== current) return;
  await saving;
  const { text } = await api<{ text: string }>(`file?${q(path)}`);
  if (text === saved) return; // eco do nosso próprio salvamento
  if (view.state.doc.toString() !== saved) {
    const r = await ask('Arquivo alterado fora do editor', {
      text: `slides/${path} mudou no disco e você tem alterações não salvas aqui. Carregar a versão do disco?`,
      ok: 'Carregar do disco',
    });
    if (!r) return;
  }
  await openFile(path, true);
  toast('Recarregado do disco');
};

window.addEventListener('beforeunload', (e) => {
  if (templateTimer !== undefined && editingTemplate && templateData) {
    saveTemplate(editingTemplate, templateData);
    e.preventDefault();
  }
  if (themeTimer !== undefined && editingTheme && themeData) {
    saveTheme(editingTheme, themeData);
    e.preventDefault();
  }
  if (current && view.state.doc.toString() !== saved) {
    flush();
    e.preventDefault();
  }
});

// ───────────────────────── início ─────────────────────────

(async () => {
  await Promise.all([refreshTree(), refreshThemes(), refreshTemplates()]);
  api<{ workspace: string; shown: string }>('info').then(({ workspace, shown }) => {
    $('workspace-path').textContent = shown;
    $('workspace').title = `${workspace}\nAbrir a pasta no gerenciador de arquivos`;
    $('workspace').hidden = false;
  });
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith('tema:') && themes.some((t) => t.name === hash.slice(5) && !t.builtin)) return openTheme(hash.slice(5));
  if (hash.startsWith('template:') && TEMPLATE_NAMES.includes(hash.slice(9))) return openTemplate(hash.slice(9));
  const all = decks.flatMap((d) => d.files.map((f) => `${d.name}/${f}`));
  const wanted = [hash, store.get('editor:last') ?? ''].find((p) => all.includes(p));
  if (wanted) await openFile(wanted);
  else if (decks[0]) {
    open.add(decks[0].name);
    renderTree();
  }
})().catch((err) => toast(err.message, true));
