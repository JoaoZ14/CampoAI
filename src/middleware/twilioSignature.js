import twilio from 'twilio';

/**
 * Valida assinatura X-Twilio-Signature em webhooks Twilio.
 * Em produção com TWILIO_AUTH_TOKEN definido, rejeita requisições inválidas.
 * Desligar validação (ex.: testes locais): TWILIO_SKIP_SIGNATURE=true
 */
export function validateTwilioSignature(req, res, next) {
  if (process.env.TWILIO_SKIP_SIGNATURE === 'true') return next();

  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[twilio] TWILIO_AUTH_TOKEN ausente — assinatura não validada.');
    }
    return next();
  }

  const signature = req.headers['x-twilio-signature'];
  if (!signature) {
    return res.status(403).json({ ok: false, error: 'Assinatura Twilio ausente.' });
  }

  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const url = `${proto}://${host}${req.originalUrl}`;

  const valid = twilio.validateRequest(authToken, signature, url, req.body ?? {});
  if (!valid) {
    console.warn('[twilio] assinatura inválida', { url });
    return res.status(403).json({ ok: false, error: 'Assinatura Twilio inválida.' });
  }

  return next();
}
