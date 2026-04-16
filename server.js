/**
 * Entrypoint que o Vercel procura na raiz (server.js).
 * O servidor local continua a usar `npm run start` → `src/index.js`.
 */
import serverless from 'serverless-http';
import { createApp } from './src/expressApp.js';

const app = createApp();

export default serverless(app);
