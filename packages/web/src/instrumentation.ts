import * as Sentry from '@sentry/nextjs';

// Server/edge Sentry init, gated on SENTRY_DSN (read at runtime, not inlined).
// Unset -> no-op. Errors-only by default (tracesSampleRate 0).
export async function register() {
  if (!process.env.SENTRY_DSN) return;

  const options = {
    dsn: process.env.SENTRY_DSN,
    release: process.env.SENTRY_RELEASE,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  };

  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(options);
  }
}

// Forwards server render/route-handler errors to Sentry. No-op until register()
// has initialised Sentry, so it is safe to export unconditionally.
export const onRequestError = Sentry.captureRequestError;
