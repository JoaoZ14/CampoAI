/** Desconto na cobrança anual em relação a 12× o preço mensal (mesma regra da página /planos). */
export const ANNUAL_DISCOUNT_FRACTION = 0.2;

/** YYYY-MM no fuso America/Sao_Paulo (contagem mensal de análises). */
export function brazilMonthYm() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7);
}

/**
 * Valor total cobrado por ano (uma parcela anual), alinhado ao toggle da vitrine.
 * @param {number} monthlyBrl
 * @returns {number}
 */
export function yearlyTotalFromMonthly(monthlyBrl) {
  const m = Number(monthlyBrl);
  if (!Number.isFinite(m) || m < 0) return 0;
  return Math.round(m * (1 - ANNUAL_DISCOUNT_FRACTION) * 12);
}

/**
 * @param {unknown} v
 * @returns {'MONTHLY'|'YEARLY'}
 */
export function normalizeBillingCycle(v) {
  const s = String(v ?? '')
    .trim()
    .toUpperCase();
  if (s === 'YEARLY' || s === 'ANNUAL' || s === 'YEAR') return 'YEARLY';
  return 'MONTHLY';
}

/**
 * @param {number} monthlyBrl preço mensal do plano (tabela / catálogo)
 * @param {'MONTHLY'|'YEARLY'} cycle
 * @returns {{ value: number, cycle: 'MONTHLY'|'YEARLY' }}
 */
export function subscriptionChargeFromMonthlyPrice(monthlyBrl, cycle) {
  const c = cycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
  const value = c === 'YEARLY' ? yearlyTotalFromMonthly(monthlyBrl) : Number(monthlyBrl);
  return { value, cycle: c };
}
