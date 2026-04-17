import { processIncomingMessage } from '../services/incomingMessageService.js';

/**
 * Primeira mídia do Twilio: separa imagem vs áudio (WhatsApp voz = áudio/ogg em geral).
 */
function classifyTwilioFirstMedia(req) {
  const numMedia = Number.parseInt(String(req.body?.NumMedia ?? '0'), 10) || 0;
  if (numMedia < 1 || typeof req.body?.MediaUrl0 !== 'string') {
    return { imageUrl: undefined, audioUrl: undefined, unsupportedVideo: false };
  }
  const url = req.body.MediaUrl0;
  const ct = String(req.body?.MediaContentType0 ?? '').toLowerCase();

  if (ct.startsWith('audio/')) {
    return { imageUrl: undefined, audioUrl: url, unsupportedVideo: false };
  }
  if (ct.startsWith('image/')) {
    return { imageUrl: url, audioUrl: undefined, unsupportedVideo: false };
  }
  if (ct.startsWith('video/')) {
    return { imageUrl: undefined, audioUrl: undefined, unsupportedVideo: true };
  }

  if (/\.(ogg|opus)(\?|$)/i.test(url)) {
    return { imageUrl: undefined, audioUrl: url, unsupportedVideo: false };
  }
  if (/\.(mp3|m4a|aac|wav|webm)(\?|$)/i.test(url)) {
    return { imageUrl: undefined, audioUrl: url, unsupportedVideo: false };
  }
  if (/\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(url)) {
    return { imageUrl: url, audioUrl: undefined, unsupportedVideo: false };
  }

  return { imageUrl: url, audioUrl: undefined, unsupportedVideo: false };
}

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
 * - NumMedia / MediaUrl0 / MediaContentType0: mídia (foto ou áudio de voz)
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

    const { imageUrl, audioUrl, unsupportedVideo } = classifyTwilioFirstMedia(req);

    const phoneRaw = String(From).replace(/^whatsapp:/i, '').trim();

    const payload = {
      phone: phoneRaw,
      message: Body.trim() || undefined,
      imageUrl: imageUrl || undefined,
      audioUrl: audioUrl || undefined,
      unsupportedVideo: unsupportedVideo === true,
      messageSid:
        typeof req.body?.MessageSid === 'string' ? req.body.MessageSid : undefined,
    };

    console.log('[Twilio webhook] processando', {
      MessageSid: req.body?.MessageSid,
      NumMedia: numMedia,
      bodyLen: Body.length,
      fromPrefix: String(From).slice(0, 24),
      mediaContentType0: req.body?.MediaContentType0,
      hasAudio: Boolean(audioUrl),
      hasImage: Boolean(imageUrl),
    });

    /**
     * Padrão: responde 200 ao Twilio imediatamente e processa em background.
     * O Twilio encerra a conexão se o servidor demorar ~15s — isso causava “não responde” com IA lenta.
     * Para depurar com o webhook só retornando 200 depois do processamento: TWILIO_WEBHOOK_SYNC=true
     */
    const syncWebhook = process.env.TWILIO_WEBHOOK_SYNC === 'true';

    if (!syncWebhook) {
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
