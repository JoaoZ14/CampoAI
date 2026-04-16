import { createClient } from '@supabase/supabase-js';
import { AppError } from '../utils/errors.js';

/**
 * Cliente Supabase com service role (apenas servidor — nunca exponha no front).
 */
export function createSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new AppError(
      'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes (configure no Vercel: Settings → Environment Variables).',
      500
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
