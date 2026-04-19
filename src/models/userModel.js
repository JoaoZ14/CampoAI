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
    createdAt: row.created_at,
  };
}

/** Limite de interações gratuitas (análises com IA). */
export const FREE_USAGE_LIMIT = 10;
