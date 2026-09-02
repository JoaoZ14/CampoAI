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
  const nowIso = new Date().toISOString();

  const [
    { count: totalUsers, error: e1 },
    { count: paidUsers, error: e2 },
    { count: newLast7Days, error: e3 },
    { count: blockedFree, error: e4 },
    { data: usageRows, error: e5 },
    { count: signupsCompleted7d, error: e6 },
    { count: trialsActive, error: e7 },
    { count: trialsExpired, error: e8 },
    { count: activeSubscriptions, error: e9 },
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
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .not('signup_completed_at', 'is', null)
      .gte('signup_completed_at', iso7),
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_paid', false)
      .not('trial_ends_at', 'is', null)
      .gte('trial_ends_at', nowIso),
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_paid', false)
      .not('trial_ends_at', 'is', null)
      .lt('trial_ends_at', nowIso),
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_paid', true)
      .in('asaas_subscription_status', ['ACTIVE', 'active']),
  ]);

  const errs = [e1, e2, e3, e4, e5, e6, e7, e8, e9].filter(Boolean);
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
    signupsCompleted7d: signupsCompleted7d ?? 0,
    trialsActive: trialsActive ?? 0,
    trialsExpired: trialsExpired ?? 0,
    activeSubscriptions: activeSubscriptions ?? 0,
    integrations: {
      gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
      twilio:
        Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()) &&
        Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()) &&
        Boolean(process.env.TWILIO_WHATSAPP_FROM?.trim()),
      resend: Boolean(process.env.RESEND_API_KEY?.trim()),
      asaas: Boolean(process.env.ASAAS_API_KEY?.trim()),
      gnews: Boolean(process.env.GNEWS_API_KEY?.trim()),
      supabase: true,
    },
  };
}

/**
 * Lista usuários com paginação, busca e filtros.
 * @param {{ limit: number, offset: number, q?: string, status?: string }} opts
 */
export async function listAdminUsers({ limit, offset, q, status }) {
  const supabase = getClient();

  let query = supabase.from('users').select('*', { count: 'exact' });
  const term = typeof q === 'string' ? q.trim() : '';
  if (term) {
    const digits = term.replace(/\D/g, '');
    const escaped = term.replace(/[%_]/g, '');
    if (digits.length >= 4) {
      query = query.or(
        `phone.ilike.%${digits}%,name.ilike.%${escaped}%,email.ilike.%${escaped}%`
      );
    } else {
      query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%`);
    }
  }

  const nowIso = new Date().toISOString();
  switch (status) {
    case 'paid':
      query = query.eq('is_paid', true);
      break;
    case 'trial_active':
      query = query.eq('is_paid', false).not('trial_ends_at', 'is', null).gte('trial_ends_at', nowIso);
      break;
    case 'trial_expired':
      query = query.eq('is_paid', false).not('trial_ends_at', 'is', null).lt('trial_ends_at', nowIso);
      break;
    case 'blocked':
      query = query.eq('is_paid', false).gte('usage_count', FREE_USAGE_LIMIT);
      break;
    case 'no_signup':
      query = query.is('signup_completed_at', null);
      break;
    case 'asaas_active':
      query = query.eq('is_paid', true).in('asaas_subscription_status', ['ACTIVE', 'active']);
      break;
    default:
      break;
  }

  const { data, error, count } = await query
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

/**
 * Detalhe de usuário com org e mensagens recentes.
 * @param {string} userId
 */
export async function getAdminUserDetail(userId) {
  const supabase = getClient();
  const user = await getUserById(userId);

  let organization = null;
  if (user.organizationId) {
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('id, name, max_seats, is_active, created_at')
      .eq('id', user.organizationId)
      .maybeSingle();
    if (orgRow) {
      organization = {
        id: orgRow.id,
        name: orgRow.name,
        maxSeats: orgRow.max_seats,
        isActive: orgRow.is_active,
        createdAt: orgRow.created_at,
      };
    }
  }

  const { data: messages } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    user,
    organization,
    recentMessages: (messages ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      content: String(m.content ?? '').slice(0, 500),
      contentTruncated: String(m.content ?? '').length > 500,
      createdAt: m.created_at,
    })),
  };
}

/**
 * Lista solicitações de assinatura (checkout /planos).
 * @param {{ limit: number, offset: number }} opts
 */
export async function listAdminSubscriptionRequests({ limit, offset }) {
  const supabase = getClient();
  const { data, error, count } = await supabase
    .from('subscription_requests')
    .select(
      'id, customer_type, plan_code, name, phone, email, company_name, status, created_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new AppError(`Erro ao listar assinaturas: ${error.message}`, 500);
  }

  const rows = data ?? [];
  const phones = [...new Set(rows.map((r) => r.phone).filter(Boolean))];
  /** @type {Map<string, string>} */
  const userIdByPhone = new Map();
  if (phones.length) {
    const { data: users } = await supabase.from('users').select('id, phone').in('phone', phones);
    for (const u of users ?? []) {
      userIdByPhone.set(u.phone, u.id);
    }
  }

  return {
    rows: rows.map((r) => ({
      id: r.id,
      customerType: r.customer_type,
      planCode: r.plan_code,
      name: r.name,
      phone: r.phone,
      email: r.email,
      companyName: r.company_name,
      status: r.status,
      createdAt: r.created_at,
      userId: userIdByPhone.get(r.phone) ?? null,
    })),
    total: count ?? rows.length,
  };
}

/** Configurações não-secretas para o painel admin. */
export function getAdminSettings() {
  return {
    publicAppUrl: process.env.PUBLIC_APP_URL?.trim() || null,
    signupUrl: process.env.SIGNUP_URL?.trim() || null,
    paywallUrl: process.env.PAYWALL_URL?.trim() || null,
    freeTrialDays: Number(process.env.FREE_TRIAL_DAYS) || 14,
    freeUsageLimit: FREE_USAGE_LIMIT,
    trialExpiryCronEnabled: process.env.TRIAL_EXPIRY_CRON_ENABLED === 'true',
    signupEmailEnabled: process.env.SIGNUP_EMAIL_ENABLED !== 'false',
    integrations: {
      gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
      twilio:
        Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()) &&
        Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()) &&
        Boolean(process.env.TWILIO_WHATSAPP_FROM?.trim()),
      resend: Boolean(process.env.RESEND_API_KEY?.trim()),
      asaas: Boolean(process.env.ASAAS_API_KEY?.trim()),
      gnews: Boolean(process.env.GNEWS_API_KEY?.trim()),
      supabase: true,
    },
  };
}

const BILLING_KINDS = new Set(['free', 'personal', 'team']);

/**
 * Atualiza usuário pelo painel admin (billing, trial, uso, dados).
 * @param {string} userId
 * @param {Record<string, unknown>} body
 */
export async function patchAdminUser(userId, body) {
  const patch = {};

  if (typeof body.isPaid === 'boolean') {
    await patchAdminUserBilling(userId, {
      isPaid: body.isPaid,
      billingKind: typeof body.billingKind === 'string' ? body.billingKind : undefined,
    });
    console.info(`[admin] billing patch userId=${userId} isPaid=${body.isPaid}`);
  }

  if (body.resetUsage === true) {
    patch.usageCount = 0;
    console.info(`[admin] reset usage userId=${userId}`);
  } else if (body.usageCount !== undefined) {
    const n = Number(body.usageCount);
    if (!Number.isFinite(n) || n < 0) {
      throw new AppError('usageCount inválido.', 400);
    }
    patch.usageCount = Math.floor(n);
  }

  if (body.extendTrialDays !== undefined) {
    const days = Number(body.extendTrialDays);
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      throw new AppError('extendTrialDays inválido (1–90).', 400);
    }
    const user = await getUserById(userId);
    const base = user.trialEndsAt ? new Date(user.trialEndsAt) : new Date();
    if (base.getTime() < Date.now()) base.setTime(Date.now());
    base.setDate(base.getDate() + days);
    patch.trialEndsAt = base.toISOString();
    if (!user.trialStartedAt) patch.trialStartedAt = new Date().toISOString();
    console.info(`[admin] extend trial +${days}d userId=${userId}`);
  } else if (body.trialEndsAt !== undefined) {
    patch.trialEndsAt = body.trialEndsAt ? String(body.trialEndsAt) : null;
  }

  if (body.name !== undefined) patch.name = body.name ? String(body.name).trim() : null;
  if (body.email !== undefined) patch.email = body.email ? String(body.email).trim() : null;

  if (Object.keys(patch).length === 0) {
    if (typeof body.isPaid === 'boolean') {
      return getUserById(userId);
    }
    throw new AppError('Nenhum campo para atualizar.', 400);
  }

  return updateUserById(userId, patch);
}

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
