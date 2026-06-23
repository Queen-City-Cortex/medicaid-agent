import * as Sentry from '@sentry/nextjs';

// Server/edge Sentry init, gated on SENTRY_DSN (read at runtime, not inlined)
// and a non-development environment. Unset DSN -> no-op; development -> skipped
// so local `next dev` doesn't report into the shared Sentry project. Only the
// exact "development" environment is suppressed. Errors-only by default
// (tracesSampleRate 0).
export async function register() {
  const environment = process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV;
  if (!process.env.SENTRY_DSN || environment === 'development') return;

  const options = {
    dsn: process.env.SENTRY_DSN,
    release: process.env.SENTRY_RELEASE,
    environment,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  };

  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(options);
  }
}

// Forwards server render/route-handler errors to Sentry. No-op until register()
// has initialised Sentry, so it is safe to export unconditionally.
export const onRequestError = Sentry.captureRequestError;
