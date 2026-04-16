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

    await processIncomingMessage({
      phone: phoneRaw,
      message: Body.trim() || undefined,
      imageUrl: imageUrl || undefined,
    });

    // Twilio espera 200; corpo vazio ou TwiML vazio — evita reenvios desnecessários
    res.status(200).type('text/xml').send('<Response></Response>');
  } catch (err) {
    next(err);
  }
}
