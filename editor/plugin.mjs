// Editor de slides no navegador — só existe no `npm run dev`.
// Abre em http://localhost:4321/__editor/
import { readFile, writeFile, readdir, mkdir, rm, rename, stat, cp, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative, sep, extname, basename } from 'node:path';
import yaml from 'js-yaml';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { capture, findBrowser, imagesToPdf } from './export.mjs';
import { APP, WORKSPACE, TEMPLATE_FILES } from '../workspace.mjs';

// Conteúdo na área de trabalho (o projeto ou a pasta do comando `libreslide`).
const SLIDES = resolve(WORKSPACE, 'slides');
const IMG = resolve(WORKSPACE, 'public/img');
const THEMES = resolve(WORKSPACE, 'themes');
const TEMPLATES = resolve(WORKSPACE, 'templates');
const HTML = resolve(APP, 'editor/index.html');
const API = '/__editor/api/';

const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true });

const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');

/** Caminho "deck/arquivo.md" → caminho absoluto dentro de slides/, ou erro. */
function slidePath(p) {
  const abs = resolve(SLIDES, String(p ?? ''));
  const rel = relative(SLIDES, abs);
  if (!rel || rel.startsWith('..') || rel.split(sep).length !== 2 || extname(abs) !== '.md') {
    throw new HttpError(400, `Caminho inválido: ${p}`);
  }
  return abs;
}

function deckPath(name) {
  const abs = resolve(SLIDES, String(name ?? ''));
  if (relative(SLIDES, abs).split(sep).length !== 1 || !slugify(name) || slugify(name) !== name) {
    throw new HttpError(400, `Nome de apresentação inválido: ${name}`);
  }
  return abs;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function tree() {
  const decks = [];
  for (const d of (await readdir(SLIDES, { withFileTypes: true })).filter((d) => d.isDirectory())) {
    const files = (await readdir(join(SLIDES, d.name))).filter((f) => f.endsWith('.md')).sort(byName);
    decks.push({ name: d.name, files });
  }
  return decks.sort((a, b) => byName(a.name, b.name));
}

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

const cover = (title, line) => `---
layout: cover
${line}
kicker: Apresentação
title: ${title}
subtitle: Um subtítulo que explica a ideia em uma frase.
author: Seu Nome
date: ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
---
`;

const blank = (title) => `---
title: ${title}
---

- Primeiro ponto
- Segundo ponto
`;

// Mesma regra do Astro (@astrojs/internal-helpers/frontmatter).
const FRONTMATTER = /(?:^\uFEFF?|^\s*\n)---([\s\S]*?\n)---/;
const YAML_ERRORS = {
  'duplicated mapping key': 'chave repetida — cada chave só pode aparecer uma vez.',
  'bad indentation': 'indentação errada. Tem ": " no meio do texto? Coloque o valor entre aspas.',
  'double quoted scalar': 'aspas abertas e não fechadas.',
  'single quoted scalar': 'aspas simples abertas e não fechadas.',
  'end of the stream': 'o bloco terminou no meio de um valor (falta fechar algo?).',
  'can not read a block mapping entry': 'linha mal formada. Tem ": " no meio do texto? Coloque o valor entre aspas.',
  'incomplete explicit mapping pair': 'linha mal formada (falta "chave: valor"?).',
};
const TYPES = { string: 'texto', number: 'número', boolean: 'true/false', object: 'objeto', array: 'lista', date: 'data', null: 'vazio', undefined: 'nada' };

/** Lê `chave: valor` simples do frontmatter de um arquivo (sem validar). */
async function frontmatterOf(file) {
  try {
    const m = FRONTMATTER.exec(await readFile(file, 'utf8'));
    const data = m ? yaml.load(m[1]) : null;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/** Valida o frontmatter com o mesmo schema da coleção. Linhas são 1-based no arquivo.
 *  `path` ("deck/arquivo.md") permite checar regras do template da apresentação. */
async function validate(server, text, path) {
  const m = FRONTMATTER.exec(text);
  if (!m) return [];
  const raw = m[1];
  const first = text.slice(0, m.index + m[0].indexOf('---')).split('\n').length; // linha do "---"
  const lines = raw.split('\n');
  const lineOf = (key) => {
    const i = lines.findIndex((l) => l.startsWith(`${key}:`));
    return i < 0 ? first : first + i;
  };

  let data;
  try {
    data = yaml.load(raw) ?? {};
  } catch (err) {
    const reason = String(err.reason ?? err.message);
    const hint = Object.entries(YAML_ERRORS).find(([k]) => reason.includes(k))?.[1] ?? reason;
    return [{ line: first + (err.mark?.line ?? 0), severity: 'error', message: `YAML inválido: ${hint}` }];
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    return [{ line: first + 1, severity: 'error', message: 'O frontmatter precisa ser uma lista de "chave: valor".' }];
  }

  const { slideSchema } = await server.ssrLoadModule('/src/slide-schema.ts');
  const out = [];
  const known = Object.keys(slideSchema.shape);
  for (const key of Object.keys(data)) {
    if (!known.includes(key)) {
      out.push({ line: lineOf(key), severity: 'warning', message: `"${key}" não é uma chave conhecida e será ignorada. Chaves: ${known.join(', ')}.` });
    }
  }
  if (typeof data.theme === 'string' && /^[a-z0-9-]+$/.test(data.theme)) {
    const all = await themeNames(server);
    if (!all.includes(data.theme)) {
      out.push({ line: lineOf('theme'), severity: 'error', message: `theme: "${data.theme}" não existe. Temas: ${all.join(', ')}.` });
    }
  }
  if (typeof data.template === 'string' && /^[a-z0-9-]+$/.test(data.template)) {
    const all = await templateNames();
    if (!all.includes(data.template)) {
      out.push({ line: lineOf('template'), severity: 'error', message: `template: "${data.template}" não existe. Templates: ${all.join(', ') || 'nenhum (crie um em templates/)'}.` });
    }
  }
  // Regras que dependem da posição do slide na apresentação.
  if (path && (data.template !== undefined || data.theme !== undefined)) {
    let first;
    let isFirst = true;
    try {
      const file = slidePath(path);
      const files = (await readdir(join(file, '..'))).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort(byName);
      isFirst = !files.length || files[0] === basename(file);
      first = isFirst ? data : await frontmatterOf(join(file, '..', files[0]));
    } catch {}
    if (!isFirst && data.template !== undefined) {
      out.push({ line: lineOf('template'), severity: 'warning', message: 'template só vale no primeiro slide; aqui é ignorado.' });
    }
    if (data.theme !== undefined && typeof first?.template === 'string') {
      const tpl = await readTemplate(server, first.template).catch(() => null);
      if (tpl?.lockTheme) {
        out.push({ line: lineOf('theme'), severity: 'warning', message: `O template "${first.template}" trava o tema em "${tpl.theme ?? 'aurora'}"; theme é ignorado.` });
      }
    }
  }
  const res = slideSchema.safeParse(data);
  for (const issue of res.success ? [] : res.error.issues) {
    const key = String(issue.path[0] ?? '');
    const got = data[key];
    const kind = got === null ? 'null' : got instanceof Date ? 'date' : Array.isArray(got) ? 'array' : typeof got;
    let message;
    if (issue.code === 'invalid_value' || issue.code === 'invalid_enum_value') {
      const opts = issue.values ?? issue.options ?? [];
      message = `${key}: "${got}" não vale. Use: ${opts.join(', ')}.`;
    } else if (issue.code === 'invalid_type' || issue.code === 'invalid_union') {
      message = `${key}: esperava ${TYPES[issue.expected] ?? 'texto'}, mas veio ${TYPES[kind] ?? kind}.`;
      if (kind === 'object') message += ' Tem ": " no meio do texto? Coloque o valor entre aspas.';
      if (kind === 'null') message += ' Escreva um valor depois dos dois-pontos ou apague a linha.';
    } else {
      message = `${key}: ${issue.message}`;
    }
    out.push({ line: lineOf(key), severity: 'error', message });
  }
  return out;
}

// ───────── Temas (themes/*.yaml) ─────────

const themesLib = (server) => server.ssrLoadModule('/src/lib/themes.ts');

function themePath(name) {
  const n = String(name ?? '');
  if (!/^[a-z0-9-]+$/.test(n)) throw new HttpError(400, `Nome de tema inválido: ${name}`);
  return join(THEMES, `${n}.yaml`);
}

async function customThemes() {
  if (!existsSync(THEMES)) return [];
  return (await readdir(THEMES)).filter((f) => /\.ya?ml$/.test(f)).map((f) => f.replace(/\.ya?ml$/, '')).sort(byName);
}

async function themeNames(server) {
  const { builtinThemes } = await themesLib(server);
  return [...builtinThemes, ...(await customThemes()).filter((t) => !builtinThemes.includes(t))];
}

const q = (s) => JSON.stringify(s);
const themeYaml = (t) => `# Tema do editor de slides. Use com \`theme: <nome deste arquivo>\` no primeiro slide.

mode: ${t.mode}          # dark | light — claro ou escuro (muda os cartões e os blocos de código)
background: ${t.background}  # aurora | paper | noir | sunset | plain — estilo do fundo
font: ${t.font}          # sans | serif | mono — fonte dos títulos

colors:
  background: ${q(t.colors.background)}  # fundo
  text: ${q(t.colors.text)}        # texto
  muted: ${q(t.colors.muted)}       # texto secundário
  accent: ${q(t.colors.accent)}      # destaque principal (e as luzes do fundo)
  accent2: ${q(t.colors.accent2)}     # segunda cor do gradiente dos títulos
  accent3: ${q(t.colors.accent3)}     # terceira cor

corners: ${t.corners}         # arredondamento dos cantos, de 0 a 60
grain: ${t.grain}         # granulado do fundo, de 0 a 0.3
`;

async function parseTheme(server, text) {
  const { themeSchema } = await server.ssrLoadModule('/src/slide-schema.ts');
  let data;
  try { data = yaml.load(text); } catch (err) { throw new HttpError(422, `YAML inválido: ${err.reason ?? err.message}`); }
  const res = themeSchema.safeParse(data ?? {});
  if (!res.success) {
    const i = res.error.issues[0];
    throw new HttpError(422, `${i.path.join('.')}: ${i.message}`);
  }
  return res.data;
}

// ───────── Templates (templates/<nome>/template.yaml) ─────────

function templateDir(name) {
  const n = String(name ?? '');
  if (!/^[a-z0-9-]+$/.test(n)) throw new HttpError(400, `Nome de template inválido: ${name}`);
  return join(TEMPLATES, n);
}

const templateFile = (name) => {
  const dir = templateDir(name);
  const yml = join(dir, 'template.yml');
  return existsSync(yml) ? yml : join(dir, 'template.yaml');
};

async function templateNames() {
  if (!existsSync(TEMPLATES)) return [];
  const dirs = (await readdir(TEMPLATES, { withFileTypes: true })).filter((d) => d.isDirectory());
  return dirs.map((d) => d.name).filter((n) => /^[a-z0-9-]+$/.test(n) && existsSync(templateFile(n))).sort(byName);
}

async function parseTemplate(server, data) {
  const { templateSchema } = await server.ssrLoadModule('/src/slide-schema.ts');
  const res = templateSchema.safeParse(data ?? {});
  if (!res.success) {
    const i = res.error.issues[0];
    throw new HttpError(422, `${i.path.join('.')}: ${i.message}`);
  }
  if (res.data.theme && !(await themeNames(server)).includes(res.data.theme)) {
    throw new HttpError(422, `theme: "${res.data.theme}" não existe.`);
  }
  return res.data;
}

async function readTemplate(server, name) {
  let data;
  try { data = yaml.load(await readFile(templateFile(name), 'utf8')); } catch (err) {
    if (err.code === 'ENOENT') throw new HttpError(404, `O template ${name} não existe.`);
    throw new HttpError(422, `YAML inválido: ${err.reason ?? err.message}`);
  }
  return parseTemplate(server, data);
}

const templateSlides = async (name) =>
  (await readdir(templateDir(name))).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort(byName);

const opt = (key, value, comment) =>
  value === undefined || value === '' ? `# ${key}:${comment}` : `${key}: ${value}${comment}`;
const templateYaml = (t) => `# Template de apresentação. Use com \`template: <nome desta pasta>\` no primeiro slide.
# Os .md desta pasta são os slides iniciais de cada apresentação nova criada com ele.

${opt('name', t.name && q(t.name), '        # nome exibido')}
${opt('theme', t.theme, '          # tema: aurora | paper | noir | sunset | um de themes/')}
lockTheme: ${t.lockTheme}      # true: os slides não podem trocar o tema

${opt('logo', t.logo && q(t.logo), '           # arquivo nesta pasta (ou /img/...)')}
logoPosition: ${t.logoPosition}  # top-left | top-right | bottom-left | bottom-right
logoSize: ${t.logoSize}           # altura em px, num slide de 1920×1080
logoOnCover: ${t.logoOnCover}      # mostrar a logo também na capa

footer: ${q(t.footer)}   # texto do rodapé; {title} = nome da apresentação; "" = sem texto
slideNumbers: ${t.slideNumbers}     # numeração no rodapé

textSize: ${t.textSize}           # tamanho do texto (1 = normal; 0.6 a 1.6)
titleSize: ${t.titleSize}          # tamanho dos títulos (1 = normal; 0.6 a 1.6)
animations: ${t.animations}       # false: sem transições, sem revelar itens aos poucos
`;

/** Põe (ou troca) `key: value` no frontmatter de um texto de slide. */
function setKey(text, key, value) {
  const line = `${key}: ${value}`;
  if (!/^---\r?\n/.test(text)) return `---\n${line}\n---\n\n${text}`;
  const end = text.indexOf('\n---', 3);
  const head = text.slice(0, end);
  const re = new RegExp(`^${key}:.*$`, 'm');
  return re.test(head) ? head.replace(re, line) + text.slice(end) : text.replace(/^---\r?\n/, `---\n${line}\n`);
}

const routes = {
  'GET templates': async ({ server }) =>
    Promise.all((await templateNames()).map(async (name) => {
      try {
        return { name, title: (await readTemplate(server, name)).name };
      } catch (err) {
        return { name, error: err.message };
      }
    })),

  'GET template': async ({ query, server }) => {
    const name = query.get('name');
    const template = await readTemplate(server, name);
    const logoUrl = template.logo
      ? template.logo.startsWith('/') ? template.logo : `/${TEMPLATE_FILES}/${name}/${encodeURIComponent(template.logo)}`
      : null;
    return { template, slides: await templateSlides(name), logoUrl };
  },

  'PUT template': async ({ query, json, server }) => {
    const file = templateFile(query.get('name'));
    if (!existsSync(file)) throw new HttpError(404, 'Template não existe mais.');
    const t = await parseTemplate(server, json);
    await writeFile(file, templateYaml(t));
    return { ok: true };
  },

  // Cria templates/<nome>/: { name, base? } — `base` é outro template para copiar.
  'POST template': async ({ json, server }) => {
    const name = slugify(String(json.name ?? '')).replace(/[._]/g, '-');
    if (!name) throw new HttpError(400, 'Dê um nome ao template.');
    const dir = templateDir(name);
    if (existsSync(dir)) throw new HttpError(409, `O template ${name} já existe.`);
    if (json.base) {
      await cp(templateDir(json.base), dir, { recursive: true });
    } else {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'template.yaml'), templateYaml(await parseTemplate(server, { theme: 'aurora' })));
    }
    return { name };
  },

  'DELETE template': async ({ query }) => {
    await rm(templateDir(query.get('name')), { recursive: true });
    return { ok: true };
  },

  // Troca a logo: grava logo.<ext> na pasta do template e atualiza o template.yaml.
  'POST template-logo': async ({ query, req, server }) => {
    const name = query.get('name');
    const dir = templateDir(name);
    const t = await readTemplate(server, name);
    const ext = extname(basename(String(query.get('file') ?? ''))).toLowerCase();
    if (!/^\.(png|jpe?g|gif|webp|svg|avif)$/.test(ext)) throw new HttpError(400, 'Formato de imagem não suportado.');
    for (const f of await readdir(dir)) if (/^logo\.\w+$/.test(f)) await rm(join(dir, f));
    await writeFile(join(dir, `logo${ext}`), await body(req));
    t.logo = `logo${ext}`;
    await writeFile(templateFile(name), templateYaml(t));
    return { logo: t.logo };
  },

  // Os slides de uma apresentação viram os slides iniciais do template: { name, deck }
  'POST template-slides': async ({ json }) => {
    const dir = templateDir(json.name);
    const from = deckPath(json.deck);
    const files = (await readdir(from)).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
    if (!files.length) throw new HttpError(400, 'A apresentação não tem slides.');
    for (const f of await templateSlides(json.name)) await rm(join(dir, f));
    for (const f of files) await copyFile(join(from, f), join(dir, f));
    return { slides: files.length };
  },

  // Aplica um template a uma apresentação: { name, deck } → template: <nome> no 1º slide.
  'POST use-template': async ({ json }) => {
    templateDir(json.name);
    const dir = deckPath(json.deck);
    const first = (await readdir(dir)).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort(byName)[0];
    if (!first) throw new HttpError(400, 'A apresentação não tem slides.');
    const file = join(dir, first);
    await writeFile(file, setKey(await readFile(file, 'utf8'), 'template', json.name));
    return { path: `${json.deck}/${first}` };
  },

  'GET themes': async ({ server }) => {
    const { builtinThemes } = await themesLib(server);
    const custom = (await customThemes()).filter((t) => !builtinThemes.includes(t));
    return [...builtinThemes.map((name) => ({ name, builtin: true })), ...custom.map((name) => ({ name, builtin: false }))];
  },

  'GET theme': async ({ query, server }) => {
    const file = themePath(query.get('name'));
    const text = await readFile(existsSync(file) ? file : file.replace(/\.yaml$/, '.yml'), 'utf8');
    return { theme: await parseTheme(server, text) };
  },

  'PUT theme': async ({ query, json, server }) => {
    const file = themePath(query.get('name'));
    if (!existsSync(file)) throw new HttpError(404, 'Tema não existe mais.');
    const theme = await parseTheme(server, yaml.dump(json));
    await writeFile(file, themeYaml(theme));
    return { ok: true };
  },

  // Cria themes/<nome>.yaml a partir de um tema pronto ou de outro tema seu: { name, base }
  'POST theme': async ({ json, server }) => {
    const name = slugify(String(json.name ?? '')).replace(/[._]/g, '-');
    if (!name) throw new HttpError(400, 'Dê um nome ao tema.');
    const { builtinPresets, builtinThemes } = await themesLib(server);
    if (builtinThemes.includes(name)) throw new HttpError(409, `"${name}" é o nome de um tema pronto. Escolha outro.`);
    const file = themePath(name);
    if (existsSync(file)) throw new HttpError(409, `O tema ${name} já existe.`);
    const base = String(json.base ?? 'aurora');
    const theme = builtinPresets[base] ?? (await parseTheme(server, await readFile(themePath(base), 'utf8')));
    await mkdir(THEMES, { recursive: true });
    await writeFile(file, themeYaml(theme));
    return { name };
  },

  'DELETE theme': async ({ query }) => {
    await rm(themePath(query.get('name')));
    return { ok: true };
  },


  'GET tree': async () => tree(),

  // Pasta onde estão as apresentações (mostrada na barra lateral).
  'GET info': async () => {
    const home = homedir();
    const shown = WORKSPACE === home || WORKSPACE.startsWith(home + sep) ? '~' + WORKSPACE.slice(home.length) : WORKSPACE;
    return { workspace: WORKSPACE, shown };
  },

  // Abre a pasta no gerenciador de arquivos do sistema.
  'POST reveal': async () => {
    const [cmd, ...args] = process.platform === 'darwin' ? ['open', WORKSPACE]
      : process.platform === 'win32' ? ['explorer', WORKSPACE]
      : ['xdg-open', WORKSPACE];
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    return { ok: true };
  },

  'POST validate': async ({ req, query, server }) => ({
    diagnostics: await validate(server, (await body(req)).toString(), query.get('path')),
  }),

  'GET file': async ({ query }) => ({ text: await readFile(slidePath(query.get('path')), 'utf8') }),

  'PUT file': async ({ query, req }) => {
    const file = slidePath(query.get('path'));
    if (!existsSync(file)) throw new HttpError(404, 'Arquivo não existe mais.');
    await writeFile(file, await body(req));
    return { ok: true };
  },

  // Cria um slide novo: { deck, name, after? } — numerado depois de `after` (ou no fim).
  'POST slide': async ({ json }) => {
    const dir = deckPath(json.deck);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort(byName);
    const nums = files.map((f) => parseInt(f, 10)).filter(Number.isFinite);
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    const title = String(json.name || 'Novo slide').trim();
    const file = `${String(n).padStart(2, '0')}-${slugify(title) || 'slide'}.md`;
    await writeFile(join(dir, file), blank(title), { flag: 'wx' });
    return { path: `${json.deck}/${file}` };
  },

  // Nova apresentação: { name, theme } ou { name, template } — com template, copia os slides iniciais dele.
  'POST deck': async ({ json }) => {
    const name = slugify(String(json.name ?? ''));
    if (!name) throw new HttpError(400, 'Dê um nome à apresentação.');
    const dir = deckPath(name);
    if (existsSync(dir)) throw new HttpError(409, `A pasta slides/${name} já existe.`);
    const title = String(json.name).trim().replace(/^\w/, (c) => c.toUpperCase());
    const template = json.template ? String(json.template) : null;
    const starters = template ? await templateSlides(template) : [];
    await mkdir(dir);
    if (!starters.length) {
      const line = template ? `template: ${template}` : `theme: ${json.theme || 'aurora'}`;
      await writeFile(join(dir, '01-capa.md'), cover(title, line));
      return { path: `${name}/01-capa.md` };
    }
    for (const [i, f] of starters.entries()) {
      let text = await readFile(join(templateDir(template), f), 'utf8');
      if (i === 0) text = setKey(setKey(text, 'template', template), 'title', q(title));
      await writeFile(join(dir, f), text);
    }
    return { path: `${name}/${starters[0]}` };
  },

  // Apaga a apresentação inteira (a pasta slides/<nome>/).
  'DELETE deck': async ({ query }) => {
    const dir = deckPath(query.get('name'));
    if (!existsSync(dir)) throw new HttpError(404, 'Apresentação não existe mais.');
    await rm(dir, { recursive: true });
    return { ok: true };
  },

  'POST rename': async ({ json }) => {
    const from = slidePath(json.from);
    const to = slidePath(json.to);
    if (existsSync(to)) throw new HttpError(409, `Já existe ${json.to}.`);
    await rename(from, to);
    return { path: json.to };
  },

  'DELETE file': async ({ query }) => {
    await rm(slidePath(query.get('path')));
    return { ok: true };
  },

  // Sobe uma imagem para public/img e devolve o caminho para usar no Markdown.
  'POST upload': async ({ query, req }) => {
    const raw = basename(String(query.get('name') ?? 'imagem'));
    const ext = extname(raw).toLowerCase();
    if (!/^\.(png|jpe?g|gif|webp|svg|avif)$/.test(ext)) throw new HttpError(400, 'Formato de imagem não suportado.');
    const stem = slugify(raw.slice(0, -ext.length)) || 'imagem';
    await mkdir(IMG, { recursive: true });
    let name = stem + ext;
    for (let i = 2; existsSync(join(IMG, name)); i++) name = `${stem}-${i}${ext}`;
    await writeFile(join(IMG, name), await body(req));
    return { src: `/img/${name}` };
  },
};

let exporting = false;

/** GET export?deck=nome&format=pdf|png[&slide=n] — devolve o arquivo para download. */
async function exportDeck(req, res, query) {
  const fail = (status, error) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error }));
  };
  if (query.has('check')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ browser: !!findBrowser() }));
  }
  const deck = query.get('deck') ?? '';
  try { deckPath(deck); } catch (err) { return fail(400, err.message); }
  if (!existsSync(join(SLIDES, deck))) return fail(404, 'Apresentação não encontrada.');
  if (exporting) return fail(409, 'Já existe uma exportação em andamento.');

  const png = query.get('format') === 'png';
  const slide = png ? Math.max(0, Number(query.get('slide') ?? 0)) : undefined;
  exporting = true;
  try {
    const url = `http://${req.headers.host}/${deck}/?export#${(slide ?? 0) + 1}`;
    const shots = await capture(url, { only: slide, format: png ? 'png' : 'jpeg' });
    const name = png ? `${deck}-${String(slide + 1).padStart(2, '0')}.png` : `${deck}.pdf`;
    res.setHeader('Content-Type', png ? 'image/png' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.end(png ? shots[0] : imagesToPdf(shots, deck));
  } catch (err) {
    fail(err.status ?? 500, err.message);
  } finally {
    exporting = false;
  }
}

/** @returns {import('vite').Plugin} */
export default function slideEditor() {
  return {
    name: 'slide-editor',
    apply: 'serve',
    config: () => ({
      optimizeDeps: {
        // Tudo junto, para não haver duas cópias de @codemirror/state.
        include: [
          'codemirror', '@codemirror/state', '@codemirror/view', '@codemirror/commands',
          '@codemirror/language', '@codemirror/autocomplete', '@codemirror/lint', '@codemirror/lang-markdown',
          '@codemirror/lang-yaml', '@codemirror/language-data', '@codemirror/theme-one-dark',
        ],
      },
    }),
    configureServer(server) {
      // Eventos de mudança em slides/ (Server-Sent Events), para o editor
      // recarregar arquivos alterados por fora (outro editor, git, etc.).
      const clients = new Set();
      const notify = (kind) => async (file) => {
        if (file.startsWith(TEMPLATES + sep)) {
          const msg = `data: ${JSON.stringify({ kind: 'templates', path: relative(TEMPLATES, file).split(sep)[0] })}\n\n`;
          for (const res of clients) res.write(msg);
          return;
        }
        if (file.startsWith(THEMES + sep)) {
          const msg = `data: ${JSON.stringify({ kind: 'themes', path: relative(THEMES, file).replace(/\.ya?ml$/, '') })}\n\n`;
          for (const res of clients) res.write(msg);
          return;
        }
        if (!file.startsWith(SLIDES + sep)) return;
        const path = relative(SLIDES, file).split(sep).join('/');
        let mtime = 0;
        try { mtime = (await stat(file)).mtimeMs; } catch {}
        const msg = `data: ${JSON.stringify({ kind, path, mtime })}\n\n`;
        for (const res of clients) res.write(msg);
      };
      server.watcher.add([SLIDES, THEMES, TEMPLATES]);
      server.watcher.on('change', notify('change'));
      server.watcher.on('add', notify('add'));
      server.watcher.on('unlink', notify('unlink'));
      server.watcher.on('addDir', notify('tree'));
      server.watcher.on('unlinkDir', notify('tree'));

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://x');

        if (url.pathname === '/__editor' || url.pathname === '/__editor/') {
          // Servido cru (sem o cliente do Vite): assim o "full-reload" que o Astro
          // dispara a cada slide salvo recarrega só o preview, nunca o editor.
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(await readFile(HTML, 'utf8'));
          return;
        }

        if (url.pathname === API + 'export') {
          await exportDeck(req, res, url.searchParams);
          return;
        }

        if (url.pathname === API + 'events') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
          res.write(': ok\n\n');
          clients.add(res);
          req.on('close', () => clients.delete(res));
          return;
        }

        if (!url.pathname.startsWith(API)) return next();
        const route = routes[`${req.method} ${url.pathname.slice(API.length)}`];
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          if (!route) throw new HttpError(404, 'Rota desconhecida.');
          const isJson = (req.headers['content-type'] ?? '').includes('application/json');
          const json = isJson ? JSON.parse((await body(req)).toString() || '{}') : {};
          res.end(JSON.stringify(await route({ req, server, query: url.searchParams, json })));
        } catch (err) {
          res.statusCode = err.status ?? (err.code === 'ENOENT' ? 404 : err.code === 'EEXIST' ? 409 : 500);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}
