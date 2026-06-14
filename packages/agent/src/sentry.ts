import * as Sentry from '@sentry/node';

// Error tracking, gated entirely on SENTRY_DSN. When the DSN is unset (local
// dev, evals, CI, tests) Sentry.init is never called, so this module is a
// no-op and never opens a network connection. Imported as the second line of
// index.ts — right after ./load-env.js populates process.env — so the DSN and
// release are available here.
//
// Errors-only by default: tracesSampleRate is 0 unless SENTRY_TRACES_SAMPLE_RATE
// is set, so performance tracing can be turned on later without a code change.
// Sentry.init also installs global uncaughtException / unhandledRejection
// handlers, covering crashes outside the request path.
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
}

/** True when Sentry is active (DSN configured). */
export const sentryEnabled = Boolean(dsn);

export { Sentry };
