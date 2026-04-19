import cron from 'node-cron';
import { sendWhatsAppMessage } from '../services/whatsappService.js';
import { buildWeeklyNewsWhatsAppBody } from '../services/weeklyNewsContentService.js';
import { normalizePhone } from '../utils/phone.js';

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
 * Dispara o envio do resumo semanal (corpo em WEEKLY_NEWS_BODY).
 * Exportado para testes manuais ou endpoint futuro.
 */
export async function runWeeklyNewsSend() {
  if (process.env.WEEKLY_NEWS_ENABLED !== 'true') {
    console.warn('[weekly-news] Ignorado: WEEKLY_NEWS_ENABLED não é true.');
    return { ok: false, reason: 'disabled' };
  }

  const rawPhone = process.env.WEEKLY_NEWS_TO_PHONE?.trim() ?? '';
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

  try {
    await sendWhatsAppMessage(phone, body);
    console.log(`[weekly-news] Enviado para ${phone} (${body.length} caracteres).`);
    return { ok: true, phone };
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
