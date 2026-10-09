import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { defineConfig } from 'astro/config';
import slideEditor from './editor/plugin.mjs';
import { WORKSPACE, APP, ws, workspaceFiles } from './workspace.mjs';

// Com o comando `libreslide`, as imagens e o build ficam na pasta da pessoa.
const external = WORKSPACE !== APP;
// Instalado pelo npx, as dependências ficam fora do projeto (node_modules "de cima").
const deps = dirname(dirname(createRequire(import.meta.url).resolve('astro/package.json')));

export default defineConfig({
  publicDir: ws('public'),
  ...(external && { outDir: ws('dist') }),
  integrations: [workspaceFiles()],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'vitesse-dark' },
    },
  },
  vite: {
    // Editor estilo Overleaf em /__editor/ (só no `npm run dev`).
    plugins: [slideEditor()],
    server: { fs: { allow: [APP, deps, WORKSPACE] } },
  },
});
