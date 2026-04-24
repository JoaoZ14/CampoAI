import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import webhookRoutes from './routes/whatsappRoutes.js';
import asaasWebhookRoutes from './routes/asaasWebhookRoutes.js';
import billingRoutes from './routes/billingRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import customerPortalRoutes from './routes/customerPortalRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { getPublicPlanCatalogPayload } from './services/planCatalogService.js';
import { openapiSpec } from './swagger/openapi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminDir = path.join(__dirname, '../public/admin');
const plansDir = path.join(__dirname, '../public/planos');
const legalDir = path.join(__dirname, '../public/legal');
const customerDir = path.join(__dirname, '../public/area-do-cliente');

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

  /** Catálogo de planos (público) — lê `plan_catalog` no Supabase; fallback em `src/config/plans.js`. */
  app.get('/api/plans', async (_req, res, next) => {
    try {
      res.json(await getPublicPlanCatalogPayload());
    } catch (e) {
      next(e);
    }
  });

  app.use('/api/billing', billingRoutes);
  app.use('/api/customer', customerPortalRoutes);

  // Rotas da API primeiro; HTML sem redirect /admin → /admin/ (evita loop se o proxy
  // remover a barra final).
  app.get(['/planos', '/planos/'], (_req, res) => {
    res.sendFile(path.join(plansDir, 'index.html'));
  });
  app.use(
    '/planos',
    express.static(plansDir, {
      index: false,
      redirect: false,
    })
  );

  app.get(['/area-do-cliente', '/area-do-cliente/'], (_req, res) => {
    res.sendFile(path.join(customerDir, 'index.html'));
  });
  app.use(
    '/area-do-cliente',
    express.static(customerDir, {
      index: false,
      redirect: false,
    })
  );

  app.get(['/legal/termos-de-uso', '/legal/termos-de-uso/'], (_req, res) => {
    res.sendFile(path.join(legalDir, 'termos-de-uso.html'));
  });
  app.get(
    ['/legal/politica-de-privacidade', '/legal/politica-de-privacidade/'],
    (_req, res) => {
      res.sendFile(path.join(legalDir, 'politica-de-privacidade.html'));
    }
  );
  app.use(
    '/legal',
    express.static(legalDir, {
      index: false,
      redirect: false,
    })
  );

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
  app.use('/webhook', asaasWebhookRoutes);

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Rota não encontrada.' });
  });

  app.use(errorHandler);

  return app;
}
