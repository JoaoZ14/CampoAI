import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import webhookRoutes from './routes/whatsappRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { openapiSpec } from './swagger/openapi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminDir = path.join(__dirname, '../public/admin');

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(cors());
  // urlencoded antes de json — Twilio WhatsApp manda application/x-www-form-urlencoded
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/openapi.json', (_req, res) => {
    res.json(openapiSpec);
  });

  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, {
      customSiteTitle: 'AG Assist — API',
      customCss: '.swagger-ui .topbar { display: none }',
    })
  );

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'AG Assist API' });
  });

  // Rotas da API primeiro; HTML sem redirect /admin → /admin/ (evita loop se o proxy
  // remover a barra final).
  app.use('/admin', adminRoutes);
  app.get(['/admin', '/admin/'], (_req, res) => {
    res.sendFile(path.join(adminDir, 'index.html'));
  });
  app.use(
    '/admin',
    express.static(adminDir, {
      index: false,
      redirect: false,
    })
  );

  app.use('/webhook', webhookRoutes);

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Rota não encontrada.' });
  });

  app.use(errorHandler);

  return app;
}
