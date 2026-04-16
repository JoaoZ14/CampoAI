/**
 * Camada preparada para integração futura de pagamentos (Stripe, Pagar.me, etc.).
 * Por enquanto não há implementação — apenas contratos e comentários de referência.
 */

/**
 * Quando houver gateway, marcar usuário como pago após webhook de confirmação.
 * @param {string} _userId
 * @param {object} _paymentPayload
 * @returns {Promise<void>}
 */
export async function handlePaymentConfirmed(_userId, _paymentPayload) {
  // TODO: atualizar is_paid no Supabase e registrar assinatura
  throw new Error('Pagamento ainda não implementado.');
}

/**
 * @param {string} _userId
 * @returns {Promise<{ checkoutUrl?: string }>}
 */
export async function createCheckoutSession(_userId) {
  // TODO: retornar URL de checkout do provedor escolhido
  return {};
}
