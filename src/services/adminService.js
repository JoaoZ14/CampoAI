import { createSupabaseClient } from '../models/supabaseClient.js';
import { mapUserRow, FREE_USAGE_LIMIT } from '../models/userModel.js';
import { AppError } from '../utils/errors.js';
import { hasActiveTeamSeatForPhone } from './organizationService.js';
import { getUserById, updateUserById } from './userService.js';

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

const BILLING_KINDS = new Set(['free', 'personal', 'team']);

/**
 * Atualiza cobrança individual (plano pessoal). Não use para quem está em plano equipe.
 * @param {string} userId
 * @param {{ isPaid: boolean, billingKind?: string }} body
 */
export async function patchAdminUserBilling(userId, body) {
  if (typeof body.isPaid !== 'boolean') {
    throw new AppError('Informe isPaid (boolean).', 400);
  }

  const user = await getUserById(userId);
  const hasTeam = await hasActiveTeamSeatForPhone(user.phone);

  if (hasTeam) {
    throw new AppError(
      'Este número está em um plano equipe. Remova o assento na organização antes de alterar o plano individual.',
      409
    );
  }

  const billingKind =
    typeof body.billingKind === 'string' ? body.billingKind.trim() : undefined;
  if (billingKind && !BILLING_KINDS.has(billingKind)) {
    throw new AppError('billingKind inválido (free, personal ou team).', 400);
  }

  if (body.isPaid === false) {
    return updateUserById(userId, {
      isPaid: false,
      billingKind: 'free',
      organizationId: null,
    });
  }

  if (billingKind && billingKind !== 'personal') {
    throw new AppError(
      'Para liberar o plano pessoal use isPaid true e billingKind personal (ou omita billingKind).',
      400
    );
  }

  return updateUserById(userId, {
    isPaid: true,
    billingKind: 'personal',
    organizationId: null,
  });
}
