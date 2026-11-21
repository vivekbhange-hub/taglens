import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ai-tag.vivekbhange.tech',
  trailingSlash: 'always',
  vite: {
    // The C2PA SDK ships its own worker and WASM; let Vite leave it alone in dev.
    optimizeDeps: { exclude: ['@contentauth/c2pa-web'] },
  },
});
