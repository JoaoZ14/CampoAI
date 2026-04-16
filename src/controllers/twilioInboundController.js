import { processIncomingMessage } from '../services/incomingMessageService.js';
import { AppError } from '../utils/errors.js';

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
    if (!req.body || typeof req.body !== 'object') {
      console.error('[Twilio] req.body vazio — verifique parser urlencoded e Content-Type');
      throw new AppError('Corpo da requisição inválido.', 400);
    }

    const From = req.body.From ?? '';
    const Body = typeof req.body.Body === 'string' ? req.body.Body : '';
    const numMedia = Number.parseInt(String(req.body.NumMedia ?? '0'), 10) || 0;

    let imageUrl;
    if (numMedia > 0 && typeof req.body.MediaUrl0 === 'string') {
      imageUrl = req.body.MediaUrl0;
    }

    const phoneRaw = String(From).replace(/^whatsapp:/i, '').trim();

    if (!phoneRaw) {
      console.error('[Twilio] From ausente. Body keys:', Object.keys(req.body));
      throw new AppError('Campo From ausente (não é um webhook Twilio válido).', 400);
    }

    await processIncomingMessage({
      phone: phoneRaw,
      message: Body.trim() || undefined,
      imageUrl: imageUrl || undefined,
    });

    res.status(200).type('text/xml').send('<Response></Response>');
  } catch (err) {
    console.error('[Twilio webhook]', err?.message || err, {
      from: req.body?.From,
      hasBody: !!req.body?.Body,
    });
    next(err);
  }
}
