import { AppError } from '../utils/errors.js';

const SANDBOX_BASE = 'https://sandbox.asaas.com/api/v3';
const PRODUCTION_BASE = 'https://api.asaas.com/v3';

export function getAsaasApiBaseUrl() {
  return process.env.ASAAS_SANDBOX === 'true' ? SANDBOX_BASE : PRODUCTION_BASE;
}

/**
 * @param {string} path ex.: /customers
 * @param {{ method?: string, body?: object }} opts
 */
export async function asaasRequest(path, opts = {}) {
  const key = process.env.ASAAS_API_KEY?.trim();
  if (!key) {
    throw new AppError('ASAAS_API_KEY não configurada.', 500);
  }

  const p = path.startsWith('/') ? path : `/${path}`;
  const url = `${getAsaasApiBaseUrl()}${p}`;
  const method = opts.method || 'GET';
  /** @type {RequestInit} */
  const init = {
    method,
    headers: {
      access_token: key,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };
  if (opts.body != null && method !== 'GET' && method !== 'HEAD') {
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _raw: text };
  }

  if (!res.ok) {
    const errs = Array.isArray(data.errors) ? data.errors : [];
    const piece = errs
      .map((e) => (e && (e.description || e.message)) || '')
      .filter(Boolean)
      .join('; ');
    const msg =
      piece ||
      data.message ||
      (typeof data._raw === 'string' ? data._raw.slice(0, 200) : '') ||
      res.statusText;
    const status = res.status >= 400 && res.status < 600 ? res.status : 502;
    throw new AppError(`Asaas: ${msg}`, status);
  }

  return data;
}
