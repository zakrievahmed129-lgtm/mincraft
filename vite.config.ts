import { defineConfig } from 'vite';

export default defineConfig({
  // Base path for GitHub Pages
  base: '/mincraft/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 3000,
  },
});
