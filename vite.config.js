import { defineConfig } from 'vite';

// base './' : fonctionne sur GitHub Pages quel que soit le nom du dépôt.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
