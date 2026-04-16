import { createSupabaseClient } from '../models/supabaseClient.js';
import { mapUserRow, FREE_USAGE_LIMIT } from '../models/userModel.js';
import { AppError } from '../utils/errors.js';

function getClient() {
  return createSupabaseClient();
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
    .insert({ phone, usage_count: 0, is_paid: false })
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
