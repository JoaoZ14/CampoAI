import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  base: mode === 'native' ? './' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/entrar': 'http://127.0.0.1:3000',
      '/area-do-cliente': 'http://127.0.0.1:3000',
      '/planos': 'http://127.0.0.1:3000',
      '/legal': 'http://127.0.0.1:3000',
      '/shared': 'http://127.0.0.1:3000',
    },
  },
}));
