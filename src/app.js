import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import webhookRoutes from './routes/whatsappRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { openapiSpec } from './swagger/openapi.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  /** Twilio envia application/x-www-form-urlencoded — necessário global no Vercel/serverless */
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.get('/openapi.json', (_req, res) => {
    res.json(openapiSpec);
  });

  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, {
      customSiteTitle: 'AgroAssist — API',
      customCss: '.swagger-ui .topbar { display: none }',
    })
  );

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'AgroAssist API' });
  });

  app.use('/webhook', webhookRoutes);

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Rota não encontrada.' });
  });

  app.use(errorHandler);

  return app;
}
