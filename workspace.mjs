// Onde ficam as apresentações (slides/, themes/, templates/, public/img/).
// Por padrão, a própria pasta do projeto; o comando `libreslide` (bin/)
// aponta para a pasta escolhida pela pessoa via LIBRESLIDE_DIR.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { cp, readdir } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const APP = fileURLToPath(new URL('.', import.meta.url));
export const WORKSPACE = resolve(process.env.LIBRESLIDE_DIR || APP);
export const ws = (...parts) => resolve(WORKSPACE, ...parts);
/** URL de uma pasta da área de trabalho (para o `base` do glob loader). */
export const wsUrl = (dir) => pathToFileURL(ws(dir) + sep).href;

// Arquivos dos templates (logos) ficam em templates/<nome>/, fora de public/:
// no dev são servidos em /_templates/…, e no build copiados para dist/_templates/.
export const TEMPLATE_FILES = '_templates';
const ASSET = /\.(svg|png|jpe?g|gif|webp|avif)$/i;
const TYPES = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif' };

/** @returns {import('astro').AstroIntegration} */
export function workspaceFiles() {
  return {
    name: 'workspace-files',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use((req, res, next) => {
          const m = decodeURIComponent((req.url ?? '').split('?')[0]).match(/\/_templates\/([a-z0-9-]+)\/([^/]+)$/);
          if (!m || !ASSET.test(m[2])) return next();
          const file = ws('templates', m[1], m[2]);
          if (!existsSync(file) || !statSync(file).isFile()) return next();
          res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()]);
          res.setHeader('Cache-Control', 'no-cache');
          createReadStream(file).pipe(res);
        });
      },
      'astro:build:done': async ({ dir }) => {
        const root = ws('templates');
        if (!existsSync(root)) return;
        for (const t of await readdir(root, { withFileTypes: true })) {
          if (!t.isDirectory()) continue;
          for (const f of await readdir(join(root, t.name))) {
            if (ASSET.test(f)) await cp(join(root, t.name, f), fileURLToPath(new URL(`${TEMPLATE_FILES}/${t.name}/${f}`, dir)));
          }
        }
      },
    },
  };
}
