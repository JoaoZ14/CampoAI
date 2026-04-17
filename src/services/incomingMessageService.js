import { normalizePhone } from '../utils/phone.js';
import { detectMessageType } from '../utils/messageType.js';
import {
  findOrCreateUser,
  incrementUsage,
  isUsageBlocked,
} from '../services/userService.js';
import { generateAgriculturalReply } from '../services/aiService.js';
import {
  sendWhatsAppMessage,
  sendWhatsAppTypingIndicator,
} from '../services/whatsappService.js';
import { AppError } from '../utils/errors.js';

export const MSG_WELCOME =
  'Olá! Sou o AgroAssist — seu parceiro aqui no campo. 👨‍🌾\n\n' +
  'Posso te ajudar com lavoura, pecuária, cuidado com animais e o que estiver pegando na roça.\n\n' +
  'Manda uma foto ou descreve o problema em poucas palavras que eu te oriento com calma, passo a passo.';

export const MSG_LIMIT =
  'Você usou suas análises gratuitas. Quer continuar usando? Planos a partir de R$29.';

export const MSG_IA_ERRO =
  'Não consegui gerar a resposta agora (serviço sobrecarregado ou instável). Tente de novo em um minutinho. Se repetir, avise o suporte.';

/**
 * Fluxo único: Postman/JSON e webhook Twilio.
 * @param {{ phone: string, message?: string, imageUrl?: string, messageSid?: string }} input
 * @param {string} [input.messageSid] SID da mensagem Twilio (SM…/MM…) — para indicador "digitando…"
 */
export async function processIncomingMessage({ phone: rawPhone, message, imageUrl, messageSid }) {
  const phone = normalizePhone(
    typeof rawPhone === 'string' ? rawPhone : String(rawPhone ?? '')
  );

  if (!phone || phone.length < 8) {
    throw new AppError('Telefone inválido.', 400);
  }

  const user = await findOrCreateUser(phone);
  const type = detectMessageType(
    typeof message === 'string' ? message : undefined,
    typeof imageUrl === 'string' ? imageUrl : undefined
  );

  if (type.isEmpty) {
    await sendWhatsAppMessage(phone, MSG_WELCOME);
    return {
      step: 'welcome',
      userId: user.id,
      usageCount: user.usageCount,
    };
  }

  if (isUsageBlocked(user)) {
    await sendWhatsAppMessage(phone, MSG_LIMIT);
    return {
      step: 'limit_reached',
      userId: user.id,
      usageCount: user.usageCount,
      isPaid: user.isPaid,
    };
  }

  const sid =
    typeof messageSid === 'string' && messageSid.trim() ? messageSid.trim() : undefined;
  if (sid) {
    await sendWhatsAppTypingIndicator(sid);
  }

  const ack = process.env.WHATSAPP_IA_ACK_TEXT?.trim();
  if (ack) {
    try {
      await sendWhatsAppMessage(phone, ack);
    } catch (err) {
      console.warn('[incoming] Falha ao enviar mensagem de aguarde:', err);
    }
  }

  let reply;
  try {
    reply = await generateAgriculturalReply({
      text: type.hasText ? String(message).trim() : undefined,
      imageUrl: type.hasImage ? String(imageUrl).trim() : undefined,
    });
  } catch (err) {
    console.error('[incoming] Falha na IA:', err);
    const fallback =
      process.env.WHATSAPP_IA_ERROR_TEXT?.trim() || MSG_IA_ERRO;
    try {
      await sendWhatsAppMessage(phone, fallback);
    } catch (sendErr) {
      console.error('[incoming] Falha ao enviar WhatsApp de erro:', sendErr);
    }
    return {
      step: 'ai_error',
      userId: user.id,
      usageCount: user.usageCount,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  await incrementUsage(user.id);
  await sendWhatsAppMessage(phone, reply);

  const updatedUsage = user.usageCount + 1;

  return {
    step: 'ai_reply',
    userId: user.id,
    usageCount: updatedUsage,
    replyPreview: reply.slice(0, 280),
  };
}
