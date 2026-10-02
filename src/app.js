import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import webhookRoutes from './routes/whatsappRoutes.js';
import asaasWebhookRoutes from './routes/asaasWebhookRoutes.js';
import billingRoutes from './routes/billingRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import signupRoutes from './routes/signupRoutes.js';
import customerPortalRoutes from './routes/customerPortalRoutes.js';
import ruralRoutes from './routes/ruralRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { getPublicPlanCatalogPayload } from './services/planCatalogService.js';
import { getLandingNewsPayload } from './services/landingNewsService.js';
import { openapiSpec } from './swagger/openapi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminDir = path.join(__dirname, '../public/admin');
const plansDir = path.join(__dirname, '../public/planos');
const signupDir = path.join(__dirname, '../public/cadastro');
const loginDir = path.join(__dirname, '../public/entrar');
const legalDir = path.join(__dirname, '../public/legal');
const customerDir = path.join(__dirname, '../public/area-do-cliente');
const sharedDir = path.join(__dirname, '../public/shared');
const reactAppDir = path.join(__dirname, '../app/dist');

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set('X-Request-ID', req.requestId);
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
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
      customSiteTitle: 'AGGI — API',
      customCss: '.swagger-ui .topbar { display: none }',
    })
  );

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'AGGI API' });
  });

  /** Catálogo de planos (público) — lê `plan_catalog` no Supabase; fallback em `src/config/plans.js`. */
  app.get('/api/plans', async (_req, res, next) => {
    try {
      res.json(await getPublicPlanCatalogPayload());
    } catch (e) {
      next(e);
    }
  });

  /**
   * Notícias do agro (público) — cache em `news_articles` (Supabase);
   * atualiza via GNews se o TTL estiver vencido (padrão 24h).
   */
  app.get('/api/noticias', async (_req, res, next) => {
    try {
      res.set('Cache-Control', 'public, max-age=300');
      res.json(await getLandingNewsPayload());
    } catch (e) {
      next(e);
    }
  });

  app.use('/api/billing', billingRoutes);
  app.use('/api/signup', signupRoutes);
  app.use('/api/customer', customerPortalRoutes);
  app.use('/api/rural', ruralRoutes);

  app.use('/app', express.static(reactAppDir, { index: false, redirect: false }));
  app.get(['/app', '/app/'], (req, res) => {
    if (req.path === '/app') return res.redirect(308, '/app/');
    res.sendFile(path.join(reactAppDir, 'index.html'));
  });

  // Rotas da API primeiro; HTML sem redirect /admin → /admin/ (evita loop se o proxy
  // remover a barra final).
  app.use(
    '/shared',
    express.static(sharedDir, {
      index: false,
      redirect: false,
    })
  );

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

  app.get(['/cadastro', '/cadastro/'], (_req, res) => {
    res.sendFile(path.join(signupDir, 'index.html'));
  });
  app.use(
    '/cadastro',
    express.static(signupDir, {
      index: false,
      redirect: false,
    })
  );

  app.get(['/entrar', '/entrar/'], (_req, res) => {
    res.sendFile(path.join(loginDir, 'index.html'));
  });
  app.use(
    '/entrar',
    express.static(loginDir, {
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
  app.get(['/admin/login', '/admin/login/'], (_req, res) => {
    res.sendFile(path.join(adminDir, 'login.html'));
  });
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
