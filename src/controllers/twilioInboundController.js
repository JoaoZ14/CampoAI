import { processIncomingMessage } from '../services/incomingMessageService.js';

function digitsOnlyWa(s) {
  return String(s ?? '')
    .replace(/^whatsapp:/i, '')
    .replace(/\D/g, '');
}

/**
 * Eventos que não são “mensagem nova do cliente” (ex.: status de entrega/leitura
 * quando o mesmo URL é usado como Status callback) — evita responder de novo no chat Twilio.
 */
function shouldIgnoreTwilioWebhook(req) {
  const From = req.body?.From ?? '';
  const Body = typeof req.body?.Body === 'string' ? req.body.Body : '';
  const numMedia = Number.parseInt(String(req.body?.NumMedia ?? '0'), 10) || 0;
  const fromDigits = digitsOnlyWa(From);
  const businessDigits = digitsOnlyWa(process.env.TWILIO_WHATSAPP_FROM ?? '');

  // Resposta/status do próprio número Twilio (eco ou callback de envio)
  if (fromDigits && businessDigits && fromDigits === businessDigits) {
    return true;
  }

  const msgStatus = String(req.body?.MessageStatus || req.body?.SmsStatus || '')
    .trim()
    .toLowerCase();
  const looksLikeDelivery =
    msgStatus &&
    [
      'queued',
      'sending',
      'sent',
      'delivered',
      'undelivered',
      'failed',
      'read',
      'canceled',
    ].includes(msgStatus);

  if (numMedia === 0 && !Body.trim() && looksLikeDelivery) {
    return true;
  }

  return false;
}

/**
 * POST /webhook/whatsapp/twilio
 * Webhook oficial do Twilio (WhatsApp): application/x-www-form-urlencoded.
 *
 * Campos usados:
 * - From: ex. whatsapp:+5511999999999
 * - Body: texto da mensagem
 * - NumMedia / MediaUrl0: mídia (foto) enviada pelo usuário
 *
 * No Twilio Console → número/sandbox → "When a message comes in":
 *   https://SEU-DOMINIO/webhook/whatsapp/twilio  método POST
 *
 * Dica: não use a mesma URL como **Status callback** de mensagens enviadas; se usar,
 * este handler ignora POSTs que parecem só status (sem texto/mídia) ou com From = número do negócio.
 */
export async function handleTwilioInbound(req, res, next) {
  try {
    if (shouldIgnoreTwilioWebhook(req)) {
      console.log('[Twilio webhook] ignorado (eco/status), MessageSid=', req.body?.MessageSid);
      return res.status(200).type('text/xml').send('<Response></Response>');
    }

    const From = req.body?.From ?? '';
    const Body = typeof req.body?.Body === 'string' ? req.body.Body : '';
    const numMedia = Number.parseInt(String(req.body?.NumMedia ?? '0'), 10) || 0;

    let imageUrl;
    if (numMedia > 0 && typeof req.body?.MediaUrl0 === 'string') {
      imageUrl = req.body.MediaUrl0;
    }

    const phoneRaw = String(From).replace(/^whatsapp:/i, '').trim();

    const payload = {
      phone: phoneRaw,
      message: Body.trim() || undefined,
      imageUrl: imageUrl || undefined,
    };

    console.log('[Twilio webhook] processando', {
      MessageSid: req.body?.MessageSid,
      NumMedia: numMedia,
      bodyLen: Body.length,
      fromPrefix: String(From).slice(0, 24),
    });

    /**
     * Padrão: processa tudo antes do 200 (usuário sempre recebe resposta ou erro visível no Twilio).
     * Só use background se souber o que está fazendo: TWILIO_WEBHOOK_ASYNC_ACK=true
     * (pode falhar em silêncio se o processo morrer após responder ao Twilio).
     */
    const asyncAck = process.env.TWILIO_WEBHOOK_ASYNC_ACK === 'true';

    if (asyncAck) {
      res.status(200).type('text/xml').send('<Response></Response>');
      void processIncomingMessage(payload).catch((err) => {
        console.error('[Twilio webhook] falha no processamento async:', err);
      });
      return;
    }

    await processIncomingMessage(payload);
    res.status(200).type('text/xml').send('<Response></Response>');
  } catch (err) {
    next(err);
  }
}
