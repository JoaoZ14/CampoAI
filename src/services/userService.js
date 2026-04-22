import { createSupabaseClient } from '../models/supabaseClient.js';
import { mapUserRow, FREE_USAGE_LIMIT } from '../models/userModel.js';
import { AppError } from '../utils/errors.js';
import { normalizePhone } from '../utils/phone.js';

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
    .select('usage_count')
    .eq('id', userId)
    .single();

  if (fetchErr || !row) {
    throw new AppError('Usuário não encontrado para incrementar uso.', 500);
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
 * Verifica se o usuário gratuito excedeu o limite.
 * @param {{ usageCount: number, isPaid: boolean }} user
 */
export function isUsageBlocked(user) {
  if (user.isPaid) return false;
  return user.usageCount >= FREE_USAGE_LIMIT;
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

  if (Object.keys(row).length === 0) {
    throw new AppError('Nenhum campo para atualizar.', 400);
  }

  const { data, error } = await supabase.from('users').update(row).eq('id', userId).select('*').single();
  if (error) {
    throw new AppError(`Erro ao atualizar usuário: ${error.message}`, 500);
  }
  return mapUserRow(data);
}
