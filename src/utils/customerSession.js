import crypto from 'node:crypto';
import { AppError } from './errors.js';

const SESSION_TTL_SEC = Math.max(300, Number(process.env.CUSTOMER_SESSION_TTL_SEC) || 60 * 60 * 24 * 7);

function getSecret() {
  const s = String(process.env.CUSTOMER_AUTH_SECRET || '').trim();
  if (!s) {
    throw new AppError('Defina CUSTOMER_AUTH_SECRET para habilitar a área do cliente.', 500);
  }
  return s;
}

function b64url(input) {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function sign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

export function createCustomerSessionToken(payload) {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + SESSION_TTL_SEC,
  };
  const encoded = b64url(JSON.stringify(body));
  const sig = sign(encoded, secret);
  return `${encoded}.${sig}`;
}

export function verifyCustomerSessionToken(token) {
  const raw = String(token || '').trim();
  const [encoded, sig] = raw.split('.');
  if (!encoded || !sig) throw new AppError('Sessão inválida.', 401);
  const secret = getSecret();
  const expected = sign(encoded, secret);
  if (expected !== sig) throw new AppError('Sessão inválida.', 401);
  let body;
  try {
    body = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new AppError('Sessão inválida.', 401);
  }
  const now = Math.floor(Date.now() / 1000);
  if (!body?.exp || Number(body.exp) < now) throw new AppError('Sessão expirada. Faça login novamente.', 401);
  return body;
}
