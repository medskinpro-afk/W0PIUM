import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const publicRoot = fileURLToPath(new URL('./public', import.meta.url));

export default defineConfig({
  // Serve public/ as the project root so index.html is the entry point
  root: publicRoot,

  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./public/index.html', import.meta.url)),
      },
    },
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
