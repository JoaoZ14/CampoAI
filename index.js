/**
 * Entrada Vercel na raiz do projeto (lista oficial inclui index.js).
 * Não use src/app.js — o Vercel exige default export especial nesse caminho.
 */
import serverless from 'serverless-http';
import { createApp } from './src/expressApp.js';

const app = createApp();

export default serverless(app);
