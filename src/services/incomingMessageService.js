import { normalizePhone } from '../utils/phone.js';
import { detectMessageType } from '../utils/messageType.js';
import {
  findOrCreateUser,
  incrementUsage,
  isUsageBlocked,
} from '../services/userService.js';
import { generateAgriculturalReply } from '../services/aiService.js';
import { sendWhatsAppMessage } from '../services/whatsappService.js';
import { AppError } from '../utils/errors.js';

export const MSG_WELCOME =
  'Olá! Sou o AgroAssist — seu parceiro aqui no campo. 👨‍🌾\n\n' +
  'Posso te ajudar com lavoura, pecuária, cuidado com animais e o que estiver pegando na roça.\n\n' +
  'Manda uma foto ou descreve o problema em poucas palavras que eu te oriento com calma, passo a passo.';

export const MSG_LIMIT =
  'Você usou suas análises gratuitas. Quer continuar usando? Plano mensal R$29.';

/**
 * Fluxo único: Postman/JSON e webhook Z-API.
 * @param {{ phone: string, message?: string, imageUrl?: string }} input
 */
export async function processIncomingMessage({ phone: rawPhone, message, imageUrl }) {
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

  const reply = await generateAgriculturalReply({
    text: type.hasText ? String(message).trim() : undefined,
    imageUrl: type.hasImage ? String(imageUrl).trim() : undefined,
  });

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
