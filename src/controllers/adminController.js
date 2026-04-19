import {
  getPlanCatalogRowForAdmin,
  savePlanCatalog,
} from '../services/planCatalogService.js';
import {
  getAdminOverview,
  listAdminUsers,
  patchAdminUserBilling,
} from '../services/adminService.js';
import {
  getAdminAnalytics,
  getAdminDashboardBundle,
  listAdminChatMessages,
} from '../services/adminAnalyticsService.js';
import {
  addSeatToOrganization,
  createOrganization,
  listOrganizations,
  listSeatsForOrganization,
  removeSeatFromOrganization,
} from '../services/organizationService.js';

/**
 * GET /admin/api/config — chaves públicas para o cliente Supabase (login no navegador).
 */
export function handleAdminConfig(req, res) {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return res.status(503).json({
      ok: false,
      error:
        'Configure SUPABASE_URL e SUPABASE_ANON_KEY no servidor para o painel (chave anon do projeto).',
    });
  }

  const appUrl = process.env.PUBLIC_APP_URL?.trim();
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  const base = appUrl || `${proto}://${host}`;

  return res.json({
    ok: true,
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    redirectUrl: `${base.replace(/\/$/, '')}/admin/`,
  });
}

/**
 * GET /admin/api/overview
 */
export async function handleAdminOverview(req, res, next) {
  try {
    const overview = await getAdminOverview();
    return res.json({
      ok: true,
      ...overview,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/api/dashboard — overview + analytics + organizações + avisos (uma chamada).
 */
export async function handleAdminDashboard(req, res, next) {
  try {
    const bundle = await getAdminDashboardBundle();
    return res.json({ ok: true, ...bundle });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/api/analytics — só métricas BI.
 */
export async function handleAdminAnalytics(req, res, next) {
  try {
    const analytics = await getAdminAnalytics();
    return res.json({ ok: true, analytics });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/api/chat-messages?limit=&offset=
 */
export async function handleAdminChatMessages(req, res, next) {
  try {
    const rawLimit = Number.parseInt(String(req.query.limit ?? '40'), 10);
    const rawOffset = Number.parseInt(String(req.query.offset ?? '0'), 10);
    const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 40));
    const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
    const { rows, total } = await listAdminChatMessages({ limit, offset });
    return res.json({ ok: true, limit, offset, total, messages: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/api/users?limit=&offset=
 */
export async function handleAdminUsers(req, res, next) {
  try {
    const rawLimit = Number.parseInt(String(req.query.limit ?? '50'), 10);
    const rawOffset = Number.parseInt(String(req.query.offset ?? '0'), 10);
    const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));
    const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);

    const { rows, total } = await listAdminUsers({ limit, offset });

    return res.json({
      ok: true,
      limit,
      offset,
      total,
      users: rows,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /admin/api/users/:userId — plano pessoal (isPaid + billingKind).
 */
export async function handleAdminPatchUser(req, res, next) {
  try {
    const userId = String(req.params.userId ?? '').trim();
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId obrigatório.' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (typeof body.isPaid !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'isPaid (boolean) obrigatório.' });
    }
    const billingKind = typeof body.billingKind === 'string' ? body.billingKind.trim() : undefined;
    const user = await patchAdminUserBilling(userId, {
      isPaid: body.isPaid,
      billingKind,
    });
    return res.json({ ok: true, user });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/api/organizations
 */
export async function handleAdminOrganizationsList(req, res, next) {
  try {
    const organizations = await listOrganizations();
    return res.json({ ok: true, organizations });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.json({
      ok: true,
      organizations: [],
      degraded: true,
      error: msg,
      hint: 'Execute supabase/migration_002_organizations.sql no SQL Editor se as tabelas ainda não existirem.',
    });
  }
}

/**
 * POST /admin/api/organizations  { name?, maxSeats }
 */
export async function handleAdminOrganizationsCreate(req, res, next) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const maxSeats = Number(body.maxSeats ?? body.max_seats);
    const name = body.name;
    const org = await createOrganization({ name, maxSeats });
    return res.status(201).json({ ok: true, organization: org });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/api/organizations/:orgId/seats
 */
export async function handleAdminOrganizationSeats(req, res, next) {
  try {
    const orgId = String(req.params.orgId ?? '').trim();
    if (!orgId) {
      return res.status(400).json({ ok: false, error: 'orgId obrigatório.' });
    }
    const seats = await listSeatsForOrganization(orgId);
    return res.json({ ok: true, seats });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/api/organizations/:orgId/seats  { phone }
 */
export async function handleAdminOrganizationSeatAdd(req, res, next) {
  try {
    const orgId = String(req.params.orgId ?? '').trim();
    const phone = req.body?.phone;
    if (!orgId) {
      return res.status(400).json({ ok: false, error: 'orgId obrigatório.' });
    }
    const result = await addSeatToOrganization(orgId, phone);
    return res.status(201).json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /admin/api/organizations/:orgId/seats  { phone }  (JSON body)
 */
export async function handleAdminOrganizationSeatRemove(req, res, next) {
  try {
    const orgId = String(req.params.orgId ?? '').trim();
    const phone = req.body?.phone;
    if (!orgId) {
      return res.status(400).json({ ok: false, error: 'orgId obrigatório.' });
    }
    const result = await removeSeatFromOrganization(orgId, phone);
    return res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/api/plan-catalog — corpo bruto (version, plans, notes) para edição no painel.
 */
export async function handleAdminPlanCatalog(req, res, next) {
  try {
    const row = await getPlanCatalogRowForAdmin();
    return res.json({
      ok: true,
      version: row.version,
      plans: row.plans,
      notes: row.notes,
      updated_at: row.updated_at,
      seeded: row.seeded,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /admin/api/plan-catalog — grava na tabela `plan_catalog` (validação no servidor).
 */
export async function handleAdminPlanCatalogPut(req, res, next) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const catalog = await savePlanCatalog({
      version: body.version,
      plans: body.plans,
      notes: body.notes,
    });
    return res.json({ ok: true, catalog });
  } catch (err) {
    next(err);
  }
}
