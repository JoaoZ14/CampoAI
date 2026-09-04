import { GoogleGenerativeAI } from '@google/generative-ai';
import { AppError } from '../utils/errors.js';
import {
  AUDIO_ONLY_PROMPT,
  buildSystemInstruction,
  IMAGE_AND_AUDIO_PROMPT,
  IMAGE_ONLY_PROMPT,
  REPORT_SYSTEM_INSTRUCTION,
} from './llmPrompts.js';
import { generateWithOllama, isOllamaConfigured } from './ollamaService.js';
import { formatWhatsAppReply } from '../utils/whatsappFormat.js';

/**
 * Tokens de saída do Gemini. Padrão alto para não cortar resposta no meio da frase.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = () =>
  Math.min(8192, Math.max(512, Number(process.env.LLM_MAX_OUTPUT_TOKENS) || 4096));

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_AUTO_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

function buildGeminiModelChain() {
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const explicit = process.env.GEMINI_MODEL_FALLBACK?.trim();
  const disableAuto = process.env.GEMINI_DISABLE_AUTO_FALLBACK === 'true';
  const autoModel =
    process.env.GEMINI_AUTO_FALLBACK_MODEL?.trim() || DEFAULT_AUTO_FALLBACK_MODEL;

  const chain = [primary];
  if (explicit && explicit !== primary && !chain.includes(explicit)) {
    chain.push(explicit);
  }
  if (!disableAuto && autoModel && !chain.includes(autoModel)) {
    chain.push(autoModel);
  }
  return chain;
}

function mockAgriculturalReply({ text, imageUrl, audioUrl, fieldCalcMode }) {
  if (fieldCalcMode) {
    return '[TESTE — MOCK_LLM calc]\nm²/10.000\n→ (simule valores reais com LLM ativo)';
  }
  const excerpt = text?.trim()
    ? text.trim().slice(0, 120) + (text.trim().length > 120 ? '…' : '')
    : '(sem texto)';
  return (
    '[TESTE — MOCK_LLM]\n\n' +
    'POSSÍVEIS CAUSAS\n' +
    '- Falta de nutrientes ou praga nas folhas.\n\n' +
    'O QUE OBSERVAR\n' +
    '- Manchas, bichos e resposta da planta à rega moderada.\n\n' +
    'O QUE FAZER AGORA\n' +
    '- Isolar área afetada e evitar produto sem orientação.\n\n' +
    '⚠️ QUANDO CHAMAR UM PROFISSIONAL\n' +
    '- Se piorar em 48h ou houver surto no rebanho.\n' +
    (imageUrl ? '\n(Imagem recebida — em produção o Gemini analisaria a foto.)\n' : '') +
    (audioUrl ? '\n(Áudio recebido — em produção o Gemini transcreveria e responderia.)\n' : '') +
    `\nContexto: ${excerpt}`
  );
}

const DEFAULT_UA =
  'Mozilla/5.0 (compatible; AG-Assist/1.0; +https://github.com/) AppleWebKit/537.36 (KHTML, like Gecko)';

function buildMediaFetchHeaders(mediaUrl, opts = {}) {
  const accept = opts.accept ?? '*/*';
  const headers = {
    Accept: accept,
    'User-Agent': DEFAULT_UA,
  };
  let host = '';
  try {
    host = new URL(mediaUrl).hostname.toLowerCase();
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
      'Mídia do WhatsApp (Twilio): defina TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN no .env para baixar foto ou áudio.',
      500
    );
  }
  const basic = Buffer.from(`${sid}:${token}`, 'utf8').toString('base64');
  headers.Authorization = `Basic ${basic}`;
  return headers;
}

async function fetchMediaAsInlineData(mediaUrl, kind) {
  const maxAttempts = 2;
  let lastStatus = 0;
  const accept =
    kind === 'image'
      ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      : 'audio/*,*/*;q=0.8';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 60_000);
    try {
      const headers = buildMediaFetchHeaders(mediaUrl, { accept });
      const res = await fetch(mediaUrl, {
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
          `Não foi possível baixar a mídia (HTTP ${res.status}).`,
          400
        );
      }

      const buf = Buffer.from(await res.arrayBuffer());
      const rawMime = res.headers.get('content-type') || (kind === 'image' ? 'image/jpeg' : 'audio/ogg');
      let mimeType = rawMime.split(';')[0].trim() || (kind === 'image' ? 'image/jpeg' : 'audio/ogg');

      if (kind === 'image' && !mimeType.startsWith('image/')) {
        throw new AppError('A URL não parece ser uma imagem válida.', 400);
      }
      if (kind === 'audio' && !mimeType.startsWith('audio/')) {
        if (mimeType === 'application/ogg' || /\.(ogg|opus)(\?|$)/i.test(mediaUrl)) {
          mimeType = 'audio/ogg';
        } else {
          throw new AppError(
            'A URL não parece ser um áudio válido (esperado audio/*).',
            400
          );
        }
      }

      return { mimeType, data: buf.toString('base64') };
    } catch (err) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(`Erro ao obter mídia: ${msg}`, 400);
    } finally {
      clearTimeout(t);
    }
  }

  throw new AppError(
    `Não foi possível baixar a mídia (HTTP ${lastStatus}).`,
    400
  );
}

async function generateWithGemini({ text, imageUrl, audioUrl, history = [], fieldCalcMode = false }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new AppError('GEMINI_API_KEY não configurada.', 500);
  }

  const genAI = new GoogleGenerativeAI(key);
  const parts = [];

  if (text?.trim()) {
    parts.push({ text: text.trim() });
  }

  if (imageUrl?.trim()) {
    const { mimeType, data } = await fetchMediaAsInlineData(imageUrl.trim(), 'image');
    parts.push({ inlineData: { mimeType, data } });
  }

  if (audioUrl?.trim()) {
    const { mimeType, data } = await fetchMediaAsInlineData(audioUrl.trim(), 'audio');
    parts.push({ inlineData: { mimeType, data } });
  }

  if (parts.length === 0) {
    throw new AppError('Nenhum conteúdo para enviar à IA.', 400);
  }

  if (!text?.trim()) {
    if (imageUrl?.trim() && !audioUrl?.trim()) {
      parts.unshift({ text: IMAGE_ONLY_PROMPT });
    } else if (audioUrl?.trim() && !imageUrl?.trim()) {
      parts.unshift({ text: AUDIO_ONLY_PROMPT });
    } else if (imageUrl?.trim() && audioUrl?.trim()) {
      parts.unshift({ text: IMAGE_AND_AUDIO_PROMPT });
    }
  }

  /** @type {{ role: string, parts: unknown[] }[]} */
  const contents = [];
  for (const h of history) {
    if (!h?.text?.trim()) continue;
    const role = h.role === 'assistant' ? 'model' : 'user';
    contents.push({ role, parts: [{ text: h.text.trim() }] });
  }
  contents.push({ role: 'user', parts });

  const modelChain = buildGeminiModelChain();
  console.log('[Gemini] ordem de modelos:', modelChain.join(' → '), '| msgs histórico:', history.length);

  const maxAttempts = Math.min(8, Math.max(1, Number(process.env.GEMINI_RETRY_ATTEMPTS) || 1));
  const baseMs = Math.max(0, Number(process.env.GEMINI_RETRY_MS) || 800);
  const maxOut = DEFAULT_MAX_OUTPUT_TOKENS();
  const systemInstruction = buildSystemInstruction(fieldCalcMode);
  const outTokens = fieldCalcMode ? Math.min(384, maxOut) : maxOut;
  const temperature = fieldCalcMode ? 0.12 : 0.35;

  for (let mi = 0; mi < modelChain.length; mi++) {
    const modelName = modelChain[mi];
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction,
    });

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await model.generateContent({
          contents,
          generationConfig: {
            maxOutputTokens: outTokens,
            temperature,
            topP: fieldCalcMode ? 0.85 : 0.9,
          },
        });

        const cand = result.response.candidates?.[0];
        if (cand?.finishReason === 'MAX_TOKENS') {
          console.warn(
            '[Gemini] Resposta atingiu o limite de tokens (MAX_TOKENS). Defina LLM_MAX_OUTPUT_TOKENS maior no .env (até 8192).'
          );
        }

        const reply = result.response.text()?.trim();
        if (!reply) {
          throw new AppError('Resposta vazia do Gemini.', 502);
        }
        return reply;
      } catch (err) {
        if (err instanceof AppError) throw err;
        const lastMsg = err instanceof Error ? err.message : String(err);
        const retryable = isRetryableGeminiError(lastMsg);

        if (!retryable) {
          throw new AppError(`Falha na API Gemini: ${lastMsg}`, 502);
        }

        const lastModel = mi === modelChain.length - 1;
        const lastTryOnModel = attempt === maxAttempts - 1;
        const waitMs = baseMs * (attempt + 1);

        console.warn(`[Gemini] ${modelName} tentativa ${attempt + 1}/${maxAttempts} — ${lastMsg.slice(0, 160)}`);

        if (!lastTryOnModel && maxAttempts > 1) {
          await sleep(waitMs);
          continue;
        }

        if (!lastModel) {
          console.warn(`[Gemini] Alternando para: ${modelChain[mi + 1]}`);
          break;
        }

        throw new AppError(`Falha na API Gemini: ${lastMsg}`, 502);
      }
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function hasMultimodalInput(input) {
  return Boolean(input.imageUrl?.trim() || input.audioUrl?.trim());
}

function resolveTextProvider() {
  const explicit = process.env.LLM_TEXT_PROVIDER?.trim().toLowerCase();
  if (explicit === 'gemini') return 'gemini';
  if (explicit === 'ollama') return 'ollama';
  return isOllamaConfigured() ? 'ollama' : 'gemini';
}

function geminiFallbackEnabled() {
  return process.env.OLLAMA_FALLBACK_GEMINI !== 'false';
}

function finalizeAgriculturalReply(reply, fieldCalcMode = false) {
  return formatWhatsAppReply(reply, { fieldCalcMode });
}

/**
 * Texto → Ollama (Qwen local). Foto/áudio → Gemini.
 * @param {{ text?: string, imageUrl?: string, audioUrl?: string, history?: { role: 'user' | 'assistant', text: string }[], fieldCalcMode?: boolean }} input
 */
export async function generateAgriculturalReply(input) {
  const fieldCalcMode = Boolean(input.fieldCalcMode);

  if (process.env.MOCK_LLM === 'true') {
    return finalizeAgriculturalReply(mockAgriculturalReply(input), fieldCalcMode);
  }

  if (hasMultimodalInput(input)) {
    if (!process.env.GEMINI_API_KEY?.trim()) {
      throw new AppError(
        'GEMINI_API_KEY não configurada. Foto e áudio usam Gemini — crie uma chave em https://aistudio.google.com/apikey',
        500
      );
    }
    console.log('[LLM] rota: Gemini (mídia)');
    const reply = await generateWithGemini(input);
    return finalizeAgriculturalReply(reply, fieldCalcMode);
  }

  const textProvider = resolveTextProvider();

  if (textProvider === 'ollama') {
    console.log('[LLM] rota: Ollama (texto)');
    try {
      const reply = await generateWithOllama({
        text: input.text ?? '',
        history: input.history ?? [],
        fieldCalcMode,
      });
      return finalizeAgriculturalReply(reply, fieldCalcMode);
    } catch (err) {
      const canFallback =
        geminiFallbackEnabled() && process.env.GEMINI_API_KEY?.trim();
      if (!canFallback) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[LLM] Ollama falhou; fallback Gemini (texto):', msg.slice(0, 200));
      console.log('[LLM] rota: Gemini (texto — fallback Ollama)');
      const reply = await generateWithGemini(input);
      return finalizeAgriculturalReply(reply, fieldCalcMode);
    }
  }

  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new AppError(
      'GEMINI_API_KEY não configurada. Defina a chave ou use Ollama (LLM_TEXT_PROVIDER=ollama).',
      500
    );
  }

  console.log('[LLM] rota: Gemini (texto)');
  const reply = await generateWithGemini(input);
  return finalizeAgriculturalReply(reply, fieldCalcMode);
}

export async function generateConversationReportText(input) {
  if (process.env.MOCK_LLM === 'true') {
    return (
      'RELATÓRIO DE CONVERSA — TESTE (MOCK_LLM)\n\n' +
      'RESUMO\n• Conteúdo simulado para desenvolvimento sem API Gemini.\n\n' +
      'AVISO\nOrientação geral; não substitui técnico presencial.'
    );
  }

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new AppError(
      'GEMINI_API_KEY não configurada — necessária para gerar o relatório.',
      500
    );
  }

  const hist = Array.isArray(input.history) ? input.history : [];
  const transcript = hist
    .filter((h) => h?.text?.trim())
    .map((h) => {
      const who = h.role === 'assistant' ? 'Assistente' : 'Usuário';
      return `${who}: ${h.text.trim()}`;
    })
    .join('\n\n');

  const instruction = String(input.userInstruction ?? '').trim() || 'Relatório da conversa';

  const userPayload =
    `Pedido do usuário sobre o relatório:\n${instruction}\n\n` +
    '=== Transcrição da conversa (ordem cronológica) ===\n\n' +
    (transcript || '(Sem mensagens anteriores.)');

  const genAI = new GoogleGenerativeAI(key);
  const modelChain = buildGeminiModelChain();
  const maxOut = Math.min(8192, Math.max(2048, Number(process.env.LLM_MAX_OUTPUT_TOKENS) || 6144));
  const maxAttempts = Math.min(6, Math.max(1, Number(process.env.GEMINI_RETRY_ATTEMPTS) || 1));
  const baseMs = Math.max(0, Number(process.env.GEMINI_RETRY_MS) || 800);

  for (let mi = 0; mi < modelChain.length; mi++) {
    const modelName = modelChain[mi];
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: REPORT_SYSTEM_INSTRUCTION,
    });

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: userPayload }] }],
          generationConfig: {
            maxOutputTokens: maxOut,
            temperature: 0.25,
            topP: 0.85,
          },
        });

        const reply = result.response.text()?.trim();
        if (!reply) throw new AppError('Resposta vazia do Gemini ao gerar relatório.', 502);
        return reply;
      } catch (err) {
        if (err instanceof AppError) throw err;
        const lastMsg = err instanceof Error ? err.message : String(err);
        const retryable = isRetryableGeminiError(lastMsg);
        if (!retryable) throw new AppError(`Falha ao gerar relatório (Gemini): ${lastMsg}`, 502);

        const lastModel = mi === modelChain.length - 1;
        const lastTryOnModel = attempt === maxAttempts - 1;
        if (!lastTryOnModel && maxAttempts > 1) {
          await sleep(baseMs * (attempt + 1));
          continue;
        }
        if (!lastModel) break;
        throw new AppError(`Falha ao gerar relatório (Gemini): ${lastMsg}`, 502);
      }
    }
  }

  throw new AppError('Não foi possível gerar o texto do relatório.', 502);
}
