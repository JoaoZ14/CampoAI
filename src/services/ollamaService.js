import { AppError } from '../utils/errors.js';
import { buildOllamaSystemInstruction } from './llmPrompts.js';

const DEFAULT_OLLAMA_BASE = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'qwen2.5:7b-instruct-q4_K_M';

/** Evita duas inferências simultâneas (WhatsApp em sequência rápida). */
let ollamaChain = Promise.resolve();

function ollamaBaseUrl() {
  return (process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE).replace(/\/$/, '');
}

function ollamaModel() {
  return process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
}

function ollamaTimeoutMs() {
  const n = Number(process.env.OLLAMA_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 90_000;
}

function ollamaContextWindow() {
  const n = Number(process.env.OLLAMA_NUM_CTX);
  return Number.isFinite(n) && n >= 1024 ? Math.min(8192, n) : 2048;
}

function ollamaMaxPredict(fieldCalcMode) {
  if (fieldCalcMode) {
    const n = Number(process.env.OLLAMA_MAX_PREDICT_CALC);
    return Number.isFinite(n) && n > 0 ? Math.min(512, n) : 384;
  }
  const env = Number(process.env.OLLAMA_MAX_PREDICT);
  if (Number.isFinite(env) && env > 0) return Math.min(2048, env);
  return 512;
}

function trimHistoryForOllama(history) {
  const env = Number(process.env.OLLAMA_HISTORY_MAX_MESSAGES);
  const limit = Number.isFinite(env) && env >= 0 ? Math.min(80, env) : 6;
  if (limit === 0 || !history?.length) return [];
  if (history.length <= limit) return history;
  return history.slice(-limit);
}

function trimMessageContent(text, maxChars = 500) {
  const s = String(text ?? '').trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}…`;
}

/**
 * @param {{ role: 'user' | 'assistant', text: string }[]} history
 * @param {string} userText
 */
function buildOllamaMessages(history, userText, fieldCalcMode) {
  /** @type {{ role: string, content: string }[]} */
  const messages = [{ role: 'system', content: buildOllamaSystemInstruction(fieldCalcMode) }];
  const trimmed = trimHistoryForOllama(history);

  for (const h of trimmed) {
    if (!h?.text?.trim()) continue;
    messages.push({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: trimMessageContent(h.text),
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
    m.includes('abort') ||
    m.includes('503') ||
    m.includes('502') ||
    m.includes('429') ||
    m.includes('overloaded')
  );
}

async function generateWithOllamaOnce({ text, history = [], fieldCalcMode = false }) {
  const userText = text?.trim();
  if (!userText) {
    throw new AppError('Nenhum texto para enviar ao Ollama.', 400);
  }

  const url = `${ollamaBaseUrl()}/api/chat`;
  const model = ollamaModel();
  const trimmedHistory = trimHistoryForOllama(history);
  const messages = buildOllamaMessages(history, userText, fieldCalcMode);
  const temperature = fieldCalcMode ? 0.12 : 0.35;
  const numPredict = ollamaMaxPredict(fieldCalcMode);
  const numCtx = ollamaContextWindow();
  const maxAttempts = Math.min(3, Math.max(1, Number(process.env.OLLAMA_RETRY_ATTEMPTS) || 1));
  const started = Date.now();

  console.log(
    '[Ollama] modelo:',
    model,
    '| histórico:',
    `${trimmedHistory.length}/${history.length}`,
    '| ctx:',
    numCtx,
    '| max_predict:',
    numPredict,
    '| timeout_ms:',
    ollamaTimeoutMs(),
    '| calc:',
    fieldCalcMode
  );

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
            num_ctx: numCtx,
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

      console.log('[Ollama] ok em', `${((Date.now() - started) / 1000).toFixed(1)}s`, '| chars:', reply.length);
      return reply;
    } catch (err) {
      lastMsg = err instanceof Error ? err.message : String(err);
      const retryable = isRetryableOllamaError(lastMsg);
      console.warn(`[Ollama] tentativa ${attempt + 1}/${maxAttempts} — ${lastMsg.slice(0, 200)}`);

      if (!retryable || attempt === maxAttempts - 1) {
        throw new AppError(
          `Falha na API Ollama (${model}): ${lastMsg}. Confira se o serviço está rodando (systemctl status ollama).`,
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

/**
 * Gera resposta de texto via Ollama (Qwen local), uma requisição por vez.
 * @param {{ text: string, history?: { role: 'user' | 'assistant', text: string }[], fieldCalcMode?: boolean }} input
 */
export async function generateWithOllama(input) {
  const run = () => generateWithOllamaOnce(input);
  const job = ollamaChain.then(run, run);
  ollamaChain = job.catch(() => {});
  return job;
}

/** @returns {boolean} */
export function isOllamaConfigured() {
  if (process.env.OLLAMA_ENABLED === 'false') return false;
  if (process.env.OLLAMA_ENABLED === 'true') return true;
  return process.env.LLM_TEXT_PROVIDER?.trim().toLowerCase() === 'ollama';
}
