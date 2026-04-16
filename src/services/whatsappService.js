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
