import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

export async function authClient() {
  if (client) return client;
  const config = await fetch(`${apiBase}/api/customer/config`, { cache: 'no-store' });
  const payload = await config.json();
  if (!config.ok || !payload.ok) throw new Error(payload.error || 'Login indisponível.');
  client = createClient(payload.supabaseUrl, payload.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ag-customer-auth' },
  });
  return client;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = await authClient();
  const { data } = await auth.auth.getSession();
  if (!data.session) throw new Error('Sua sessão terminou. Entre novamente.');
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (options.method && options.method !== 'GET' && !headers.has('Idempotency-Key')) headers.set('Idempotency-Key', crypto.randomUUID());
  const response = await fetch(`${apiBase}${path}`, { ...options, headers, cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.message || 'Não foi possível carregar os dados.');
  return result.data ?? result;
}

export const rural = (farmId: string, path = '') => `/api/rural/farms/${encodeURIComponent(farmId)}${path}`;
export const jsonBody = (value: unknown) => JSON.stringify(value);
