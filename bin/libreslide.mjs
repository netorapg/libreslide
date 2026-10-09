#!/usr/bin/env node
// LibreSlide — slides livres em Markdown. Comando para quem só quer usar.
//
//   libreslide [pasta] [--port N]      abre o editor no navegador (cria a pasta com o exemplo, se preciso)
//   libreslide build [pasta]           gera o site estático em <pasta>/dist
//
// Sem [pasta], pergunta onde (sugere a última usada, ou ~/Apresentacoes).
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const APP = fileURLToPath(new URL('..', import.meta.url));
const HOME = homedir();
const CONFIG = join(
  process.platform === 'win32' ? process.env.APPDATA || HOME : process.env.XDG_CONFIG_HOME || join(HOME, '.config'),
  'libreslide',
  'config.json',
);

// O que vem numa pasta nova: a apresentação de exemplo, a imagem dela, um tema e um template.
const STARTER = ['slides/exemplo', 'public/img/abstrato.svg', 'themes/oceano.yaml', 'templates/instituicao-exemplo'];

const bold = (s) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const dim = (s) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);
const pretty = (p) => (p === HOME || p.startsWith(HOME + '/') || p.startsWith(HOME + '\\') ? '~' + p.slice(HOME.length) : p);
const expand = (p) => resolve(p.replace(/^~(?=$|[\\/])/, HOME));

const args = process.argv.slice(2);
const portAt = args.indexOf('--port');
const port = portAt >= 0 ? Number(args.splice(portAt, 2)[1]) : undefined;
if (args.includes('-h') || args.includes('--help')) {
  console.log(`
  ${bold('libreslide')} [pasta] [--port N]      abre o editor de slides no navegador
  ${bold('libreslide build')} [pasta]           gera o site estático em <pasta>/dist

  Sem [pasta], pergunta onde ficam as apresentações (padrão: a última usada).
  Uma pasta nova já vem com uma apresentação de exemplo.
`);
  process.exit(0);
}
const command = args[0] === 'build' || args[0] === 'dev' ? args.shift() : 'dev';

async function readConfig() {
  try {
    return JSON.parse(await readFile(CONFIG, 'utf8'));
  } catch {
    return {};
  }
}

async function chooseFolder() {
  if (args[0]) return expand(args[0]);
  const config = await readConfig();
  const suggestion = config.workspace ?? join(HOME, 'Apresentacoes');
  if (!process.stdin.isTTY) return suggestion;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\n  ${bold('LibreSlide')} ${dim('· slides livres em Markdown')}\n`);
  const answer = await rl.question(`  Onde ficam suas apresentações? ${dim(`(Enter = ${pretty(suggestion)})`)} `);
  rl.close();
  return answer.trim() ? expand(answer.trim()) : suggestion;
}

const dir = await chooseFolder();

// Pasta nova (ou sem slides/): copia o material de exemplo, sem sobrescrever nada.
const fresh = !existsSync(join(dir, 'slides'));
for (const sub of ['slides', 'themes', 'templates', 'public/img']) await mkdir(join(dir, sub), { recursive: true });
if (fresh) {
  for (const item of STARTER) {
    await mkdir(dirname(join(dir, item)), { recursive: true });
    await cp(join(APP, item), join(dir, item), { recursive: true, force: false, errorOnExist: false });
  }
  console.log(`\n  ✓ Pasta criada em ${bold(pretty(dir))} com uma apresentação de exemplo.`);
} else {
  console.log(`\n  Usando ${bold(pretty(dir))}`);
}

await mkdir(dirname(CONFIG), { recursive: true });
await writeFile(CONFIG, JSON.stringify({ ...(await readConfig()), workspace: dir }, null, 2));

// workspace.mjs lê esta variável: slides/, themes/, templates/ e public/ passam a vir da pasta escolhida.
process.env.LIBRESLIDE_DIR = dir;
process.chdir(APP);
const astro = await import('astro');

if (command === 'build') {
  await astro.build({ root: APP });
  console.log(`\n  ✓ Site gerado em ${bold(pretty(join(dir, 'dist')))} — publique essa pasta em qualquer hospedagem estática.\n`);
} else {
  console.log(`  Abrindo o editor no navegador… ${dim('(Ctrl+C para encerrar)')}\n`);
  await astro.dev({ root: APP, server: { open: '/__editor/', ...(port && { port }) } });
}
