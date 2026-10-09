import { defineConfig } from 'astro/config';
import slideEditor from './editor/plugin.mjs';

export default defineConfig({
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'vitesse-dark' },
    },
  },
  vite: {
    // Editor estilo Overleaf em /__editor/ (só no `npm run dev`).
    plugins: [slideEditor()],
  },
});
