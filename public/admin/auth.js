import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let supabase = null;

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return new URL(p, window.location.origin).href;
}

export function safeAdminNext(raw) {
  if (!raw || typeof raw !== 'string') return '/admin/';
  if (!raw.startsWith('/admin')) return '/admin/';
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return '/admin/';
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return '/admin/';
  }
}

export async function initSupabase() {
  if (supabase) return supabase;
  const cfg = await fetch(apiUrl('/admin/api/config'), { cache: 'no-store' }).then((r) => r.json());
  if (!cfg.ok) throw new Error(cfg.error || 'Config indisponível');
  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return supabase;
}

export function getSupabase() {
  if (!supabase) throw new Error('Supabase não inicializado');
  return supabase;
}

async function authHeader() {
  const client = getSupabase();
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function apiFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}), ...(await authHeader()) };
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
  apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const apiPatch = (path, body) =>
  apiFetch(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const apiPut = (path, body) =>
  apiFetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const apiDelete = (path, body) =>
  apiFetch(path, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
