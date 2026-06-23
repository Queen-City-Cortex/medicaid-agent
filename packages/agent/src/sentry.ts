import * as Sentry from '@sentry/node';

// Error tracking, gated on SENTRY_DSN *and* a non-development environment. When
// the DSN is unset (evals, CI, tests) Sentry.init is never called, so this
// module is a no-op and never opens a network connection. Imported as the
// second line of index.ts — right after ./load-env.js populates process.env —
// so the DSN and release are available here.
//
// The development gate exists because local `mastra dev` sessions (which often
// have a DSN in .env) were reporting HMR/dev-only errors into the shared Sentry
// project. Only the exact "development" environment is suppressed, so unset and
// production environments still report.
//
// Errors-only by default: tracesSampleRate is 0 unless SENTRY_TRACES_SAMPLE_RATE
// is set, so performance tracing can be turned on later without a code change.
// Sentry.init also installs global uncaughtException / unhandledRejection
// handlers, covering crashes outside the request path.
const dsn = process.env.SENTRY_DSN;
const environment = process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV;

if (dsn && environment !== 'development') {
  Sentry.init({
    dsn,
    environment,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
}

export { Sentry };
