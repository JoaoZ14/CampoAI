import { AppError } from '../utils/errors.js';
import { captureException } from '../lib/sentry.js';

/**
 * Middleware global de erros — não vaza stack em produção.
 */
export function errorHandler(err, req, res, _next) {
  const isApp = err instanceof AppError;
  const status = isApp ? err.statusCode : 500;
  const message = isApp && status < 500
    ? err.message
    : 'Erro interno. Tente novamente mais tarde.';

  if (status >= 500) {
    console.error('[Erro]', err);
    captureException(err, {
      path: req?.path,
      method: req?.method,
      requestId: req?.requestId,
    });
  }

  res.status(status).json({
    ok: false,
    error: message,
    code: status >= 500 ? 'SERVICE_UNAVAILABLE' : `HTTP_${status}`,
    requestId: req?.requestId,
  });
}
