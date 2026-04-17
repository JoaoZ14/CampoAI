import { normalizePhone } from '../utils/phone.js';
import { detectMessageType } from '../utils/messageType.js';
import {
  findOrCreateUser,
  incrementUsage,
  isUsageBlocked,
} from '../services/userService.js';
import { generateAgriculturalReply } from '../services/aiService.js';
import {
  getChatHistoryForModel,
  saveChatTurn,
} from '../services/chatHistoryService.js';
import {
  sendWhatsAppMessage,
  sendWhatsAppTypingIndicator,
} from '../services/whatsappService.js';
import { AppError } from '../utils/errors.js';

export const MSG_WELCOME =
  'Olá! Sou o AgroAssist — seu parceiro aqui no campo. 👨‍🌾\n\n' +
  'Posso te ajudar com lavoura, pecuária, cuidado com animais e o que estiver pegando na roça.\n\n' +
  'Manda uma foto, um áudio de voz ou descreve o problema em poucas palavras que eu te oriento com calma, passo a passo.';

export const MSG_UNSUPPORTED_VIDEO =
  'Por enquanto não analiso vídeo por aqui. Pode mandar texto, foto ou áudio de voz?';

/** Texto base (sem URL). A mensagem enviada ao usuário inclui PAYWALL_URL quando definida. */
export const MSG_LIMIT_BASE =
  'Você usou suas análises gratuitas. Quer continuar usando? Planos a partir de R$29.';

/**
 * Mensagem quando o usuário gratuito atinge o limite. Inclui link se `PAYWALL_URL` estiver no .env.
 */
export function getLimitReachedMessage() {
  const url = process.env.PAYWALL_URL?.trim();
  if (!url) return MSG_LIMIT_BASE;
  return `${MSG_LIMIT_BASE}\n\n${url}`;
}

export const MSG_IA_ERRO =
  'Não consegui gerar a resposta agora. Pode ser instabilidade do serviço de IA ou problema na chave da API — tenta de novo em 1–2 minutos. Se continuar igual, fala com o suporte.';

function buildUserTurnSummary(type, message) {
  const chunks = [];
  if (type.hasText && message != null && String(message).trim()) {
    chunks.push(String(message).trim());
  }
  if (type.hasImage) chunks.push('[Foto enviada]');
  if (type.hasAudio) chunks.push('[Áudio enviado]');
  return chunks.join(' ').trim() || '[mensagem]';
}

/**
 * Fluxo único: Postman/JSON e webhook Twilio.
 * @param {{ phone: string, message?: string, imageUrl?: string, audioUrl?: string, unsupportedVideo?: boolean, messageSid?: string }} input
 * @param {string} [input.messageSid] SID da mensagem Twilio (SM…/MM…) — para indicador "digitando…"
 */
export async function processIncomingMessage({
  phone: rawPhone,
  message,
  imageUrl,
  audioUrl,
  unsupportedVideo,
  messageSid,
}) {
  const phone = normalizePhone(
    typeof rawPhone === 'string' ? rawPhone : String(rawPhone ?? '')
  );

  if (!phone || phone.length < 8) {
    throw new AppError('Telefone inválido.', 400);
  }

  const user = await findOrCreateUser(phone);

  if (unsupportedVideo === true) {
    await sendWhatsAppMessage(phone, MSG_UNSUPPORTED_VIDEO);
    return {
      step: 'unsupported_video',
      userId: user.id,
      usageCount: user.usageCount,
    };
  }

  const type = detectMessageType(
    typeof message === 'string' ? message : undefined,
    typeof imageUrl === 'string' ? imageUrl : undefined,
    typeof audioUrl === 'string' ? audioUrl : undefined
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
    await sendWhatsAppMessage(phone, getLimitReachedMessage());
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

  const history = await getChatHistoryForModel(user.id);

  let reply;
  try {
    reply = await generateAgriculturalReply({
      text: type.hasText ? String(message).trim() : undefined,
      imageUrl: type.hasImage ? String(imageUrl).trim() : undefined,
      audioUrl: type.hasAudio ? String(audioUrl).trim() : undefined,
      history,
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
  await saveChatTurn(
    user.id,
    buildUserTurnSummary(type, message),
    reply
  );
  await sendWhatsAppMessage(phone, reply);

  const updatedUsage = user.usageCount + 1;

  return {
    step: 'ai_reply',
    userId: user.id,
    usageCount: updatedUsage,
    replyPreview: reply.slice(0, 280),
  };
}
