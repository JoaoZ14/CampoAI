import { AppError } from '../utils/errors.js';

/** Texto longo é enviado em várias mensagens (margem abaixo do limite comum do WhatsApp). */
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

/** E.164 (+5511...) → apenas dígitos para a Z-API. */
function phoneDigitsForZApi(toPhone) {
  return String(toPhone).replace(/\D/g, '');
}

/**
 * Envia mensagem WhatsApp via Z-API (send-text).
 * Textos longos são divididos em várias mensagens.
 * @param {string} toPhone E.164 ou dígitos, ex: +5511999999999
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
    return { zaapId: 'MOCK', parts: parts.length };
  }

  const instanceId = process.env.ZAPI_INSTANCE_ID?.trim();
  const instanceToken = process.env.ZAPI_INSTANCE_TOKEN?.trim();
  const clientToken = process.env.ZAPI_CLIENT_TOKEN?.trim();

  if (!instanceId || !instanceToken) {
    throw new AppError(
      'Z-API não configurada (ZAPI_INSTANCE_ID e ZAPI_INSTANCE_TOKEN no .env).',
      500
    );
  }

  const phone = phoneDigitsForZApi(toPhone);
  if (!phone || phone.length < 8) {
    throw new AppError('Telefone de destino inválido para envio Z-API.', 400);
  }

  const urlBase = `https://api.z-api.io/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(instanceToken)}`;
  const sendUrl = `${urlBase}/send-text`;

  const headers = {
    'Content-Type': 'application/json',
  };
  if (clientToken) {
    headers['Client-Token'] = clientToken;
  }

  try {
    let lastId = '';
    for (let i = 0; i < parts.length; i++) {
      const res = await fetch(sendUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone,
          message: parts[i],
        }),
      });

      const raw = await res.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }

      if (!res.ok) {
        const errMsg =
          typeof data.error === 'string'
            ? data.error
            : typeof data.message === 'string'
              ? data.message
              : raw || res.statusText;
        throw new AppError(
          `Z-API send-text HTTP ${res.status}: ${errMsg || 'erro desconhecido'}`,
          502
        );
      }

      lastId = data.zaapId ?? data.messageId ?? data.id ?? '';
      if (i < parts.length - 1) {
        await sleep(400);
      }
    }
    return { zaapId: lastId, parts: parts.length };
  } catch (err) {
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(`Falha ao enviar WhatsApp (Z-API): ${msg}`, 502);
  }
}
