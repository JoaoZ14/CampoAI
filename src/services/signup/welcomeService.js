import {
  sendSmsMessage,
  sendWhatsAppContentTemplate,
  sendWhatsAppMessage,
} from '../whatsappService.js';

function welcomeSignupContentSid() {
  const raw = process.env.WELCOME_SIGNUP_CONTENT_SID?.trim() ?? '';
  if (!raw) return '';
  if (!/^H[a-z0-9]{20,64}$/i.test(raw)) {
    console.warn(
      '[signup] WELCOME_SIGNUP_CONTENT_SID com formato inválido; ignorando template.'
    );
    return '';
  }
  return raw;
}

function trialExpiredContentSid() {
  const raw = process.env.TRIAL_EXPIRED_CONTENT_SID?.trim() ?? '';
  if (!raw) return '';
  if (!/^H[a-z0-9]{20,64}$/i.test(raw)) {
    console.warn(
      '[trial-expiry] TRIAL_EXPIRED_CONTENT_SID com formato inválido; ignorando template.'
    );
    return '';
  }
  return raw;
}

function whatsappBusinessDigits() {
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim() || '';
  return from.replace(/^whatsapp:/i, '').replaceAll(/\D/g, '');
}

function buildWaMeLink(prefillText) {
  const digits = whatsappBusinessDigits();
  if (!digits) return '';
  const text = encodeURIComponent(prefillText);
  return `https://wa.me/${digits}?text=${text}`;
}

/** URL para abrir conversa com o AG Assist após cadastro no site. */
export function getSignupWhatsappOpenUrl() {
  return buildWaMeLink('Oi! Acabei de me cadastrar no AG Assist.');
}

export function buildSignupWelcomeBody(name) {
  const firstName = String(name ?? '').trim().split(/\s+/)[0] || 'produtor';
  const introduction = process.env.AGENT_TOOLS_ENABLED === 'true'
    ? 'Sou a Lida, sua assistente do AG Assist. Posso tirar dúvidas e ajudar a organizar o sítio: cadastrar a propriedade, talhões e tarefas para você acompanhar no app.\n\nPara começar, como você chama sua propriedade?'
    : 'Sou a Lida, assistente do AG Assist. Posso ajudar com dúvidas sobre o campo; no app você também pode organizar sua propriedade e tarefas.\n\nO que você gostaria de fazer primeiro?';
  return (
    `Olá, ${firstName}! Que bom ter você aqui.\n\n` +
    introduction
  );
}

export function buildTrialExpiredBody(name) {
  const firstName = String(name ?? '').trim().split(/\s+/)[0] || 'produtor';
  return (
    `Olá, ${firstName}! Seu período de teste gratuito do AG Assist acabou.\n\n` +
    'Para continuar com recomendações no campo, escolha um plano no link que enviamos.'
  );
}

/**
 * Boas-vindas proativas após cadastro no site.
 * @param {string} phone E.164
 * @param {string} name
 */
export async function sendSignupWelcome(phone, name) {
  const body = buildSignupWelcomeBody(name);
  const contentSid = welcomeSignupContentSid();
  const firstName = String(name ?? '').trim().split(/\s+/)[0] || 'produtor';

  if (contentSid) {
    try {
      await sendWhatsAppContentTemplate(phone, contentSid, { 1: firstName });
      return { channel: 'whatsapp_template' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[signup] Falha no template de boas-vindas:', msg);
    }
  }

  try {
    await sendWhatsAppMessage(phone, body);
    return { channel: 'whatsapp_text' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[signup] Falha no WhatsApp texto livre:', msg);
  }

  const waLink = buildWaMeLink('Oi! Acabei de me cadastrar no AG Assist.');
  const smsBody = waLink
    ? `Cadastro AG Assist confirmado! Abra o WhatsApp e responda para começar:\n${waLink}`
    : `Cadastro AG Assist confirmado! Mande uma mensagem para o número do AG Assist no WhatsApp para começar.`;
  await sendSmsMessage(phone, smsBody);
  return { channel: 'sms_fallback' };
}

/**
 * Aviso proativo de trial expirado por tempo (cron).
 * @param {string} phone
 * @param {string} name
 * @param {string} plansUrl
 */
export async function sendTrialExpiredNotice(phone, name, plansUrl) {
  const firstName = String(name ?? '').trim().split(/\s+/)[0] || 'produtor';
  const body = buildTrialExpiredBody(name);
  const contentSid = trialExpiredContentSid();

  if (contentSid && plansUrl) {
    try {
      await sendWhatsAppContentTemplate(phone, contentSid, {
        1: firstName,
        2: plansUrl,
      });
      return { channel: 'whatsapp_template' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[trial-expiry] Falha no template:', msg);
    }
  }

  const parts = plansUrl
    ? [`${body}\n\n${plansUrl}`]
    : [body];

  try {
    for (const chunk of parts) {
      await sendWhatsAppMessage(phone, chunk);
    }
    return { channel: 'whatsapp_text' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[trial-expiry] Falha no WhatsApp:', msg);
  }

  const smsBody = plansUrl
    ? `${body}\n\nVer planos: ${plansUrl}`
    : body;
  await sendSmsMessage(phone, smsBody);
  return { channel: 'sms_fallback' };
}
