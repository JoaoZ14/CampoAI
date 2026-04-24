import { brazilMonthYm } from '../config/billing.js';
import { createSupabaseClient } from '../models/supabaseClient.js';
import { mapUserRow, FREE_USAGE_LIMIT } from '../models/userModel.js';
import { AppError } from '../utils/errors.js';
import { normalizePhone } from '../utils/phone.js';
import { getProductPlanAnalysisCap } from './productPlanRepository.js';

function getClient() {
  return createSupabaseClient();
}

async function fetchUserPhonesPage(supabase, from, pageSize) {
  const { data, error } = await supabase
    .from('users')
    .select('phone')
    .range(from, from + pageSize - 1);

  if (error) {
    throw new AppError(`Erro ao listar telefones de usuários: ${error.message}`, 500);
  }
  return data ?? [];
}

/**
 * Telefones distintos da tabela `users` (E.164 após normalização), para broadcast (ex.: resumo semanal).
 */
export async function listDistinctUserPhones() {
  const supabase = getClient();
  const pageSize = 1000;
  const seen = new Set();
  let from = 0;

  for (;;) {
    const rows = await fetchUserPhonesPage(supabase, from, pageSize);
    if (!rows.length) break;

    for (const row of rows) {
      const raw = typeof row.phone === 'string' ? row.phone.trim() : '';
      if (!raw) continue;
      const p = normalizePhone(raw);
      if (p && p.replaceAll(/\D/g, '').length >= 10) {
        seen.add(p);
      }
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return [...seen];
}

/**
 * Busca usuário pelo telefone ou cria com valores padrão.
 * @param {string} phone
 */
export async function findOrCreateUser(phone) {
  const supabase = getClient();

  const { data: existing, error: findErr } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (findErr) {
    throw new AppError(`Erro ao buscar usuário: ${findErr.message}`, 500);
  }

  if (existing) {
    return mapUserRow(existing);
  }

  const { data: created, error: insertErr } = await supabase
    .from('users')
    .insert({ phone, usage_count: 0, is_paid: false, billing_kind: 'free' })
    .select('*')
    .single();

  if (insertErr) {
    throw new AppError(`Erro ao criar usuário: ${insertErr.message}`, 500);
  }

  return mapUserRow(created);
}

/**
 * Incrementa contador de uso após uma análise com IA concluída.
 * @param {string} userId
 */
export async function incrementUsage(userId) {
  const supabase = getClient();

  const { data: row, error: fetchErr } = await supabase
    .from('users')
    .select(
      'usage_count, is_paid, billing_kind, subscription_plan_code, billing_usage_ym, billing_usage_count'
    )
    .eq('id', userId)
    .single();

  if (fetchErr || !row) {
    throw new AppError('Usuário não encontrado para incrementar uso.', 500);
  }

  const paid = Boolean(row.is_paid);
  const seg = row.billing_kind === 'team' ? 'company' : 'personal';
  const planCode = String(row.subscription_plan_code || '').toLowerCase();
  const cap = paid ? await getProductPlanAnalysisCap(planCode, seg) : null;

  if (!paid) {
    const next = (row.usage_count ?? 0) + 1;
    const { error: updateErr } = await supabase
      .from('users')
      .update({ usage_count: next })
      .eq('id', userId);
    if (updateErr) {
      throw new AppError(`Erro ao atualizar uso: ${updateErr.message}`, 500);
    }
    return;
  }

  if (cap != null && cap >= 1) {
    const ym = brazilMonthYm();
    let ymu = row.billing_usage_ym ?? null;
    let cnt = Number(row.billing_usage_count) || 0;
    if (ymu !== ym) {
      ymu = ym;
      cnt = 0;
    }
    cnt += 1;
    const { error: updateErr } = await supabase
      .from('users')
      .update({ billing_usage_ym: ymu, billing_usage_count: cnt })
      .eq('id', userId);
    if (updateErr) {
      throw new AppError(`Erro ao atualizar uso mensal: ${updateErr.message}`, 500);
    }
    return;
  }

  const next = (row.usage_count ?? 0) + 1;
  const { error: updateErr } = await supabase
    .from('users')
    .update({ usage_count: next })
    .eq('id', userId);
  if (updateErr) {
    throw new AppError(`Erro ao atualizar uso: ${updateErr.message}`, 500);
  }
}

/**
 * Contexto para limite de uso (grátis por usage_count; pago com teto por billing_usage_*).
 * @typedef {{ isPaid: boolean, usageCount: number, monthlyAnalysisCap: number|null, monthlyAnalysisUsed: number }} UsageAccessContext
 */

/**
 * Monta contexto de bloqueio (zera contador mensal se mudou o mês em SP).
 * @param {ReturnType<typeof mapUserRow>} user
 * @returns {Promise<UsageAccessContext>}
 */
export async function buildUsageAccessContext(user) {
  const supabase = getClient();
  const { data: row, error } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
  if (error || !row) {
    return {
      isPaid: Boolean(user.isPaid),
      usageCount: user.usageCount ?? 0,
      monthlyAnalysisCap: null,
      monthlyAnalysisUsed: 0,
    };
  }

  const u = mapUserRow(row);
  if (!u.isPaid) {
    return {
      isPaid: false,
      usageCount: u.usageCount ?? 0,
      monthlyAnalysisCap: null,
      monthlyAnalysisUsed: 0,
    };
  }

  const seg = u.billingKind === 'team' ? 'company' : 'personal';
  const planCode = String(u.subscriptionPlanCode || '').toLowerCase();
  const cap = await getProductPlanAnalysisCap(planCode, seg);

  if (cap == null || cap < 1) {
    return {
      isPaid: true,
      usageCount: u.usageCount ?? 0,
      monthlyAnalysisCap: null,
      monthlyAnalysisUsed: 0,
    };
  }

  const ym = brazilMonthYm();
  let used = Number(u.billingUsageCount) || 0;
  let ymu = u.billingUsageYm ?? null;

  if (ymu !== ym) {
    const { error: upErr } = await supabase
      .from('users')
      .update({ billing_usage_ym: ym, billing_usage_count: 0 })
      .eq('id', user.id);
    if (!upErr) {
      ymu = ym;
      used = 0;
    }
  }

  return {
    isPaid: true,
    usageCount: u.usageCount ?? 0,
    monthlyAnalysisCap: cap,
    monthlyAnalysisUsed: used,
  };
}

/**
 * @param {UsageAccessContext} ctx
 */
export function isUsageBlocked(ctx) {
  if (!ctx.isPaid) return ctx.usageCount >= FREE_USAGE_LIMIT;
  if (ctx.monthlyAnalysisCap == null || ctx.monthlyAnalysisCap < 1) return false;
  return (Number(ctx.monthlyAnalysisUsed) || 0) >= ctx.monthlyAnalysisCap;
}

/**
 * @param {string} userId
 */
export async function getUserById(userId) {
  const supabase = getClient();
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
  if (error) {
    throw new AppError(`Erro ao buscar usuário: ${error.message}`, 500);
  }
  if (!data) {
    throw new AppError('Usuário não encontrado.', 404);
  }
  return mapUserRow(data);
}

/**
 * @param {string} userId
 * @param {{
 *   isPaid?: boolean,
 *   billingKind?: string,
 *   organizationId?: string|null,
 *   asaasCustomerId?: string|null,
 *   asaasSubscriptionId?: string|null,
 *   subscriptionPlanCode?: string|null,
 *   asaasSubscriptionStatus?: string|null,
 *   asaasCheckoutStartedAt?: string|null,
 *   billingUsageYm?: string|null,
 *   billingUsageCount?: number,
 * }} patch
 */
export async function updateUserById(userId, patch) {
  const supabase = getClient();
  const row = {};
  if (typeof patch.isPaid === 'boolean') row.is_paid = patch.isPaid;
  if (patch.billingKind !== undefined) row.billing_kind = patch.billingKind;
  if (patch.organizationId !== undefined) row.organization_id = patch.organizationId;
  if (patch.asaasCustomerId !== undefined) row.asaas_customer_id = patch.asaasCustomerId;
  if (patch.asaasSubscriptionId !== undefined) row.asaas_subscription_id = patch.asaasSubscriptionId;
  if (patch.subscriptionPlanCode !== undefined) row.subscription_plan_code = patch.subscriptionPlanCode;
  if (patch.asaasSubscriptionStatus !== undefined) row.asaas_subscription_status = patch.asaasSubscriptionStatus;
  if (patch.asaasCheckoutStartedAt !== undefined) {
    row.asaas_checkout_started_at = patch.asaasCheckoutStartedAt;
  }
  if (patch.billingUsageYm !== undefined) row.billing_usage_ym = patch.billingUsageYm;
  if (patch.billingUsageCount !== undefined) row.billing_usage_count = patch.billingUsageCount;

  if (Object.keys(row).length === 0) {
    throw new AppError('Nenhum campo para atualizar.', 400);
  }

  const { data, error } = await supabase.from('users').update(row).eq('id', userId).select('*').single();
  if (error) {
    throw new AppError(`Erro ao atualizar usuário: ${error.message}`, 500);
  }
  return mapUserRow(data);
}

/**
 * Reserva exclusiva para criar assinatura Asaas (uma linha por vez; stale libera retry).
 * @param {string} userId UUID do usuário
 * @returns {Promise<boolean>} true se obteve a reserva
 */
export async function claimAsaasCheckoutLock(userId) {
  const supabase = getClient();
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc('claim_asaas_checkout', {
    p_user_id: userId,
    p_stale_before: staleBefore,
  });
  if (error) {
    throw new AppError(`Erro ao reservar checkout: ${error.message}`, 500);
  }
  return Boolean(data);
}

/**
 * Libera reserva de checkout após falha (assinatura ainda não gravada no usuário).
 * @param {string} userId
 */
export async function releaseAsaasCheckoutClaim(userId) {
  const supabase = getClient();
  const { error } = await supabase.rpc('release_asaas_checkout_claim', { p_user_id: userId });
  if (error) {
    console.warn('[billing] release_asaas_checkout_claim:', error.message);
  }
}
