import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  // Relative asset paths so the built index.html works under file://
  // (Electron packaged build), not just from a web server root.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/files': 'http://127.0.0.1:4000',
    },
  },
});
