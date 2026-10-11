import { createSupabaseClient } from '../models/supabaseClient.js';
import { AppError } from '../utils/errors.js';
import { brazilMonthYm } from '../config/billing.js';
import { mapUserRow } from '../models/userModel.js';
import { getProductPlanAnalysisCap } from './productPlanRepository.js';

export async function subscriptionOwner(user, db = createSupabaseClient()) {
  if (!user.organizationId) return user;
  const { data: org, error } = await db.from('organizations').select('id, owner_user_id, is_active').eq('id', user.organizationId).maybeSingle();
  if (error || !org || !org.is_active) throw new AppError('Não foi possível validar sua assinatura de equipe. Fale com o suporte GMK.', 503);
  // Legacy organizations provisioned manually may not have an owner yet.
  if (!org.owner_user_id || org.owner_user_id === user.id) return user;
  const { data: seat, error: seatError } = await db.from('organization_seats').select('id').eq('organization_id', org.id).eq('phone', user.phone).eq('active', true).maybeSingle();
  const { data: owner, error: ownerError } = await db.from('users').select('*').eq('id', org.owner_user_id).maybeSingle();
  if (seatError || ownerError || !seat || !owner?.is_paid) throw new AppError('Seu acesso à assinatura de equipe está indisponível. Fale com o suporte GMK.', 403);
  return mapUserRow(owner);
}

export async function subscriptionUsage(user, db = createSupabaseClient()) {
  const owner = await subscriptionOwner(user, db);
  const terms = owner.subscriptionTerms;
  const cap = terms ? terms.maxAnalysesPerMonth : await getProductPlanAnalysisCap(owner.subscriptionPlanCode, owner.billingKind === 'team' ? 'company' : 'personal');
  return { owner, cap, used: owner.billingUsageYm === brazilMonthYm() ? Number(owner.billingUsageCount) || 0 : 0 };
}

export async function incrementSubscriptionUsage(userId, db = createSupabaseClient()) {
  const { error } = await db.rpc('increment_subscription_usage', { p_user_id: userId });
  if (error) throw new AppError('Não foi possível atualizar o uso da assinatura.', 503);
}

export async function reserveSubscriptionAnalysis(userId, db = createSupabaseClient()) {
  const { data, error } = await db.rpc('reserve_subscription_analysis', { p_user_id: userId });
  if (error && /QUOTA_EXHAUSTED/.test(error.message)) return { exhausted: true };
  if (error) throw new AppError('Não foi possível conferir a franquia agora. Tente novamente.', 503);
  return { id: data?.[0]?.lease_id ?? null, exhausted: false };
}

export async function settleSubscriptionAnalysis(id, charged, db = createSupabaseClient()) {
  const { error } = await db.rpc('settle_subscription_analysis', { p_lease_id: id, p_charged: charged });
  if (error) throw new AppError('Não foi possível atualizar a franquia agora.', 503);
}
