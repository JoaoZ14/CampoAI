import { processIncomingMessage } from '../services/incomingMessageService.js';

/**
 * POST /webhook/whatsapp/z-api
 * Webhook Z-API ("Ao receber") — JSON.
 *
 * No painel Z-API → Instância → Webhook de recebimento:
 *   https://SEU-DOMINIO/webhook/whatsapp/z-api  método POST
 *
 * @see https://developer.z-api.io/webhooks/on-message-received
 */
export async function handleZApiInbound(req, res, next) {
  try {
    const body = req.body ?? {};

    if (body.type !== 'ReceivedCallback') {
      return res.status(200).end();
    }

    if (body.fromMe === true) {
      return res.status(200).end();
    }

    if (body.isGroup === true) {
      return res.status(200).end();
    }

    const phoneDigits =
      typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
    if (!phoneDigits || phoneDigits.length < 8) {
      return res.status(200).end();
    }

    const textFromMessage =
      typeof body.text?.message === 'string' ? body.text.message.trim() : '';
    const caption =
      typeof body.image?.caption === 'string' ? body.image.caption.trim() : '';

    let message;
    if (textFromMessage && caption) {
      message = `${textFromMessage}\n\n${caption}`;
    } else {
      message = textFromMessage || caption || undefined;
    }

    let imageUrl;
    if (typeof body.image?.imageUrl === 'string' && body.image.imageUrl.trim()) {
      imageUrl = body.image.imageUrl.trim();
    }

    if (!message && !imageUrl) {
      return res.status(200).end();
    }

    const payload = {
      phone: `+${phoneDigits}`,
      message,
      imageUrl,
    };

    const asyncAck = process.env.ZAPI_WEBHOOK_ASYNC_ACK === 'true';

    if (asyncAck) {
      res.status(200).end();
      void processIncomingMessage(payload).catch((err) => {
        console.error('[Z-API webhook] falha no processamento async:', err);
      });
      return;
    }

    await processIncomingMessage(payload);
    res.status(200).end();
  } catch (err) {
    next(err);
  }
}
