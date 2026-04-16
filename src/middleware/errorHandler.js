import { AppError } from '../utils/errors.js';

/**
 * Middleware global de erros — não vaza stack em produção.
 */
export function errorHandler(err, _req, res, _next) {
  const isApp = err instanceof AppError;
  const status = isApp ? err.statusCode : 500;
  const message = isApp
    ? err.message
    : 'Erro interno. Tente novamente mais tarde.';

  if (status >= 500) {
    console.error('[Erro]', err);
  }

  res.status(status).json({
    ok: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && !isApp
      ? { detail: err instanceof Error ? err.message : String(err) }
      : {}),
  });
}
