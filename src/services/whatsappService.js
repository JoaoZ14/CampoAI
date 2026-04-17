import twilio from 'twilio';
import { AppError } from '../utils/errors.js';

/** Twilio WhatsApp: corpo da mensagem limitado a 1600 caracteres por envio. */
const MAX_WHATSAPP_BODY = 1550;

/**
 * Parte o texto em blocos que cabem no limite, preferindo quebras em linha ou espaço.
 * @param {string} text
 * @returns {string[]}
 */
function splitMessageForWhatsApp(text) {
  const s = text.trim();
  if (s.length <= MAX_WHATSAPP_BODY) return [s];

  const chunks = [];
  let start = 0;
  while (start < s.length) {
    let end = Math.min(start + MAX_WHATSAPP_BODY, s.length);
    if (end < s.length) {
      const slice = s.slice(start, end);
      const nl = slice.lastIndexOf('\n');
      const sp = slice.lastIndexOf(' ');
      if (nl >= MAX_WHATSAPP_BODY * 0.35) {
        end = start + nl + 1;
      } else if (sp >= MAX_WHATSAPP_BODY * 0.35) {
        end = start + sp + 1;
      }
    }
    const piece = s.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end <= start) end = start + MAX_WHATSAPP_BODY;
    start = end;
  }
  return chunks.length ? chunks : [s.slice(0, MAX_WHATSAPP_BODY)];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Indicador "digitando..." no WhatsApp (Twilio Messaging API).
 * Requer o SID da mensagem recebida (SM… ou MM…). Falha silenciosa se não houver credenciais.
 * @param {string} messageSid
 * @see https://www.twilio.com/docs/whatsapp/api/typing-indicators-resource
 */
export async function sendWhatsAppTypingIndicator(messageSid) {
  const id = typeof messageSid === 'string' ? messageSid.trim() : '';
  if (!id || !/^(SM|MM)/.test(id)) return;

  if (process.env.MOCK_WHATSAPP === 'true') {
    console.log(`[MOCK_WHATSAPP] typing indicator para messageId=${id}`);
    return;
  }

  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) return;

  const auth = Buffer.from(`${sid}:${token}`, 'utf8').toString('base64');
  const body = new URLSearchParams({ messageId: id, channel: 'whatsapp' });

  try {
    const res = await fetch('https://messaging.twilio.com/v2/Indicators/Typing.json', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn(`[Twilio] typing indicator HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Twilio] typing indicator: ${msg}`);
  }
}

/**
 * Envia mensagem WhatsApp via Twilio para o número informado.
 * Textos longos são divididos em várias mensagens (limite 1600 caracteres).
 * @param {string} toPhone E.164, ex: +5511999999999
 * @param {string} body
 */
export async function sendWhatsAppMessage(toPhone, body) {
  const parts = splitMessageForWhatsApp(body);

  if (process.env.MOCK_WHATSAPP === 'true') {
    console.log(
      `[MOCK_WHATSAPP] Para: ${toPhone} | ${parts.length} parte(s) | ${body.length} caracteres`
    );
    parts.forEach((p, i) =>
      console.log(`  [${i + 1}/${parts.length}]`, p.slice(0, 160) + (p.length > 160 ? '…' : ''))
    );
    return { sid: 'MOCK_SID', status: 'mocked', parts: parts.length };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token || !from) {
    throw new AppError(
      'Twilio não configurado (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM).',
      500
    );
  }

  const client = twilio(sid, token);
  const to = toPhone.startsWith('whatsapp:') ? toPhone : `whatsapp:${toPhone}`;

  try {
    let lastSid = '';
    let lastStatus = '';
    for (let i = 0; i < parts.length; i++) {
      const message = await client.messages.create({
        from,
        to,
        body: parts[i],
      });
      lastSid = message.sid;
      lastStatus = message.status ?? '';
      if (i < parts.length - 1) {
        await sleep(400);
      }
    }
    return { sid: lastSid, status: lastStatus, parts: parts.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(`Falha ao enviar WhatsApp (Twilio): ${msg}`, 502);
  }
}

/**
 * Template do Content Template Builder (ex.: botão "Ver planos" abaixo da mensagem no WhatsApp).
 * Não use `body` junto com `contentSid` — o Twilio substitui o conteúdo pelo template.
 * @param {string} toPhone E.164
 * @param {string} contentSid Ex.: HXxxxx… do console Twilio
 * @param {Record<string, string | number>} variables Placeholders {{1}}, {{2}}, etc.
 * @see https://www.twilio.com/docs/content/send-templates-created-with-the-content-template-builder
 */
export async function sendWhatsAppContentTemplate(
  toPhone,
  contentSid,
  variables = {}
) {
  const sidTemplate = typeof contentSid === 'string' ? contentSid.trim() : '';
  if (!sidTemplate || !/^H[a-z0-9]{20,64}$/i.test(sidTemplate)) {
    throw new AppError('ContentSid inválido (copie o SID H… do Content Template Builder no Twilio).', 500);
  }

  /** @type {Record<string, string>} */
  const flat = {};
  for (const [k, v] of Object.entries(variables)) {
    flat[String(k)] = v == null ? '' : String(v);
  }
  const contentVariables = JSON.stringify(flat);

  if (process.env.MOCK_WHATSAPP === 'true') {
    console.log(
      `[MOCK_WHATSAPP] Content template | Para: ${toPhone} | contentSid=${sidTemplate} | vars=${contentVariables}`
    );
    return { sid: 'MOCK_SID', status: 'mocked', content: true };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token || !from) {
    throw new AppError(
      'Twilio não configurado (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM).',
      500
    );
  }

  const client = twilio(sid, token);
  const to = toPhone.startsWith('whatsapp:') ? toPhone : `whatsapp:${toPhone}`;

  try {
    const message = await client.messages.create({
      from,
      to,
      contentSid: sidTemplate,
      contentVariables,
    });
    return {
      sid: message.sid ?? '',
      status: message.status ?? '',
      parts: 1,
      content: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(`Falha ao enviar template WhatsApp (Twilio): ${msg}`, 502);
  }
}
