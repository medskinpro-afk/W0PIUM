import { defineConfig } from 'vite';

export default defineConfig({
  // Serve public/ as the project root so index.html is the entry point
  root: 'public',

  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },

  server: {
    port: 5173,
    proxy: {
      '/api':       'http://localhost:3000',
      '/avatars':   'http://localhost:3000',
      '/images':    'http://localhost:3000',
      '/files':     'http://localhost:3000',
      '/msg_images':'http://localhost:3000',
    },
  },

  css: {
    postcss: '../postcss.config.js',
  },
});
