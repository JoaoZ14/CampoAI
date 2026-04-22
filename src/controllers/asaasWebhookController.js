import { activateUserByAsaasSubscriptionId } from '../services/asaasSubscriptionService.js';

/**
 * POST /webhook/asaas
 * Configure no painel Asaas (Integrações → Webhooks) com o mesmo token em ASAAS_WEBHOOK_TOKEN.
 * Eventos úteis: PAYMENT_RECEIVED, PAYMENT_CONFIRMED.
 */
export async function handleAsaasWebhook(req, res) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (expected) {
    const got = String(req.headers['asaas-access-token'] ?? '').trim();
    if (got !== expected) {
      return res.status(401).json({ ok: false, error: 'token inválido' });
    }
  } else {
    console.warn('[asaas webhook] ASAAS_WEBHOOK_TOKEN vazio — webhook desprotegido.');
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const event = String(body.event || '');

  try {
    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
      const pay = body.payment;
      const subId =
        pay && typeof pay.subscription === 'string'
          ? pay.subscription
          : pay && typeof pay.subscriptionId === 'string'
            ? pay.subscriptionId
            : '';
      if (subId) {
        await activateUserByAsaasSubscriptionId(subId);
      }
    }
  } catch (err) {
    console.error('[asaas webhook] processamento:', err);
  }

  return res.status(200).json({ ok: true });
}
