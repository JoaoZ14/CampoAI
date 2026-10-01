import type { SupabaseClient } from '@supabase/supabase-js';

export type Farm = { id: string; name: string; city?: string | null; state?: string | null; total_area_ha?: number | null; timezone?: string | null };
export type Task = { id: string; title: string; description?: string | null; due_at: string; status: 'pending' | 'completed' | 'cancelled'; priority?: string; remind?: boolean; field_id?: string | null };
export type Field = { id: string; name: string; area_ha?: number | null };
export type Operation = { id: string; description: string; operation_date: string; operation_type: string };
export type ExpenseSummary = { amount: number; cost_per_ha: number | null; count: number };
export type Summary = { farm: Farm; fields: Field[]; seasons: { id: string; name: string; status: string }[]; tasks: Task[]; operations: Operation[]; expenses: ExpenseSummary | null; alerts: { id: string; title: string; message: string }[]; list_limit: number };
export type ActivityChange = { entity: string; entity_id: string | null; type: 'created' | 'updated'; label: string; title: string };
export type Activity = { id: string; created_at: string; source: 'app' | 'lida'; status: 'completed' | 'failed'; changes: ActivityChange[] };
export type ActivityPage = { items: Activity[]; has_more: boolean };
export type Weather = { source: string; retrieved_at: string; current: { temperature_2m?: number; precipitation?: number }; current_units?: { temperature_2m?: string; precipitation?: string }; daily?: { precipitation_probability_max?: number[] } };

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const externalUrl = (path: string) => `${apiBase}${path}`;
let client: SupabaseClient | null = null;
let clientPromise: Promise<SupabaseClient> | null = null;

export class ApiError extends Error {
  constructor(message: string, public status = 0, public requestId?: string) { super(message); }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  const message = error instanceof Error ? error.message : '';
  if (/invalid login credentials/i.test(message)) return 'E-mail ou senha incorretos. Confira e tente novamente.';
  if (/email not confirmed/i.test(message)) return 'Confirme seu e-mail antes de entrar.';
  if (/fetch|network|timeout/i.test(message)) return 'Não foi possível conectar. Confira sua internet e tente novamente.';
  return 'Não foi possível concluir agora. Seus dados preenchidos foram mantidos. Tente novamente.';
}

async function request(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timer = window.setTimeout(() => controller.abort(), 20000);
  try { return await fetch(`${apiBase}${path}`, { ...options, signal: controller.signal, cache: 'no-store' }); }
  catch (error) {
    if (options.signal?.aborted) throw error;
    const writing = options.method && !['GET', 'HEAD'].includes(options.method);
    throw new ApiError(writing
      ? 'Não recebemos a confirmação. Confira os registros antes de reenviar. Seus dados foram mantidos.'
      : 'Não foi possível conectar. Confira sua internet e tente novamente.');
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}

// One instance per draft/action: retries reuse the key, successful new actions do not.
export function createWriteRequest() {
  let signature = '', key = '';
  return async <T,>(path: string, options: RequestInit): Promise<T> => {
    const next = `${path}:${options.method}:${options.body}`;
    if (next !== signature) { signature = next; key = crypto.randomUUID(); }
    const result = await api<T>(path, { ...options, headers: { ...Object.fromEntries(new Headers(options.headers)), 'Idempotency-Key': key } });
    signature = ''; key = '';
    return result;
  };
}

export async function authClient() {
  if (client) return client;
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
  const config = await request('/api/customer/config');
  const payload = await config.json();
  if (!config.ok || !payload.ok) throw new ApiError('Login indisponível no momento. Tente novamente.', config.status);
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(payload.supabaseUrl, payload.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ag-customer-auth' },
  });
  return client;
  })();
  try { return await clientPromise; } catch (error) { clientPromise = null; throw error; }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = await authClient();
  const { data } = await auth.auth.getSession();
  if (!data.session) throw new ApiError('Sua sessão terminou. Entre novamente.', 401);
  options.signal?.throwIfAborted();
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (options.method && options.method !== 'GET' && !headers.has('Idempotency-Key')) headers.set('Idempotency-Key', crypto.randomUUID());
  const response = await request(path, { ...options, headers });
  const result = await response.json().catch(() => null);
  if (response.ok && result?.ok !== true) {
    throw new ApiError(options.method && options.method !== 'GET'
      ? 'Não recebemos a confirmação. Confira os registros antes de reenviar. Seus dados foram mantidos.'
      : 'Recebemos uma resposta incompleta. Tente atualizar em instantes.');
  }
  if (!response.ok) {
    const message = response.status === 401 ? 'Sua sessão terminou. Entre novamente.'
      : response.status >= 500 ? (options.method && options.method !== 'GET'
        ? 'Não recebemos a confirmação. Confira os registros antes de reenviar. Seus dados foram mantidos.'
        : 'O serviço está indisponível agora. Tente atualizar em instantes.')
      : result?.error || result?.message || 'Não foi possível carregar os dados.';
    throw new ApiError(message, response.status, result?.requestId);
  }
  return result.data ?? result;
}

export const rural = (farmId: string, path = '') => `/api/rural/farms/${encodeURIComponent(farmId)}${path}`;
export const jsonBody = (value: unknown) => JSON.stringify(value);
