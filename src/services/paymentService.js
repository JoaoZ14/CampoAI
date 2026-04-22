import { activateUserByAsaasSubscriptionId } from './asaasSubscriptionService.js';
import { AppError } from '../utils/errors.js';

/**
 * Confirmação de pagamento (ex.: encaminhada a partir de outro webhook ou job).
 * @param {string} _userId
 * @param {{ subscription?: string }} paymentPayload
 */
export async function handlePaymentConfirmed(_userId, paymentPayload) {
  const subId =
    paymentPayload &&
    typeof paymentPayload.subscription === 'string' &&
    paymentPayload.subscription.trim()
      ? paymentPayload.subscription.trim()
      : '';
  if (!subId) {
    throw new AppError('Payload sem subscription do Asaas.', 400);
  }
  const r = await activateUserByAsaasSubscriptionId(subId);
  if (!r.ok) {
    throw new AppError('Não foi possível associar a assinatura a um usuário.', 404);
  }
}

/**
 * Checkout hospedado no provedor (não usado com fluxo cartão via API Asaas).
 * @param {string} _userId
 * @returns {Promise<{ checkoutUrl?: string }>}
 */
export async function createCheckoutSession(_userId) {
  return {};
}
