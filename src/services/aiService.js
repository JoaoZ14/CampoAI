import { GoogleGenerativeAI } from '@google/generative-ai';
import { AppError } from '../utils/errors.js';

const SYSTEM_PROMPT =
  'Você é o AgroAssist: assistente rural no WhatsApp para AGRICULTURA, PECUÁRIA e MEDICINA VETERINÁRIA de campo (orientação geral, não substitui visita de agrônomo ou médico veterinário em casos graves). ' +
  'Abrangência: lavouras (grãos, hortaliças, frutas, café, cana, pastagens cultivadas); solo e adubação em linguagem simples; irrigação e manejo; pragas e doenças de plantas; máquinas e armazenamento básico quando couber. ' +
  'Pecuária: bovinos, ovinos, caprinos, suínos, aves, abelhas, equinos e criações de pequeno porte; nutrição e pastagem; reprodução e manejo de rebanho; instalações, conforto animal e biossegurança em nível produtor. ' +
  'Sanidade animal: sinais clínicos comuns (digestório, respiratório, pele, casco, úbere, nervoso); prevenção de doenças; vacinação e vermifugação apenas como CONCEITOS (sem doses, marcas ou receitas). ' +
  'Leite e qualidade; bem-estar; transporte e manejo com mínimo estresse; noções de zootecnia e nutrição animal sem fórmulas prescritivas. ' +
  'Seja OBJETIVO: vá direto ao ponto. Entregue a resposta COMPLETA (tópicos e frases fechados; nada cortado no meio). ' +
  'TEXTO PURO para WhatsApp: sem Markdown (sem **, __, #, ```, links formatados). Use só • ou 1) para listas. ' +
  'Linguagem simples, acessível a quem trabalha na roça. Trabalhe com hipóteses, o que observar no animal ou na lavoura, e próximos passos seguros. ' +
  'Em suspeita de emergência (animal caído, sangramento forte, não come/bebe, gestação com problema, surto rápido no rebanho), diga para buscar MÉDICO VETERINÁRIO ou serviço oficial na hora. ' +
  'Nunca informe dosagem de medicamentos, venenos agrícolas, antibióticos, vacinas ou defensivos; nunca prescreva tratamento fechado. Não repita a pergunta do usuário.';

/**
 * Tokens de saída do Gemini. Padrão alto para não cortar resposta no meio da frase.
 * Se quiser respostas mais curtas e rápidas, reduza no .env (ex.: 2048).
 */
const DEFAULT_MAX_OUTPUT_TOKENS = () =>
  Math.min(8192, Math.max(512, Number(process.env.LLM_MAX_OUTPUT_TOKENS) || 4096));

/**
 * Resposta fixa para desenvolvimento quando MOCK_LLM=true (sem chamar API externa).
 */
function mockAgriculturalReply({ text, imageUrl }) {
  const excerpt = text?.trim()
    ? text.trim().slice(0, 120) + (text.trim().length > 120 ? '…' : '')
    : '(sem texto)';
  return (
    '[TESTE — MOCK_LLM]\n\n' +
    '• Pode ser falta de nutrientes, rega em excesso ou praga.\n' +
    '• Veja manchas, bichos e se a planta melhora com rega moderada.\n' +
    '• Se piorar, leve amostra a um técnico. Sem produto sem orientação.\n' +
    (imageUrl ? '\n(Imagem recebida — em produção a IA analisaria a foto.)\n' : '') +
    `\nContexto: ${excerpt}`
  );
}

/** Cabeçalhos que reduzem 403/429 em CDNs (ex.: Wikimedia) ao não parecer “bot sem User-Agent”. */
const IMAGE_FETCH_HEADERS = {
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (compatible; AgroAssist/1.0; +https://github.com/) AppleWebKit/537.36 (KHTML, like Gecko)',
};

/**
 * URLs de mídia do Twilio (MediaUrl0 no webhook) exigem HTTP Basic: Account SID + Auth Token.
 * @param {string} imageUrl
 * @returns {Record<string, string>}
 */
function buildImageFetchHeaders(imageUrl) {
  const headers = { ...IMAGE_FETCH_HEADERS };
  let host = '';
  try {
    host = new URL(imageUrl).hostname.toLowerCase();
  } catch {
    return headers;
  }
  if (host !== 'api.twilio.com') {
    return headers;
  }
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) {
    throw new AppError(
      'Mídia do WhatsApp (Twilio): defina TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN no .env para baixar a foto.',
      500
    );
  }
  const basic = Buffer.from(`${sid}:${token}`, 'utf8').toString('base64');
  headers.Authorization = `Basic ${basic}`;
  return headers;
}

/**
 * Baixa imagem (URL pública ou mídia Twilio com Basic Auth) e retorna base64 + mime (para Gemini).
 * Repete 1x em 429 (rate limit) após pequena espera.
 */
async function fetchImageAsInlineData(imageUrl) {
  const maxAttempts = 2;
  let lastStatus = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 25_000);
    try {
      const headers = buildImageFetchHeaders(imageUrl);
      const res = await fetch(imageUrl, {
        signal: controller.signal,
        headers,
      });
      lastStatus = res.status;

      if (res.status === 429 && attempt < maxAttempts - 1) {
        await sleep(2500);
        continue;
      }

      if (!res.ok) {
        throw new AppError(
          `Não foi possível baixar a imagem (HTTP ${res.status}). ` +
            `Dica: Wikimedia e outros sites limitam robôs — use uma URL direta estável (ex.: seu storage) ou tente outro link.`,
          400
        );
      }

      const buf = Buffer.from(await res.arrayBuffer());
      const rawMime = res.headers.get('content-type') || 'image/jpeg';
      const mimeType = rawMime.split(';')[0].trim() || 'image/jpeg';
      if (!mimeType.startsWith('image/')) {
        throw new AppError('A URL não parece ser uma imagem válida.', 400);
      }
      return { mimeType, data: buf.toString('base64') };
    } catch (err) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(`Erro ao obter imagem: ${msg}`, 400);
    } finally {
      clearTimeout(t);
    }
  }

  throw new AppError(
    `Não foi possível baixar a imagem (HTTP ${lastStatus}). Tente outra URL ou envie a foto por um host (Supabase Storage, Imgur, etc.).`,
    400
  );
}

async function generateWithGemini({ text, imageUrl }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new AppError('GEMINI_API_KEY não configurada.', 500);
  }

  // IDs mudam com o tempo; se der 404, ajuste GEMINI_MODEL (ex.: gemini-2.0-flash-001)
  const modelName = process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
  });

  const parts = [];

  if (text?.trim()) {
    parts.push({ text: text.trim() });
  }

  if (imageUrl?.trim()) {
    const { mimeType, data } = await fetchImageAsInlineData(imageUrl.trim());
    parts.push({ inlineData: { mimeType, data } });
  }

  if (parts.length === 0) {
    throw new AppError('Nenhum conteúdo para enviar à IA.', 400);
  }

  if (!text?.trim() && imageUrl?.trim()) {
    parts.unshift({
      text: 'Analise a imagem (lavoura, animal, instalações ou equipamento rural). Resposta completa em tópicos • — hipóteses, o que observar e próximos passos seguros. Não deixe a resposta cortada.',
    });
  }

  const maxAttempts = Math.min(6, Math.max(1, Number(process.env.GEMINI_RETRY_ATTEMPTS) || 2));
  const baseMs = Math.max(400, Number(process.env.GEMINI_RETRY_MS) || 700);
  const maxOut = DEFAULT_MAX_OUTPUT_TOKENS();

  let lastMsg = '';
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          maxOutputTokens: maxOut,
          temperature: 0.35,
          topP: 0.9,
        },
      });

      const cand = result.response.candidates?.[0];
      if (cand?.finishReason === 'MAX_TOKENS') {
        console.warn(
          '[Gemini] Resposta atingiu o limite de tokens (MAX_TOKENS) e pode ter sido cortada. Defina LLM_MAX_OUTPUT_TOKENS maior no .env (até 8192).'
        );
      }

      const reply = result.response.text()?.trim();
      if (!reply) {
        throw new AppError('Resposta vazia do Gemini.', 502);
      }
      return reply;
    } catch (err) {
      if (err instanceof AppError) throw err;
      lastMsg = err instanceof Error ? err.message : String(err);
      const retryable = isRetryableGeminiError(lastMsg);
      if (!retryable || attempt === maxAttempts - 1) {
        throw new AppError(`Falha na API Gemini: ${lastMsg}`, 502);
      }
      const waitMs = baseMs * (attempt + 1);
      console.warn(
        `[Gemini] ${modelName}: tentativa ${attempt + 1}/${maxAttempts} — ${retryable ? 'serviço sobrecarregado ou limite; ' : ''}aguardando ${waitMs}ms...`
      );
      await sleep(waitMs);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 503 / alta demanda / 429 costumam ser temporários — vale repetir a chamada. */
function isRetryableGeminiError(message) {
  const m = message.toLowerCase();
  return (
    m.includes('503') ||
    m.includes('service unavailable') ||
    m.includes('high demand') ||
    m.includes('overloaded') ||
    m.includes('429') ||
    m.includes('too many requests') ||
    m.includes('resource_exhausted') ||
    m.includes('unavailable')
  );
}

/**
 * Gera resposta rural via Google Gemini (único motor de IA).
 * @param {{ text?: string, imageUrl?: string }} input
 * @returns {Promise<string>}
 */
export async function generateAgriculturalReply(input) {
  if (process.env.MOCK_LLM === 'true') {
    return mockAgriculturalReply(input);
  }

  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new AppError(
      'GEMINI_API_KEY não configurada. O AgroAssist usa apenas Google Gemini — crie uma chave em https://aistudio.google.com/apikey',
      500
    );
  }

  return generateWithGemini(input);
}
