import { getAdminOverview, listAdminUsers } from '../services/adminService.js';

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
