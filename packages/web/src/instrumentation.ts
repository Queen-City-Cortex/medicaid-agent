import * as Sentry from '@sentry/nextjs';

// Server/edge Sentry init, gated on SENTRY_DSN (read at runtime, not inlined)
// and a non-development environment. Unset DSN -> no-op; development -> skipped
// so local `next dev` doesn't report into the shared Sentry project. Only the
// exact "development" environment is suppressed. Traces default to 0.1 (10%)
// so production errors carry span context — override with SENTRY_TRACES_SAMPLE_RATE.
export async function register() {
  // Require an EXPLICITLY declared deploy environment. A local `next start`
  // has NODE_ENV=production but no SENTRY_ENVIRONMENT, so relying on the
  // NODE_ENV fallback let local server errors leak into the shared project.
  // Deploys set SENTRY_ENVIRONMENT (=production/staging); local runs don't —
  // the server-side analogue of the client hostname guard.
  const environment = process.env.SENTRY_ENVIRONMENT;
  if (!process.env.SENTRY_DSN || !environment || environment === 'development') return;

  const options = {
    dsn: process.env.SENTRY_DSN,
    release: process.env.SENTRY_RELEASE,
    environment,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  };

  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(options);
  }
}

// Forwards server render/route-handler errors to Sentry. No-op until register()
// has initialised Sentry, so it is safe to export unconditionally.
export const onRequestError = Sentry.captureRequestError;
