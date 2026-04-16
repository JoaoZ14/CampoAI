/**
 * Entrada oficial do Vercel para Express (ver docs: Express on Vercel).
 * Export default = app Express (sem serverless-http).
 * @see https://vercel.com/docs/frameworks/backend/express
 */
import { createApp } from './expressApp.js';

export default createApp();
