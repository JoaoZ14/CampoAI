import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/entrar': 'http://127.0.0.1:3000',
      '/cadastro': 'http://127.0.0.1:3000',
      '/area-do-cliente': 'http://127.0.0.1:3000',
    },
  },
});
