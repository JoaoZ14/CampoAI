import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let supabase = null;

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return new URL(p, window.location.origin).href;
}

export function safeNextPath(raw, fallback = '/area-do-cliente') {
  if (!raw || typeof raw !== 'string') return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  if (raw.startsWith('/admin')) return fallback;
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}

export async function initCustomerSupabase() {
  if (supabase) return supabase;
  const cfg = await fetch(apiUrl('/api/customer/config'), { cache: 'no-store' }).then((r) => r.json());
  if (!cfg.ok) throw new Error(cfg.error || 'Config de login indisponível');
  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'ag-customer-auth',
    },
  });
  return supabase;
}

export function getSupabase() {
  if (!supabase) throw new Error('Supabase não inicializado');
  return supabase;
}

export async function getSession() {
  const client = getSupabase();
  const { data } = await client.auth.getSession();
  return data.session ?? null;
}

export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token || '';
}

export function displayNameFromUser(user) {
  const meta = user?.user_metadata || {};
  return String(meta.full_name || meta.name || '').trim();
}

export async function signInWithGoogle(redirectTo) {
  const client = getSupabase();
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTo || `${window.location.origin}${window.location.pathname}`,
    },
  });
  if (error) throw error;
}

export async function signInWithPassword(email, password) {
  const client = getSupabase();
  const { data, error } = await client.auth.signInWithPassword({
    email: String(email || '').trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signUpWithPassword(email, password) {
  const client = getSupabase();
  const { data, error } = await client.auth.signUp({
    email: String(email || '').trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/entrar`,
    },
  });
  if (error) throw error;
  return data;
}

export async function signOutCustomer() {
  const client = getSupabase();
  await client.auth.signOut();
}

async function authHeader() {
  const token = await getAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function apiFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}), ...(await authHeader()) };
  if (opts.body && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(apiUrl(path), { cache: 'no-store', ...opts, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || json.message || res.statusText);
    /** @type {any} */ (err).status = res.status;
    throw err;
  }
  return json;
}

export const apiGet = (path) => apiFetch(path);
export const apiPost = (path, body) =>
  apiFetch(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
export const apiPatch = (path, body) =>
  apiFetch(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
export const apiDelete = (path, body) =>
  apiFetch(path, { method: 'DELETE', body: JSON.stringify(body ?? {}) });
