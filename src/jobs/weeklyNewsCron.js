import cron from 'node-cron';
import { sendWhatsAppMessage, sendWhatsAppWithMedia } from '../services/whatsappService.js';
import { buildWeeklyNewsWhatsAppBody } from '../services/weeklyNewsContentService.js';
import { normalizePhone } from '../utils/phone.js';

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

/**
 * Segunda-feira às 12:00 no fuso configurável (padrão America/Sao_Paulo).
 * @see https://github.com/node-cron/node-cron
 */
const CRON_EXPR = '0 12 * * 1';

function weeklyNewsTimezone() {
  const z = process.env.WEEKLY_NEWS_TIMEZONE?.trim();
  return z || 'America/Sao_Paulo';
}

/**
 * Dispara o envio do resumo semanal (GNews e/ou WEEKLY_NEWS_BODY).
 * @param {{ toPhone?: string }} [opts] — `toPhone` sobrescreve WEEKLY_NEWS_TO_PHONE (ex.: teste manual).
 */
export async function runWeeklyNewsSend(opts = {}) {
  if (process.env.WEEKLY_NEWS_ENABLED !== 'true') {
    console.warn('[weekly-news] Ignorado: WEEKLY_NEWS_ENABLED não é true.');
    return { ok: false, reason: 'disabled' };
  }

  const override =
    typeof opts.toPhone === 'string' && opts.toPhone.trim() ? opts.toPhone.trim() : '';
  const rawPhone = override || (process.env.WEEKLY_NEWS_TO_PHONE?.trim() ?? '');
  const phone = normalizePhone(rawPhone);
  if (!phone || phone.length < 10) {
    console.error('[weekly-news] WEEKLY_NEWS_TO_PHONE inválido ou vazio.');
    return { ok: false, reason: 'bad_phone' };
  }

  const body = (await buildWeeklyNewsWhatsAppBody()).trim();
  if (!body) {
    console.error(
      '[weekly-news] Corpo vazio: defina GNEWS_API_KEY e/ou WEEKLY_NEWS_BODY no .env.'
    );
    return { ok: false, reason: 'empty_body' };
  }

  const bannerUrl = weeklyNewsBannerImageUrl();

  try {
    if (bannerUrl) {
      try {
        await sendWhatsAppWithMedia(phone, body, [bannerUrl]);
        console.log(
          `[weekly-news] Enviado (imagem + legenda) para ${phone} (${body.length} caracteres)${override ? ' [destino via argumento]' : ''}.`
        );
        return { ok: true, phone, testOverride: Boolean(override), media: true };
      } catch (mediaErr) {
        const m = mediaErr instanceof Error ? mediaErr.message : String(mediaErr);
        console.warn('[weekly-news] Falha no envio com banner; tentando só texto:', m);
        await sendWhatsAppMessage(phone, body);
        console.log(
          `[weekly-news] Enviado (só texto) para ${phone} (${body.length} caracteres)${override ? ' [destino via argumento]' : ''}.`
        );
        return { ok: true, phone, testOverride: Boolean(override), media: false, mediaFallback: true };
      }
    }

    await sendWhatsAppMessage(phone, body);
    console.log(
      `[weekly-news] Enviado para ${phone} (${body.length} caracteres)${override ? ' [destino via argumento]' : ''}.`
    );
    return { ok: true, phone, testOverride: Boolean(override), media: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[weekly-news] Falha ao enviar WhatsApp:', msg);
    return { ok: false, reason: 'send_error', error: msg };
  }
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
  if (!cron.validate(CRON_EXPR)) {
    console.error('[weekly-news] Expressão cron inválida (interno).');
    return;
  }

  task = cron.schedule(
    CRON_EXPR,
    () => {
      void runWeeklyNewsSend();
    },
    { timezone: tz }
  );

  console.log(
    `[weekly-news] Agendado: toda segunda às 12:00 (${tz}) → ${process.env.WEEKLY_NEWS_TO_PHONE?.trim() || '(telefone não definido)'}`
  );
}

export function stopWeeklyNewsCron() {
  if (task) {
    task.stop();
    task = null;
  }
}
