import { AppError } from '../utils/errors.js';
import { buildSystemInstruction } from './llmPrompts.js';

const DEFAULT_OLLAMA_BASE = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'qwen2.5:7b-instruct-q4_K_M';

function ollamaBaseUrl() {
  return (process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE).replace(/\/$/, '');
}

function ollamaModel() {
  return process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
}

function ollamaTimeoutMs() {
  const n = Number(process.env.OLLAMA_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}

function maxOutputTokens(fieldCalcMode) {
  const maxOut = Math.min(8192, Math.max(512, Number(process.env.LLM_MAX_OUTPUT_TOKENS) || 4096));
  return fieldCalcMode ? Math.min(384, maxOut) : maxOut;
}

/**
 * @param {{ role: 'user' | 'assistant', text: string }[]} history
 * @param {string} userText
 */
function buildOllamaMessages(history, userText, fieldCalcMode) {
  /** @type {{ role: string, content: string }[]} */
  const messages = [{ role: 'system', content: buildSystemInstruction(fieldCalcMode) }];

  for (const h of history) {
    if (!h?.text?.trim()) continue;
    messages.push({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.text.trim(),
    });
  }

  messages.push({ role: 'user', content: userText.trim() });
  return messages;
}

function isRetryableOllamaError(message) {
  const m = message.toLowerCase();
  return (
    m.includes('econnrefused') ||
    m.includes('fetch failed') ||
    m.includes('timeout') ||
    m.includes('503') ||
    m.includes('502') ||
    m.includes('429') ||
    m.includes('overloaded')
  );
}

/**
 * Gera resposta de texto via Ollama (Qwen local).
 * @param {{ text: string, history?: { role: 'user' | 'assistant', text: string }[], fieldCalcMode?: boolean }} input
 */
export async function generateWithOllama({ text, history = [], fieldCalcMode = false }) {
  const userText = text?.trim();
  if (!userText) {
    throw new AppError('Nenhum texto para enviar ao Ollama.', 400);
  }

  const url = `${ollamaBaseUrl()}/api/chat`;
  const model = ollamaModel();
  const messages = buildOllamaMessages(history, userText, fieldCalcMode);
  const temperature = fieldCalcMode ? 0.12 : 0.35;
  const numPredict = maxOutputTokens(fieldCalcMode);
  const maxAttempts = Math.min(3, Math.max(1, Number(process.env.OLLAMA_RETRY_ATTEMPTS) || 2));

  console.log('[Ollama] modelo:', model, '| histórico:', history.length, '| calc:', fieldCalcMode);

  let lastMsg = '';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ollamaTimeoutMs());

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature,
            top_p: fieldCalcMode ? 0.85 : 0.9,
            num_predict: numPredict,
          },
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errText =
          typeof body?.error === 'string'
            ? body.error
            : `HTTP ${res.status} ao chamar Ollama`;
        throw new Error(errText);
      }

      const reply = body?.message?.content?.trim();
      if (!reply) {
        throw new Error('Resposta vazia do Ollama.');
      }

      return reply;
    } catch (err) {
      lastMsg = err instanceof Error ? err.message : String(err);
      const retryable = isRetryableOllamaError(lastMsg);
      console.warn(`[Ollama] tentativa ${attempt + 1}/${maxAttempts} — ${lastMsg.slice(0, 160)}`);

      if (!retryable || attempt === maxAttempts - 1) {
        throw new AppError(
          `Falha na API Ollama (${model}): ${lastMsg}. Confira se o serviço está rodando (ollama serve) e se o modelo foi baixado (ollama pull ${model}).`,
          502
        );
      }

      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new AppError(`Falha na API Ollama: ${lastMsg}`, 502);
}

/** @returns {boolean} */
export function isOllamaConfigured() {
  if (process.env.OLLAMA_ENABLED === 'false') return false;
  if (process.env.OLLAMA_ENABLED === 'true') return true;
  return process.env.LLM_TEXT_PROVIDER?.trim().toLowerCase() === 'ollama';
}
