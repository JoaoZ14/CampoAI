/**
 * Entrada serverless do Vercel — não renomeie para src/app.js (o Vercel espera export especial nesse caminho).
 */
import serverless from 'serverless-http';
import { createApp } from '../src/expressApp.js';

const app = createApp();

export default serverless(app);
