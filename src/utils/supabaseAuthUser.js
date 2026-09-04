import { AppError } from './errors.js';
import { createSupabaseClient } from '../models/supabaseClient.js';

/**
 * Valida JWT do Supabase Auth (cliente web, não admin).
 * @param {import('express').Request} req
 * @returns {Promise<{ id: string, email: string|null }>}
 */
export async function getAuthUserFromRequest(req) {
  const hdr = String(req.headers.authorization ?? '');
  const m = hdr.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    throw new AppError('Sessão ausente. Faça login.', 401);
  }

  const supabase = createSupabaseClient();
  const { data, error } = await supabase.auth.getUser(m[1]);
  if (error || !data.user?.id) {
    throw new AppError('Sessão inválida ou expirada.', 401);
  }

  const email = data.user.email ? data.user.email.trim().toLowerCase() : null;
  return { id: data.user.id, email };
}

/**
 * URL pública do app (redirect OAuth, links).
 * @param {import('express').Request} req
 */
export function publicAppBaseUrl(req) {
  const appUrl = process.env.PUBLIC_APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}
