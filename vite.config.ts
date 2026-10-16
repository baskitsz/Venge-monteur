import { defineConfig } from 'vite';

// base './' zodat de build ook in een submap werkt (GitHub Pages: /<repo>/)
export default defineConfig({
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
});
