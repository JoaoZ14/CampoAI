/**
 * Representa um usuário no banco (tabela public.users).
 * Campos espelham o schema SQL; nomes em camelCase na aplicação.
 */

/**
 * @typedef {Object} UserRow
 * @property {string} id
 * @property {string} phone
 * @property {number} usage_count
 * @property {boolean} is_paid
 * @property {string|null} [organization_id]
 * @property {string} [billing_kind]
 * @property {string|null} [subscription_plan_code]
 * @property {string|null} [asaas_subscription_status]
 * @property {string|null} [billing_usage_ym]
 * @property {number} [billing_usage_count]
 * @property {string|null} [name]
 * @property {string|null} [email]
 * @property {string|null} [auth_user_id]
 * @property {string|null} [phone_verified_at]
 * @property {string|null} [cpf]
 * @property {string|null} [signup_completed_at]
 * @property {string|null} [trial_started_at]
 * @property {string|null} [trial_ends_at]
 * @property {string|null} [welcome_sent_at]
 * @property {string|null} [trial_expired_notified_at]
 * @property {string|null} [signup_source]
 * @property {string} created_at
 */

/**
 * @param {UserRow} row
 */
export function mapUserRow(row) {
  return {
    id: row.id,
    phone: row.phone,
    usageCount: row.usage_count,
    isPaid: row.is_paid,
    organizationId: row.organization_id ?? null,
    billingKind: row.billing_kind ?? 'free',
    subscriptionPlanCode: row.subscription_plan_code ?? null,
    asaasSubscriptionStatus: row.asaas_subscription_status ?? null,
    billingUsageYm: row.billing_usage_ym ?? null,
    billingUsageCount: row.billing_usage_count ?? 0,
    name: row.name ?? null,
    email: row.email ?? null,
    authUserId: row.auth_user_id ?? null,
    phoneVerifiedAt: row.phone_verified_at ?? null,
    cpf: row.cpf ?? null,
    signupCompletedAt: row.signup_completed_at ?? null,
    trialStartedAt: row.trial_started_at ?? null,
    trialEndsAt: row.trial_ends_at ?? null,
    welcomeSentAt: row.welcome_sent_at ?? null,
    trialExpiredNotifiedAt: row.trial_expired_notified_at ?? null,
    signupSource: row.signup_source ?? null,
    createdAt: row.created_at,
  };
}

/** Limite de interações gratuitas (análises com IA). */
export const FREE_USAGE_LIMIT = Math.max(
  1,
  Number(process.env.FREE_USAGE_LIMIT) || 10
);

/** Dias do trial gratuito (parte temporal do teste híbrido). */
export const FREE_TRIAL_DAYS = Math.max(
  1,
  Number(process.env.FREE_TRIAL_DAYS) || 14
);
