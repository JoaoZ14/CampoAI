/**
 * Entrypoint do Vercel (ficheiro na raiz: server.js).
 * NÃO use src/app.js — o Vercel trata esse nome como servidor especial e exige default export errado.
 */
import serverless from 'serverless-http';
import { createApp } from './src/expressApp.js';

const app = createApp();

export default serverless(app);
