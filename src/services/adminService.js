import { createSupabaseClient } from '../models/supabaseClient.js';
import { mapUserRow, FREE_USAGE_LIMIT } from '../models/userModel.js';
import { AppError } from '../utils/errors.js';

function getClient() {
  return createSupabaseClient();
}

/**
 * Retorna resumo agregado da tabela users (uso em painel dev).
 */
export async function getAdminOverview() {
  const supabase = getClient();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const iso7 = sevenDaysAgo.toISOString();

  const [
    { count: totalUsers, error: e1 },
    { count: paidUsers, error: e2 },
    { count: newLast7Days, error: e3 },
    { count: blockedFree, error: e4 },
    { data: usageRows, error: e5 },
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_paid', true),
    supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', iso7),
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_paid', false)
      .gte('usage_count', FREE_USAGE_LIMIT),
    supabase.from('users').select('usage_count'),
  ]);

  const errs = [e1, e2, e3, e4, e5].filter(Boolean);
  if (errs.length) {
    throw new AppError(`Erro ao agregar dados: ${errs[0].message}`, 500);
  }

  let totalUsage = 0;
  for (const row of usageRows ?? []) {
    totalUsage += Number(row.usage_count) || 0;
  }

  return {
    totalUsers: totalUsers ?? 0,
    paidUsers: paidUsers ?? 0,
    freeUsers: Math.max(0, (totalUsers ?? 0) - (paidUsers ?? 0)),
    newLast7Days: newLast7Days ?? 0,
    blockedFreeTier: blockedFree ?? 0,
    freeUsageLimit: FREE_USAGE_LIMIT,
    totalUsageSum: totalUsage,
    integrations: {
      gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
      twilio:
        Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()) &&
        Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()) &&
        Boolean(process.env.TWILIO_WHATSAPP_FROM?.trim()),
      supabase: true,
    },
  };
}

/**
 * Lista usuários com paginação simples.
 * @param {{ limit: number, offset: number }} opts
 */
export async function listAdminUsers({ limit, offset }) {
  const supabase = getClient();

  const { data, error, count } = await supabase
    .from('users')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new AppError(`Erro ao listar usuários: ${error.message}`, 500);
  }

  if (!data) {
    return { rows: [], total: 0 };
  }

  return {
    rows: data.map((row) => mapUserRow(row)),
    total: count ?? data.length,
  };
}
