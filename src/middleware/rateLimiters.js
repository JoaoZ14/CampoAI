import rateLimit from 'express-rate-limit';

const windowMs = 15 * 60 * 1000;

/** Limite para envio de OTP (cadastro e checkout) — evita abuso de SMS. */
export const otpSendLimiter = rateLimit({
  windowMs,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Muitas tentativas. Aguarde alguns minutos.' },
});

/** Limite para verificação de OTP — tolera erros de digitação sem bloquear rápido demais. */
export const otpVerifyLimiter = rateLimit({
  windowMs,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Muitas tentativas de verificação. Aguarde alguns minutos.' },
});

/** Webhooks — proteção básica contra flood. */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Rate limit excedido.' },
});
