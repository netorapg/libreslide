import { defineConfig } from 'astro/config';

export default defineConfig({
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'vitesse-dark' },
    },
  },
});
