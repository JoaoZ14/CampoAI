import cron from 'node-cron';
import { sendTrialExpiredNotice } from '../services/signup/welcomeService.js';
import {
  listUsersPendingTrialExpiryNotification,
  updateUserById,
} from '../services/userService.js';
import { normalizePhone } from '../utils/phone.js';

function trialExpiryTimezone() {
  return process.env.TRIAL_EXPIRY_CRON_TZ?.trim() || 'America/Sao_Paulo';
}

function trialExpiryCronExpression() {
  return process.env.TRIAL_EXPIRY_CRON?.trim() || '0 9 * * *';
}

function normalizePaywallUrl(raw) {
  const s = String(raw).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function plansUrlForPhone(phone) {
  const raw = process.env.PAYWALL_URL?.trim();
  if (!raw) return '';
  const base = normalizePaywallUrl(raw);
  try {
    const u = new URL(base);
    const digits = String(phone || '').replaceAll(/\D/g, '');
    if (digits) {
      u.searchParams.set('phone', digits.startsWith('55') ? `+${digits}` : `+55${digits}`);
      u.searchParams.set('origin', 'trial_expired_cron');
    }
    return u.toString();
  } catch {
    return base;
  }
}

/**
 * Envia aviso de trial expirado por tempo para usuários elegíveis.
 */
export async function runTrialExpiryNotifications() {
  const users = await listUsersPendingTrialExpiryNotification();
  if (!users.length) {
    return { ok: true, total: 0, sent: 0, failed: 0 };
  }

  const delayMs = Math.max(0, Number(process.env.TRIAL_EXPIRY_SEND_DELAY_MS) || 400);
  let sent = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const phone = normalizePhone(user.phone);
    if (!phone) continue;

    try {
      const plansUrl = plansUrlForPhone(phone);
      await sendTrialExpiredNotice(phone, user.name || 'produtor', plansUrl);
      await updateUserById(user.id, {
        trialExpiredNotifiedAt: new Date().toISOString(),
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ phone, error: msg });
      console.error(`[trial-expiry] Falha ao enviar para ${phone}:`, msg);
    }

    if (i < users.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    ok: failed === 0,
    total: users.length,
    sent,
    failed,
    ...(failures.length ? { failures } : {}),
  };
}

let task = null;

export function startTrialExpiryCron() {
  if (process.env.TRIAL_EXPIRY_CRON_ENABLED !== 'true') {
    return;
  }
  if (task) return;

  const tz = trialExpiryTimezone();
  const cronExpr = trialExpiryCronExpression();
  task = cron.schedule(
    cronExpr,
    () => {
      void runTrialExpiryNotifications();
    },
    { timezone: tz }
  );
  console.log(`[trial-expiry] Agendado: cron "${cronExpr}" (${tz})`);
}

export function stopTrialExpiryCron() {
  if (task) {
    task.stop();
    task = null;
  }
}
