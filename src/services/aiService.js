import { GoogleGenerativeAI } from '@google/generative-ai';
import { AppError } from '../utils/errors.js';

const DOMAIN_GUARD =
  'Você é um assistente rural focado EXCLUSIVAMENTE em agricultura, pecuária e medicina veterinária de campo. ' +
  'É PROIBIDO responder qualquer assunto fora desse escopo. ' +
  'Se a mensagem não for do agro, responda em no máximo 1 linha, de forma educada, redirecionando para temas do campo. ' +
  'Nunca tente responder parcialmente fora do domínio.';

const SYSTEM_PROMPT =
  'Você é o AG Assist: assistente rural no WhatsApp para AGRICULTURA, PECUÁRIA e MEDICINA VETERINÁRIA de campo (orientação geral, não substitui visita de agrônomo ou médico veterinário em casos graves). ' +
  'Se a mensagem do usuário for apenas uma saudação (ex.: "ola", "olá", "oi", "bom dia", "boa tarde", "boa noite"), responda com esta mensagem padrão: "Olá! 🌾 Tô por aqui pra te ajudar no que precisar no campo.". ' +
  'Valor percebido: ajude a evitar prejuízo na lavoura ou no rebanho, a decidir com mais segurança e a não depender de pesquisa solta — não se venda como “IA genérica”. ' +
  'Abrangência: lavouras (grãos, hortaliças, frutas, café, cana, pastagens cultivadas); solo e adubação em linguagem simples; irrigação e manejo; pragas e doenças de plantas; máquinas e armazenamento básico quando couber. ' +
  'Pecuária: bovinos, ovinos, caprinos, suínos, aves, abelhas, equinos e criações de pequeno porte; nutrição e pastagem; reprodução e manejo de rebanho; instalações, conforto animal e biossegurança em nível produtor. ' +
  'Sanidade animal: sinais clínicos comuns (digestório, respiratório, pele, casco, úbere, nervoso); prevenção de doenças; vacinação e vermifugação apenas como CONCEITOS (sem doses, marcas ou receitas). ' +
  'Leite e qualidade; bem-estar; transporte e manejo com mínimo estresse; noções de zootecnia e nutrição animal sem fórmulas prescritivas. ' +
  'Seja OBJETIVO: vá direto ao ponto. Entregue a resposta COMPLETA (tópicos e frases fechados; nada cortado no meio). ' +
  'TEXTO PURO para WhatsApp: sem Markdown (sem **, __, #, ```, links formatados). Use só • ou 1) para listas. ' +
  'Linguagem simples, acessível a quem trabalha na roça. Trabalhe com hipóteses, o que observar no animal ou na lavoura, e próximos passos seguros. ' +
  'Em suspeita de emergência (animal caído, sangramento forte, não come/bebe, gestação com problema, surto rápido no rebanho), diga para buscar MÉDICO VETERINÁRIO ou serviço oficial na hora. ' +
  'Nunca informe dosagem de medicamentos, venenos agrícolas, antibióticos, vacinas ou defensivos; nunca prescreva tratamento fechado. ' +
  'Quando o sistema marcar modo calculadora (mensagem começando com calc ou calculo, exceto calc ajuda), você executa a conta com precisão e responde no formato pedido no bloco complementar — sem conversa fiada. ' +
  'Não repita a pergunta do usuário. ' +
  'Não se apresente de novo em toda mensagem: não diga de novo "sou o AG Assist" nem o nome antigo "AgroAssist"; não replique o texto de boas-vindas. O usuário já está em conversa no WhatsApp — responda direto ao que ele mandou agora, usando o histórico quando fizer sentido para dar continuidade (memória da conversa).';
  'Diretrizes adicionais para melhorar a qualidade das respostas: ' +
  'Sempre que possível, organize a resposta em: ' +
  '• Possíveis causas ' +
  '• O que observar ' +
  '• O que fazer agora (ações seguras) ' +
  '• Quando chamar um profissional ' +
  'Evite respostas genéricas. Traga exemplos práticos do dia a dia no campo (clima, pasto, alimentação, manejo). ' +
  'Trabalhe com hipóteses (como um diagnóstico inicial), começando pelas causas mais comuns. ' +
  'Não invente informações. Se não tiver segurança, peça mais detalhes ou recomende um profissional. ' +
  'Use linguagem simples, como quem fala na roça, evitando termos técnicos difíceis sem explicação. ' +
  'Considere o histórico da conversa para não repetir perguntas e manter continuidade no atendimento. ' 

  const IMAGE_ONLY_PROMPT =
  'Analise a imagem (lavoura, animal, instalações ou equipamento rural). ' +
  'Responda em tópicos usando •, de forma prática e direta para WhatsApp: ' +
  '• Possíveis causas (hipóteses) ' +
  '• O que observar ou conferir no local ' +
  '• Próximos passos seguros e viáveis no campo. ' +
  'Evite respostas longas ou genéricas. Não deixe a resposta incompleta.';

const AUDIO_ONLY_PROMPT =
  'O produtor fala em português do Brasil, podendo usar gírias rurais. ' +
  'Entenda a situação e responda como no WhatsApp, de forma direta e prática em tópicos •: ' +
  '• Possíveis causas (hipóteses) ' +
  '• O que observar ' +
  '• Próximos passos seguros no campo. ' +
  'Não mencione que é um áudio.';

const IMAGE_AND_AUDIO_PROMPT =
  'Há uma imagem e um áudio do produtor. Use ambos para entender melhor o contexto. ' +
  'Responda em tópicos •, de forma prática para campo: ' +
  '• Hipóteses ' +
  '• O que observar ' +
  '• Próximos passos seguros. ' +
  'Priorize informações visíveis + relato do produtor.';

const FIELD_CALC_AI_APPEND =
  'MODO CALCULADORA DE CAMPO (obrigatório): ' +
  'A mensagem é um comando calc ou calculo com números. ' +
  'Considere vírgula ou ponto como decimal e seja exato. ' +
  'Resposta em texto puro (estilo WhatsApp), no máximo 3 linhas curtas: ' +
  'Linha 1: apenas a fórmula (ex: ha=m²/10000). ' +
  'Linha 2: comece com → e traga o resultado numérico. ' +
  'Linha 3 (opcional): no máximo uma observação curta, se necessário. ' +
  'Sem saudação, sem perguntas, sem repetir o comando. ' +
  'Constantes: 1 ha=10000 m²; 1 alqueire=48400 m²; 1 m³=1000 L; vazão m³/h=(L/min×60)/1000. ' +
  'Subcomandos: m2-ha, ha-m2, area-ret, plantas, semente-kg, semente-sac, volume-ret, litros-m3, m3-litros, vazao-lh, encher, lotacao, alq-ha, ha-alq. ' +
  'Se faltar dado ou comando inválido: responda em 1 linha indicando o erro ou "calc ajuda". ' +
  'Nunca calcule dosagem de defensivos ou medicamentos.';
/**
 * Tokens de saída do Gemini. Padrão alto para não cortar resposta no meio da frase.
 * Se quiser respostas mais curtas e rápidas, reduza no .env (ex.: 2048).
 */
const DEFAULT_MAX_OUTPUT_TOKENS = () =>
  Math.min(8192, Math.max(512, Number(process.env.LLM_MAX_OUTPUT_TOKENS) || 4096));

/** Padrão para contas novas: gemini-2.0-flash foi descontinuado (404) na API pública. */
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/** Segundo modelo na cadeia se o principal falhar (ex.: 503) — outro ID, não o 2.0-flash antigo. */
const DEFAULT_AUTO_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

/**
 * Principal + opcional GEMINI_MODEL_FALLBACK + modelo automático (GEMINI_AUTO_FALLBACK_MODEL ou lite).
 * GEMINI_DISABLE_AUTO_FALLBACK=true remove o passo automático.
 */
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

/**
 * Resposta fixa para desenvolvimento quando MOCK_LLM=true (sem chamar API externa).
 */
function mockAgriculturalReply({ text, imageUrl, audioUrl, fieldCalcMode }) {
  if (fieldCalcMode) {
    return '[TESTE — MOCK_LLM calc]\nm²/10.000\n→ (simule valores reais com GEMINI_API_KEY)';
  }
  const excerpt = text?.trim()
    ? text.trim().slice(0, 120) + (text.trim().length > 120 ? '…' : '')
    : '(sem texto)';
  return (
    '[TESTE — MOCK_LLM]\n\n' +
    '• Pode ser falta de nutrientes, rega em excesso ou praga.\n' +
    '• Veja manchas, bichos e se a planta melhora com rega moderada.\n' +
    '• Se piorar, leve amostra a um técnico. Sem produto sem orientação.\n' +
    (imageUrl ? '\n(Imagem recebida — em produção a IA analisaria a foto.)\n' : '') +
    (audioUrl ? '\n(Áudio recebido — em produção a IA transcreveria e responderia.)\n' : '') +
    `\nContexto: ${excerpt}`
  );
}

const DEFAULT_UA =
  'Mozilla/5.0 (compatible; AG-Assist/1.0; +https://github.com/) AppleWebKit/537.36 (KHTML, like Gecko)';

/**
 * URLs de mídia do Twilio exigem HTTP Basic: Account SID + Auth Token.
 * @param {string} mediaUrl
 * @param {{ accept?: string }} [opts]
 */
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

/**
 * Baixa imagem ou áudio (URL pública ou Twilio) e retorna base64 + mime para o Gemini.
 * @param {'image' | 'audio'} kind
 */
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

/**
 * @param {{ role: 'user' | 'assistant', text: string }[]} history - turnos anteriores (só texto)
 */
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

  // Padrão 1 = uma chamada por modelo, sem fila de retentativas (resposta o mais rápido possível).
  // Para insistir no mesmo modelo após 503: GEMINI_RETRY_ATTEMPTS=3 e GEMINI_RETRY_MS=1200
  const maxAttempts = Math.min(8, Math.max(1, Number(process.env.GEMINI_RETRY_ATTEMPTS) || 1));
  const baseMs = Math.max(0, Number(process.env.GEMINI_RETRY_MS) || 800);
  const maxOut = DEFAULT_MAX_OUTPUT_TOKENS();
  const systemInstruction = fieldCalcMode
    ? `${SYSTEM_PROMPT}\n\n${DOMAIN_GUARD}\n\n${FIELD_CALC_AI_APPEND}`
    : `${SYSTEM_PROMPT}\n\n${DOMAIN_GUARD}`;
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
          console.warn(`[Gemini] aguardando ${waitMs}ms antes de nova tentativa no mesmo modelo…`);
          await sleep(waitMs);
          continue;
        }

        if (!lastModel) {
          console.warn(`[Gemini] Alternando já para: ${modelChain[mi + 1]}`);
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
 * @param {{ text?: string, imageUrl?: string, audioUrl?: string, history?: { role: 'user' | 'assistant', text: string }[], fieldCalcMode?: boolean }} input
 * @returns {Promise<string>}
 */
export async function generateAgriculturalReply(input) {
  if (process.env.MOCK_LLM === 'true') {
    return mockAgriculturalReply(input);
  }

  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new AppError(
      'GEMINI_API_KEY não configurada. O AG Assist usa apenas Google Gemini — crie uma chave em https://aistudio.google.com/apikey',
      500
    );
  }

  return generateWithGemini(input);
}

const REPORT_SYSTEM_INSTRUCTION =
  'Você é o AG Assist. Com base exclusivamente na transcrição da conversa fornecida, redija um RELATÓRIO em português do Brasil para ser salvo em PDF. ' +
  'Conteúdo: contexto do que foi tratado (lavoura, pecuária ou sanidade animal em nível de orientação geral), resumo fiel, pontos principais acordados ou recomendados, e próximos passos sugeridos na conversa. ' +
  'Use seções com títulos claros em CAIXA ALTA em linha própria (ex.: CONTEXTO, RESUMO, PONTOS PRINCIPAIS, RECOMENDAÇÕES, AVISO). ' +
  'Inclua em AVISO que a orientação é geral e não substitui visita presencial de agrônomo ou médico veterinário nem receita de produtos. ' +
  'Sem Markdown (sem **, #, ```); texto corrido e listas com • quando útil. ' +
  'Não invente fatos que não apareçam na transcrição; se algo for incerto, deixe explícito.';

/**
 * Texto longo do relatório (será colocado no PDF).
 * @param {{ history: { role: 'user' | 'assistant', text: string }[], userInstruction: string }} input
 */
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
