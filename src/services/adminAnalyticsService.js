import { createSupabaseClient } from '../models/supabaseClient.js';
import { AppError } from '../utils/errors.js';

function getClient() {
  return createSupabaseClient();
}

/**
 * Contagem segura (retorna null se tabela/coluna inexistente ou erro).
 */
async function safeCount(table, applyFilter) {
  const supabase = getClient();
  try {
    let q = supabase.from(table).select('*', { count: 'exact', head: true });
    if (typeof applyFilter === 'function') q = applyFilter(q);
    const { count, error } = await q;
    if (error) {
      console.warn(`[admin] count ${table}:`, error.message);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.warn(`[admin] count ${table}:`, e);
    return null;
  }
}

function dayKeyUtc(iso) {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

/**
 * Métricas agregadas para BI / dashboard.
 */
export async function getAdminAnalytics() {
  const supabase = getClient();
  const now = Date.now();
  const iso7 = new Date(now - 7 * 86400000).toISOString();
  const iso14 = new Date(now - 14 * 86400000).toISOString();
  const iso30 = new Date(now - 30 * 86400000).toISOString();

  const messagesTotal = await safeCount('chat_messages');
  const messagesLast7Days = await safeCount('chat_messages', (q) => q.gte('created_at', iso7));
  const messagesLast30Days = await safeCount('chat_messages', (q) => q.gte('created_at', iso30));

  const orgCount = await safeCount('organizations');
  const activeSeats = await safeCount('organization_seats', (q) => q.eq('active', true));

  let usersByBilling = { free: 0, personal: 0, team: 0, unknown: 0 };
  let signupsLast14Days = [];
  let topUsersByUsage = [];
  let avgUsagePaid = null;
  let avgUsageFree = null;

  const { data: allUsers, error: uErr } = await supabase.from('users').select('*');
  if (uErr) {
    console.warn('[admin] analytics users:', uErr.message);
  } else {
    const rows = allUsers ?? [];
    const dayBuckets = new Map();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      dayBuckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const row of rows) {
      const bk = row.billing_kind ?? 'free';
      if (bk === 'personal') usersByBilling.personal += 1;
      else if (bk === 'team') usersByBilling.team += 1;
      else if (bk === 'free') usersByBilling.free += 1;
      else usersByBilling.unknown += 1;

      const created = row.created_at;
      if (created) {
        const key = dayKeyUtc(created);
        if (dayBuckets.has(key)) {
          dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + 1);
        }
      }
    }
    signupsLast14Days = [...dayBuckets.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const sorted = [...rows].sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0));
    topUsersByUsage = sorted.slice(0, 15).map((row) => ({
      phone: row.phone,
      usageCount: row.usage_count ?? 0,
      billingKind: row.billing_kind ?? 'free',
      isPaid: row.is_paid ?? false,
      createdAt: row.created_at,
    }));

    const paid = rows.filter((r) => r.is_paid);
    const free = rows.filter((r) => !r.is_paid);
    if (paid.length) {
      avgUsagePaid = paid.reduce((s, r) => s + (r.usage_count ?? 0), 0) / paid.length;
    }
    if (free.length) {
      avgUsageFree = free.reduce((s, r) => s + (r.usage_count ?? 0), 0) / free.length;
    }
  }

  return {
    messagesTotal,
    messagesLast7Days,
    messagesLast30Days,
    usersByBilling,
    signupsLast14Days,
    topUsersByUsage,
    avgUsagePaid: avgUsagePaid != null ? Math.round(avgUsagePaid * 100) / 100 : null,
    avgUsageFree: avgUsageFree != null ? Math.round(avgUsageFree * 100) / 100 : null,
    organizationsCount: orgCount,
    activeSeatsCount: activeSeats,
  };
}

/**
 * Histórico recente de mensagens (memória Gemini) com telefone do usuário.
 * @param {{ limit: number, offset: number }} opts
 */
export async function listAdminChatMessages({ limit, offset }) {
  const supabase = getClient();
  const { data, error, count } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at, user_id', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new AppError(`Erro ao listar mensagens: ${error.message}`, 500);
  }

  const msgs = data ?? [];
  const userIds = [...new Set(msgs.map((m) => m.user_id).filter(Boolean))];
  /** @type {Map<string, string>} */
  const phoneByUserId = new Map();
  if (userIds.length) {
    const { data: userRows, error: uErr } = await supabase
      .from('users')
      .select('id, phone')
      .in('id', userIds);
    if (!uErr && userRows) {
      for (const u of userRows) {
        phoneByUserId.set(u.id, u.phone);
      }
    }
  }

  const rows = msgs.map((r) => {
    const full = String(r.content ?? '');
    return {
      id: r.id,
      role: r.role,
      content: full.slice(0, 500),
      contentTruncated: full.length > 500,
      createdAt: r.created_at,
      userId: r.user_id,
      phone: phoneByUserId.get(r.user_id) ?? '—',
    };
  });

  return { rows, total: count ?? rows.length };
}

/**
 * Resumo do painel em uma única chamada (com avisos se algo falhar).
 */
export async function getAdminDashboardBundle() {
  const { getAdminOverview } = await import('./adminService.js');
  const { listOrganizations } = await import('./organizationService.js');

  const warnings = [];

  let overview;
  try {
    overview = await getAdminOverview();
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : 'Falha ao carregar overview.', 500);
  }

  let analytics = null;
  try {
    analytics = await getAdminAnalytics();
  } catch (e) {
    warnings.push({
      code: 'analytics',
      message: e instanceof Error ? e.message : String(e),
    });
  }

  let organizations = [];
  try {
    organizations = await listOrganizations();
  } catch (e) {
    warnings.push({
      code: 'organizations',
      message:
        'Não foi possível carregar organizações. Rode o SQL migration_002_organizations.sql no Supabase se ainda não rodou.',
    });
  }

  return {
    overview,
    analytics,
    organizations,
    warnings,
  };
}
