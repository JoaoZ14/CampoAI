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
  getChatHistoryForReport,
  saveChatTurn,
} from '../services/chatHistoryService.js';
import {
  sendWhatsAppMessage,
  sendWhatsAppWithMedia,
  sendWhatsAppContentTemplate,
  sendWhatsAppTypingIndicator,
} from '../services/whatsappService.js';
import { tryResolveFieldCalcMessage } from './fieldCalcService.js';
import { wantsConversationPdfReport } from './reportIntent.js';
import { generateConversationReportText } from './aiService.js';
import { buildConversationReportPdf } from './reportPdfService.js';
import { uploadReportPdfAndGetSignedUrl } from './reportStorageService.js';
import { FREE_USAGE_LIMIT } from '../models/userModel.js';
import { AppError } from '../utils/errors.js';

export const MSG_WELCOME =
  `Você tem ${FREE_USAGE_LIMIT} análises grátis para testar — sem pagar nada na entrada.\n\n` +
  'Sou o AG Assist, seu parceiro no WhatsApp para lavoura, pecuária e cuidado com os animais.\n\n' +
  'Objetivo: te ajudar a decidir melhor, evitar erro bobo e ganhar tempo (sem ficar caçando informação solta).\n\n' +
  'Para ver *plano*, *uso* e *status da assinatura*, mande: *plano* ou *meu plano* (não gasta análise).\n\n' +
  'Para contas de área, semente, tanque, vazão etc.: envie uma linha começando com calc ajuda\n\n' +
  'Manda foto, áudio ou texto que eu respondo direto ao ponto.';

export const MSG_UNSUPPORTED_VIDEO =
  'Por enquanto não analiso vídeo por aqui. Pode mandar texto, foto ou áudio de voz?';

/** Texto base (sem URL). Com `PAYWALL_URL`, o link entra na mesma bolha ou na seguinte — ver `getLimitReachedParts`. */
export const MSG_LIMIT_BASE =
  'Você usou suas análises gratuitas 👨‍🌾\n\n' +
  'Para continuar recebendo recomendações no campo, escolha um plano:';

/**
 * Gera URL de planos com telefone no querystring (prefill da página /planos).
 * @param {string} baseUrl
 * @param {string} phone
 */
function withPhonePrefill(baseUrl, phone) {
  const base = String(baseUrl || '').trim();
  if (!base) return '';
  try {
    const u = new URL(base);
    const digits = String(phone || '').replaceAll(/\D/g, '');
    if (digits) {
      u.searchParams.set('phone', digits.startsWith('55') ? `+${digits}` : `+55${digits}`);
      u.searchParams.set('origin', 'whatsapp_limit');
    }
    return u.toString();
  } catch {
    return base;
  }
}

/**
 * Normaliza URL para o WhatsApp reconhecer link tocável (evita domínio sem esquema).
 * @param {string} raw
 * @returns {string}
 */
function normalizePaywallUrl(raw) {
  const s = String(raw).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

/**
 * Partes da mensagem de limite (uma ou duas bolhas).
 * Sem `PAYWALL_URL`: só o texto base.
 * Com URL e sem `PAYWALL_SINGLE_BUBBLE=true`: duas mensagens — texto explicando + mensagem só com o link (área tocável grande no WhatsApp).
 * Botões nativos estilo app exigem template aprovado no Meta/Twilio (Content API).
 * @returns {string[]}
 */
export function getLimitReachedParts(toPhone = '') {
  const raw = process.env.PAYWALL_URL?.trim();
  if (!raw) return [MSG_LIMIT_BASE];

  const url = withPhonePrefill(normalizePaywallUrl(raw), toPhone);
  const singleBubble =
    process.env.PAYWALL_SINGLE_BUBBLE === 'true' ||
    process.env.PAYWALL_LINK_IN_SAME_MESSAGE === 'true';

  const ctaLine =
    process.env.PAYWALL_CTA_LINE?.trim() ||
    'Toque no link para abrir no navegador e ver os planos:';

  if (singleBubble) {
    return [`${MSG_LIMIT_BASE}\n\n${ctaLine}\n${url}`];
  }

  const first =
    process.env.PAYWALL_FIRST_MESSAGE?.trim() ||
    `${MSG_LIMIT_BASE}\n\n👇 O link para ver os planos vem na mensagem abaixo — toque no endereço em destaque para abrir.`;

  return [first, url];
}

/**
 * Texto único (útil para logs ou testes). Junta as partes em um só bloco.
 */
export function getLimitReachedMessage() {
  return getLimitReachedParts().join('\n\n');
}

const PLAN_DISPLAY = {
  basic: 'Básico',
  pro: 'PRO',
  premium: 'Premium',
};

/**
 * Mensagem curta só com texto: usuário quer ver plano / assinatura / uso (não gasta análise).
 * @param {string} text
 */
export function wantsPlanInquiry(text) {
  const raw = String(text ?? '').trim();
  if (!raw || raw.length > 72) return false;
  const t = raw.toLowerCase().replaceAll(/\s+/g, ' ');
  const exact = new Set([
    'plano',
    'planos',
    'meu plano',
    'meu plano atual',
    'qual meu plano',
    'qual é meu plano',
    'qual e meu plano',
    'assinatura',
    'minha assinatura',
    'status assinatura',
    'status da assinatura',
    'consultar plano',
    'ver plano',
    'ver meu plano',
    'meu plano agora',
    'uso',
    'meu uso',
    'consumo',
  ]);
  if (exact.has(t)) return true;
  if (/^qual\b.*\bplano/.test(t) && t.length < 56) return true;
  if (/^status\b.*\b(assinatura|plano)/.test(t) && t.length < 56) return true;
  return false;
}

/**
 * @param {{ isPaid: boolean, usageCount: number, billingKind?: string, subscriptionPlanCode?: string|null, asaasSubscriptionStatus?: string|null }} user
 * @param {string} phone E.164 (para link /planos)
 */
export function formatPlanInquiryMessage(user, phone) {
  const payUrl = withPhonePrefill(
    normalizePaywallUrl(process.env.PAYWALL_URL?.trim() || ''),
    phone
  );
  const linkLine = payUrl
    ? `\n\n📎 *Ver ou mudar plano no site:*\n${payUrl}`
    : '\n\nPara assinar ou mudar de plano, fale com o suporte.';

  if (user.isPaid) {
    const code = String(user.subscriptionPlanCode || '').toLowerCase();
    const planName = PLAN_DISPLAY[code] || (code ? code.toUpperCase() : 'assinante');
    const status = String(user.asaasSubscriptionStatus || 'ativo').trim() || 'ativo';
    const kind =
      user.billingKind === 'team'
        ? 'contrato equipe / CNPJ'
        : user.billingKind === 'personal'
          ? 'titularidade CPF (individual)'
          : 'ativo';
    return (
      `📋 *Seu plano AG Assist*\n\n` +
      `*Plano:* ${planName}\n` +
      `*Titularidade:* ${kind}\n` +
      `*Status (Asaas):* ${status}\n\n` +
      'As análises com a IA seguem as regras do seu plano. Para cancelamento, troca de cartão ou dúvida de cobrança, use o link abaixo ou o suporte.' +
      linkLine
    );
  }

  const used = Number(user.usageCount) || 0;
  const lim = FREE_USAGE_LIMIT;
  const blocked = used >= lim;
  const head = blocked
    ? `📋 *Seu uso (teste grátis)*\n\nVocê já usou *${used}* de *${lim}* análises gratuitas — o limite do teste acabou.`
    : `📋 *Seu uso (teste grátis)*\n\nVocê já usou *${used}* de *${lim}* análises gratuitas neste número.`;

  return (
    `${head}\n\n` +
    'Assinando um plano, o limite passa a ser o do contrato (veja valores no site).' +
    linkLine +
    '\n\nDica: mande *plano* de novo quando quiser ver este resumo.'
  );
}

/**
 * Botões embaixo da bolha no WhatsApp vêm do Content Template Builder (`contentSid`).
 * Só mensagem com `body` não gera esses botões.
 */
async function sendLimitReachedMessages(toPhone) {
  const contentSid = process.env.PAYWALL_CONTENT_SID?.trim();
  if (contentSid) {
    let variables;
    const custom = process.env.PAYWALL_CONTENT_VARIABLES_JSON?.trim();
    if (custom) {
      try {
        variables = JSON.parse(custom);
      } catch {
        console.warn(
          '[paywall] PAYWALL_CONTENT_VARIABLES_JSON não é JSON válido; usando {{1}} e {{2}} automáticos.'
        );
      }
    }
    if (!variables) {
      const urlRaw = process.env.PAYWALL_URL?.trim();
      const bodyForTemplate =
        process.env.PAYWALL_FIRST_MESSAGE?.trim() || MSG_LIMIT_BASE;
      if (!urlRaw) {
        variables = { 1: bodyForTemplate };
      } else {
        variables = {
          1: bodyForTemplate,
          2: withPhonePrefill(normalizePaywallUrl(urlRaw), toPhone),
        };
      }
    }
    await sendWhatsAppContentTemplate(toPhone, contentSid, variables);
    return;
  }

  const parts = getLimitReachedParts(toPhone);
  for (let i = 0; i < parts.length; i++) {
    await sendWhatsAppMessage(toPhone, parts[i]);
    if (i < parts.length - 1) {
      await new Promise((r) => setTimeout(r, 450));
    }
  }
}

export const MSG_IA_ERRO =
  'Não consegui gerar a resposta agora. Pode ser instabilidade do serviço de IA ou problema na chave da API — tenta de novo em 1–2 minutos. Se continuar igual, fala com o suporte.';

export const MSG_REPORT_INSUFFICIENT =
  'Para montar um relatório em PDF, preciso do histórico da conversa salvo. Ative a memória no servidor (CHAT_HISTORY_ENABLED) e troque pelo menos uma pergunta e uma resposta comigo sobre o assunto antes deste pedido. Depois peça o relatório de novo.';

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

  const planInquiryText =
    type.hasText && message != null ? String(message).trim() : '';
  if (
    planInquiryText &&
    !type.hasImage &&
    !type.hasAudio &&
    wantsPlanInquiry(planInquiryText)
  ) {
    await sendWhatsAppMessage(phone, formatPlanInquiryMessage(user, phone));
    return {
      step: 'plan_inquiry',
      userId: user.id,
      usageCount: user.usageCount,
      isPaid: user.isPaid,
    };
  }

  if (isUsageBlocked(user)) {
    await sendLimitReachedMessages(phone);
    return {
      step: 'limit_reached',
      userId: user.id,
      usageCount: user.usageCount,
      isPaid: user.isPaid,
    };
  }

  const textRaw = type.hasText && message != null ? String(message).trim() : '';
  const reportRequested =
    textRaw &&
    type.hasText &&
    !type.hasImage &&
    !type.hasAudio &&
    wantsConversationPdfReport(textRaw) &&
    process.env.REPORTS_ENABLED !== 'false';

  if (reportRequested) {
    const historyForReport = await getChatHistoryForReport(user.id);
    if (historyForReport.length < 2) {
      await sendWhatsAppMessage(phone, MSG_REPORT_INSUFFICIENT);
      return {
        step: 'report_insufficient_history',
        userId: user.id,
        usageCount: user.usageCount,
      };
    }

    const sidReport =
      typeof messageSid === 'string' && messageSid.trim() ? messageSid.trim() : undefined;
    if (sidReport) {
      await sendWhatsAppTypingIndicator(sidReport);
    }

    try {
      const reportBody = await generateConversationReportText({
        history: historyForReport,
        userInstruction: textRaw,
      });
      const pdfBuf = await buildConversationReportPdf({
        title: 'Relatório — AG Assist',
        body: reportBody,
      });
      const signedUrl = await uploadReportPdfAndGetSignedUrl(user.id, pdfBuf);
      await sendWhatsAppWithMedia(
        phone,
        'Segue o relatório em PDF com o resumo da nossa conversa.',
        [signedUrl]
      );
      await incrementUsage(user.id);
      await saveChatTurn(
        user.id,
        buildUserTurnSummary(type, message),
        'Enviei o relatório em PDF com o resumo da conversa.'
      );
      return {
        step: 'report_pdf_sent',
        userId: user.id,
        usageCount: user.usageCount + 1,
      };
    } catch (err) {
      console.error('[incoming] relatório PDF:', err);
      const fb =
        process.env.WHATSAPP_REPORT_ERROR_TEXT?.trim() ||
        'Não consegui gerar o relatório em PDF agora. Verifique o bucket no Supabase e tente de novo em instantes.';
      try {
        await sendWhatsAppMessage(phone, fb);
      } catch (sendErr) {
        console.error('[incoming] Falha ao enviar erro do relatório:', sendErr);
      }
      return {
        step: 'report_error',
        userId: user.id,
        usageCount: user.usageCount,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (textRaw && type.hasText && !type.hasImage && !type.hasAudio) {
    const calcReply = tryResolveFieldCalcMessage(textRaw);
    if (calcReply) {
      await incrementUsage(user.id);
      await saveChatTurn(user.id, buildUserTurnSummary(type, message), calcReply);
      await sendWhatsAppMessage(phone, calcReply);
      return {
        step: 'field_calc',
        userId: user.id,
        usageCount: user.usageCount + 1,
        replyPreview: calcReply.slice(0, 280),
      };
    }
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
