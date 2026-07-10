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
// Require an EXPLICITLY declared deploy environment: a local run (mastra dev,
// or an eval with SENTRY_DSN in .env) without SENTRY_ENVIRONMENT no-ops instead
// of leaking into the shared Sentry project. Deploys set it to production/staging.
const environment = process.env.SENTRY_ENVIRONMENT;

if (dsn && !environment) {
  // A deploy with a DSN but no declared environment silently loses all error
  // tracking — the single most likely Sentry misconfiguration. Fail loud at
  // startup (plain console: the logger isn't initialised yet this early).
  console.warn(
    '⚠️  SENTRY_DSN is set but SENTRY_ENVIRONMENT is not — Sentry is DISABLED. ' +
      'Set SENTRY_ENVIRONMENT=production (or staging) on this service to enable error tracking.',
  );
}

if (dsn && environment && environment !== 'development') {
  Sentry.init({
    dsn,
    environment,
    release: process.env.SENTRY_RELEASE,
    // Default 0.1 (10%) so production errors carry transaction/span context —
    // the chat route's server-side failures were previously captured with no
    // trace. Override with SENTRY_TRACES_SAMPLE_RATE.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
}

export { Sentry };
