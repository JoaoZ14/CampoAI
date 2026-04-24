import cron from 'node-cron';
import {
  sendWhatsAppContentTemplate,
  sendWhatsAppMessage,
  sendWhatsAppWithMedia,
} from '../services/whatsappService.js';
import { buildWeeklyNewsWhatsAppBody } from '../services/weeklyNewsContentService.js';
import { listDistinctUserPhones } from '../services/userService.js';
import { normalizePhone } from '../utils/phone.js';

/** SID do Content Template aprovado (WhatsApp business initiated), ex.: HX… no Twilio. */
function weeklyNewsWhatsAppContentSid() {
  const raw = process.env.WEEKLY_NEWS_WHATSAPP_CONTENT_SID?.trim() ?? '';
  if (!raw) return '';
  if (!/^H[a-z0-9]{20,64}$/i.test(raw)) {
    console.warn(
      '[weekly-news] WEEKLY_NEWS_WHATSAPP_CONTENT_SID com formato inválido (esperado SID H… do Twilio); ignorando template.'
    );
    return '';
  }
  return raw;
}

/** Chave da variável do template que recebe o texto do resumo ({{1}} → "1"). Padrão: 1 */
function weeklyNewsTemplateBodyVarKey() {
  const k = process.env.WEEKLY_NEWS_TEMPLATE_BODY_VAR_KEY?.trim();
  if (k && /^\d+$/.test(k)) return k;
  return '1';
}

/**
 * Normaliza o texto para variável de template do WhatsApp.
 * Preserva formatação em linhas e remove título duplicado do corpo dinâmico.
 * @param {string} body
 * @returns {string}
 */
function normalizeWeeklyTemplateBody(body) {
  const raw = typeof body === 'string' ? body : '';
  const header = (process.env.WEEKLY_NEWS_HEADER?.trim() ?? '').toLowerCase();

  const normalized = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ ]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const lines = normalized.split('\n');
  if (lines.length > 0 && header && lines[0].toLowerCase() === header) {
    lines.shift();
    while (lines.length > 0 && !lines[0].trim()) lines.shift();
  }

  const withFormat = lines.join(' ').replace(/\s{2,}/g, ' ').trim();
  const MAX_TEMPLATE_VAR_LEN = 1400;
  return withFormat.length > MAX_TEMPLATE_VAR_LEN
    ? `${withFormat.slice(0, MAX_TEMPLATE_VAR_LEN - 1).trimEnd()}…`
    : withFormat;
}

/**
 * Monta `contentVariables` para o template semanal.
 * Regra do produto: enviar somente a variável {{1}} (sem variável de banner).
 * @param {string} body
 * @returns {Record<string, string>}
 */
function buildWeeklyNewsTemplateVariables(body) {
  const bodyKey = weeklyNewsTemplateBodyVarKey();
  return { [bodyKey]: normalizeWeeklyTemplateBody(body) };
}

/** URL HTTPS pública do banner (Twilio faz GET na imagem). */
function weeklyNewsBannerImageUrl() {
  const raw = process.env.WEEKLY_NEWS_BANNER_IMAGE_URL?.trim() ?? '';
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') {
      console.warn('[weekly-news] WEEKLY_NEWS_BANNER_IMAGE_URL precisa ser HTTPS.');
      return '';
    }
    return raw;
  } catch {
    console.warn('[weekly-news] WEEKLY_NEWS_BANNER_IMAGE_URL inválida.');
    return '';
  }
}

const DEFAULT_WEEKLY_NEWS_CRON = '0 12 * * 1';

/**
 * Expressão cron (node-cron): minuto hora dia_do_mês mês dia_da_semana.
 * Padrão `0 12 * * 1` = toda segunda às 12:00 no fuso `WEEKLY_NEWS_TIMEZONE`.
 * Ex.: `30 9 * * 1` = segunda 09:30; `0 8 * * 1,4` = segunda e quinta 08:00.
 * @see https://github.com/node-cron/node-cron
 */
function weeklyNewsCronExpression() {
  const raw = process.env.WEEKLY_NEWS_CRON?.trim();
  if (!raw) return DEFAULT_WEEKLY_NEWS_CRON;
  if (!cron.validate(raw)) {
    console.warn(
      `[weekly-news] WEEKLY_NEWS_CRON inválida (${JSON.stringify(raw)}); usando padrão ${DEFAULT_WEEKLY_NEWS_CRON}.`
    );
    return DEFAULT_WEEKLY_NEWS_CRON;
  }
  return raw;
}

function weeklyNewsTimezone() {
  const z = process.env.WEEKLY_NEWS_TIMEZONE?.trim();
  return z || 'America/Sao_Paulo';
}

function weeklyNewsSendDelayMs() {
  const n = Number(process.env.WEEKLY_NEWS_SEND_DELAY_MS);
  if (Number.isFinite(n) && n >= 0) return Math.min(n, 60_000);
  return 350;
}

/**
 * @param {string} phone E.164
 * @param {string} body
 * @param {string} bannerUrl
 * @returns {Promise<{ kind: string, twilioSid?: string, twilioStatus?: string, media?: boolean, mediaFallback?: boolean }>}
 */
async function sendWeeklyNewsToPhone(phone, body, bannerUrl) {
  const contentSid = weeklyNewsWhatsAppContentSid();
  if (contentSid) {
    const vars = buildWeeklyNewsTemplateVariables(body);
    const result = await sendWhatsAppContentTemplate(phone, contentSid, vars);
    return {
      kind: 'template',
      twilioSid: result.sid,
      twilioStatus: result.status,
    };
  }

  if (bannerUrl) {
    try {
      await sendWhatsAppWithMedia(phone, body, [bannerUrl]);
      return { kind: 'imagem+legenda', media: true };
    } catch (mediaErr) {
      const m = mediaErr instanceof Error ? mediaErr.message : String(mediaErr);
      console.warn(`[weekly-news] Falha no envio com banner para ${phone}; tentando só texto:`, m);
      await sendWhatsAppMessage(phone, body);
      return { kind: 'só texto (fallback banner)', media: false, mediaFallback: true };
    }
  }
  await sendWhatsAppMessage(phone, body);
  return { kind: 'só texto', media: false };
}

/**
 * @param {{ toPhone?: string }} opts
 * @returns {Promise<{ ok: true, phones: string[], mode: string } | { ok: false, reason: string, error?: string }>}
 */
async function resolveWeeklyNewsRecipients(opts) {
  const override =
    typeof opts.toPhone === 'string' && opts.toPhone.trim() ? opts.toPhone.trim() : '';
  const legacySingle = !override && (process.env.WEEKLY_NEWS_TO_PHONE?.trim() ?? '');

  if (override) {
    const p = normalizePhone(override);
    if (!p || p.length < 10) {
      console.error('[weekly-news] Telefone de teste (argumento) inválido.');
      return { ok: false, reason: 'bad_phone' };
    }
    return { ok: true, phones: [p], mode: 'single_cli' };
  }

  if (legacySingle) {
    const p = normalizePhone(legacySingle);
    if (!p || p.length < 10) {
      console.error('[weekly-news] WEEKLY_NEWS_TO_PHONE inválido.');
      return { ok: false, reason: 'bad_phone' };
    }
    return { ok: true, phones: [p], mode: 'single_env' };
  }

  try {
    const phones = await listDistinctUserPhones();
    if (!phones.length) {
      console.error('[weekly-news] Nenhum telefone em public.users — nada a enviar.');
      return { ok: false, reason: 'no_recipients' };
    }
    return { ok: true, phones, mode: 'broadcast' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[weekly-news] Falha ao listar usuários:', msg);
    return { ok: false, reason: 'list_error', error: msg };
  }
}

/**
 * Dispara o resumo semanal (GNews e/ou WEEKLY_NEWS_BODY).
 *
 * Destinos:
 * - `opts.toPhone` — um número (teste CLI).
 * - senão, se `WEEKLY_NEWS_TO_PHONE` estiver definido — só esse número (legado / teste).
 * - senão — todos os telefones distintos em `public.users`.
 *
 * @param {{ toPhone?: string }} [opts]
 */
export async function runWeeklyNewsSend(opts = {}) {
  if (process.env.WEEKLY_NEWS_ENABLED !== 'true') {
    console.warn('[weekly-news] Ignorado: WEEKLY_NEWS_ENABLED não é true.');
    return { ok: false, reason: 'disabled' };
  }

  const resolved = await resolveWeeklyNewsRecipients(opts);
  if (!resolved.ok) {
    return resolved;
  }
  const { phones, mode } = resolved;

  const body = (await buildWeeklyNewsWhatsAppBody()).trim();
  if (!body) {
    console.error(
      '[weekly-news] Corpo vazio: defina GNEWS_API_KEY e/ou WEEKLY_NEWS_BODY no .env.'
    );
    return { ok: false, reason: 'empty_body' };
  }

  const bannerUrl = weeklyNewsBannerImageUrl();
  const delayMs = weeklyNewsSendDelayMs();
  let sent = 0;
  let failed = 0;
  /** @type {{ phone: string, error: string }[]} */
  const failures = [];

  for (let i = 0; i < phones.length; i += 1) {
    const phone = phones[i];
    try {
      const r = await sendWeeklyNewsToPhone(phone, body, bannerUrl);
      sent += 1;
      const twilioNote =
        r.twilioSid && r.twilioStatus !== undefined
          ? ` twilioSid=${r.twilioSid} status=${r.twilioStatus}`
          : r.twilioSid
            ? ` twilioSid=${r.twilioSid}`
            : '';
      console.log(
        `[weekly-news] Enviado (${r.kind}) para ${phone} (${body.length} caracteres) [${i + 1}/${phones.length}]${twilioNote}`
      );
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ phone, error: msg });
      console.error(`[weekly-news] Falha ao enviar para ${phone}:`, msg);
    }
    if (i < phones.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const ok = failed === 0 && sent > 0;
  return {
    ok,
    mode,
    total: phones.length,
    sent,
    failed,
    ...(failures.length ? { failures } : {}),
  };
}

let task = null;

/**
 * Agenda envio semanal. Idempotente: se já houver tarefa, não duplica.
 */
export function startWeeklyNewsCron() {
  if (process.env.WEEKLY_NEWS_ENABLED !== 'true') {
    return;
  }

  if (task) {
    return;
  }

  const tz = weeklyNewsTimezone();
  const cronExpr = weeklyNewsCronExpression();

  task = cron.schedule(
    cronExpr,
    () => {
      void runWeeklyNewsSend();
    },
    { timezone: tz }
  );

  const hint = process.env.WEEKLY_NEWS_TO_PHONE?.trim()
    ? `destino único (WEEKLY_NEWS_TO_PHONE)`
    : `todos os telefones em public.users`;
  const tpl = weeklyNewsWhatsAppContentSid();
  const modeHint = tpl ? ` | envio: Content Template (${tpl.slice(0, 8)}…)` : ` | envio: sessão (texto/mídia)`;
  console.log(`[weekly-news] Agendado: cron "${cronExpr}" (${tz}) → ${hint}${modeHint}`);
}

export function stopWeeklyNewsCron() {
  if (task) {
    task.stop();
    task = null;
  }
}
