import { processIncomingMessage } from '../services/incomingMessageService.js';

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
 */
export async function handleTwilioInbound(req, res, next) {
  try {
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
