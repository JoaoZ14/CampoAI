import { timingSafeEqual } from 'node:crypto';
import { processAsaasBillingEvent } from '../services/billing/asaasAccessService.js';

/**
 * POST /webhook/asaas
 * Configure no painel Asaas (Integrações → Webhooks) com o mesmo token em ASAAS_WEBHOOK_TOKEN.
 * Eventos úteis: PAYMENT_RECEIVED, PAYMENT_CONFIRMED.
 */
export function createAsaasWebhookHandler(options = {}) {
return async function handleWebhook(req, res) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!expected) {
    return res.status(503).json({ ok:false, error:'Validação do webhook indisponível.' });
  }
  const got = String(req.headers['asaas-access-token'] ?? '').trim();
  if (Buffer.byteLength(got)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(got),Buffer.from(expected))) {
    return res.status(401).json({ok:false,error:'Token inválido.'});
  }
  try {
    const result = await processAsaasBillingEvent(req.body, options);
    return res.status(200).json({ok:true,...result});
  } catch (error) {
    // Never acknowledge a failed commit; Asaas can resend the same event ID.
    console.error('[asaas webhook] Falha de sincronização:', {eventId:req.body?.id,code:error.statusCode ?? 503});
    return res.status(error.statusCode===400 ? 400 : 503).json({ok:false,error:'Não foi possível sincronizar o evento. Reenvie a notificação.'});
  }
}
}

export const handleAsaasWebhook = createAsaasWebhookHandler();
