import { createSupabaseClient } from '../models/supabaseClient.js';

function parseAdminEmails() {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Valida JWT do Supabase Auth e restringe a e-mails em ADMIN_EMAILS.
 */
export async function requireAdminAuth(req, res, next) {
  try {
    const hdr = req.headers.authorization ?? '';
    const m = hdr.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      return res.status(401).json({ ok: false, error: 'Token ausente.' });
    }

    const allow = parseAdminEmails();
    if (allow.length === 0) {
      return res.status(503).json({
        ok: false,
        error: 'Painel não configurado: defina ADMIN_EMAILS no servidor.',
      });
    }

    const supabase = createSupabaseClient();
    const { data, error } = await supabase.auth.getUser(m[1]);

    if (error || !data.user?.email) {
      return res.status(401).json({ ok: false, error: 'Sessão inválida ou expirada.' });
    }

    const email = data.user.email.trim().toLowerCase();
    if (!allow.includes(email)) {
      return res.status(403).json({ ok: false, error: 'Acesso negado para este usuário.' });
    }

    req.adminUser = { id: data.user.id, email: data.user.email };
    next();
  } catch (err) {
    next(err);
  }
}
