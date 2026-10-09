// Exporta uma apresentação tirando "fotos" de cada slide num Chromium headless.
// Imagens em vez de impressão vetorial: os efeitos (blur, granulado, vidro)
// ficam idênticos à tela e o PDF fica leve.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'microsoft-edge', 'brave', 'brave-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

let found;
export function findBrowser() {
  if (found !== undefined) return found;
  found = null;
  for (const c of CANDIDATES.filter(Boolean)) {
    if (c.includes('/') || c.includes('\\')) {
      if (existsSync(c)) return (found = c);
      continue;
    }
    try {
      const which = process.platform === 'win32' ? 'where' : 'which';
      return (found = execFileSync(which, [c], { encoding: 'utf8' }).split('\n')[0].trim());
    } catch {}
  }
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Abre o Chromium, entra na página e devolve uma função `send` do DevTools Protocol. */
async function launch(bin) {
  const profile = await mkdtemp(join(tmpdir(), 'slides-export-'));
  const proc = spawn(bin, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error('O navegador não respondeu.')), 15000);
    proc.stderr.on('data', (d) => {
      log += d;
      const m = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    proc.on('exit', () => { clearTimeout(timer); reject(new Error('O navegador fechou ao iniciar.')); });
  });

  const port = new URL(wsUrl).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('Falha ao conectar no navegador.')); });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    const p = d.id && pending.get(d.id);
    if (!p) return;
    pending.delete(d.id);
    d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const close = async () => {
    try { ws.close(); } catch {}
    proc.kill();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  };
  return { send, close };
}

/**
 * Captura os slides de `url` (página da apresentação, já com ?export).
 * `only`: índice de um slide só (PNG). Devolve buffers JPEG (ou PNG).
 */
export async function capture(url, { only, format = 'jpeg' } = {}) {
  const bin = findBrowser();
  if (!bin) throw Object.assign(new Error('Nenhum Chrome/Chromium encontrado.'), { status: 501 });
  const { send, close } = await launch(bin);
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url });
    const evaluate = async (expression) =>
      (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

    // Espera a página, as fontes e as imagens.
    for (let i = 0; i < 100 && !(await evaluate(`!!document.getElementById('stage')`).catch(() => false)); i++) await sleep(100);
    const count = await evaluate(`document.querySelectorAll('#stage .slot').length`);
    if (!count) throw new Error('A apresentação não carregou (erro no frontmatter?).');
    await evaluate(`Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))])`);

    const shots = [];
    const indexes = only === undefined ? [...Array(count).keys()] : [only];
    for (const i of indexes) {
      await evaluate(`location.hash = '#${i + 1}'; new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      await sleep(60);
      const { data } = await send('Page.captureScreenshot', {
        format, ...(format === 'jpeg' ? { quality: 92 } : {}),
        clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 },
      });
      shots.push(Buffer.from(data, 'base64'));
    }
    return shots;
  } finally {
    await close();
  }
}

/** Monta um PDF com uma página 16:9 (1440×810 pt = 1920×1080 px) por imagem JPEG. */
export function imagesToPdf(jpegs, title = '') {
  const W = 1440, H = 810;
  const chunks = [];
  const offsets = [];
  let size = 0;
  const push = (b) => { const buf = typeof b === 'string' ? Buffer.from(b, 'latin1') : b; chunks.push(buf); size += buf.length; };
  const obj = (n, body) => { offsets[n] = size; push(`${n} 0 obj\n`); for (const b of [body].flat()) push(b); push('\nendobj\n'); };

  const n = jpegs.length;
  // 1 catálogo, 2 páginas, 3 info; cada slide i usa 4+3i (página), 5+3i (imagem), 6+3i (conteúdo)
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${jpegs.map((_, i) => `${4 + 3 * i} 0 R`).join(' ')}] >>`);
  const hex = Buffer.from('\uFEFF' + title, 'utf16le').swap16().toString('hex');
  obj(3, `<< /Title <${hex}> /Producer (Slides editor) >>`);
  jpegs.forEach((jpg, i) => {
    const [page, img, content] = [4 + 3 * i, 5 + 3 * i, 6 + 3 * i];
    const { width, height } = jpegSize(jpg);
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R >>`);
    obj(img, [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, '\nendstream']);
    const draw = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(content, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
  });
  const xref = size;
  const total = 4 + 3 * n;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

function jpegSize(buf) {
  for (let i = 2; i < buf.length; ) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return { width: 1920, height: 1080 };
}
