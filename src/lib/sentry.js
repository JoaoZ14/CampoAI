import * as Sentry from '@sentry/node';

let initialized = false;

/**
 * Inicializa Sentry se SENTRY_DSN estiver definido.
 * Chamado uma vez no boot do servidor.
 */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn || initialized) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
  });
  initialized = true;
}

export function captureException(err, context = {}) {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      scope.setExtra(key, value);
    }
    Sentry.captureException(err);
  });
}

export { Sentry };
