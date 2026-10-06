import * as Sentry from '@sentry/node';

// Error tracking, gated on SENTRY_DSN *and* a non-development environment. When
// the DSN is unset (evals, CI, tests) Sentry.init is never called, so this
// module is a no-op and never opens a network connection. Imported as the
// second line of index.ts (the CLI loads it through runtime.ts) — right after ./load-env.js populates process.env —
// so the DSN and release are available here.
//
// The development gate exists because local `mastra dev` sessions (which often
// have a DSN in .env) were reporting HMR/dev-only errors into the shared Sentry
// project. Only the exact "development" environment is suppressed, so unset and
// production environments still report.
//
// Errors plus sampled traces: tracesSampleRate defaults to 0.1 (10% of requests)
// unless SENTRY_TRACES_SAMPLE_RATE is set. Sentry.init also installs global
// uncaughtException / unhandledRejection handlers, covering crashes outside the
// request path.
//
// Request bodies, headers and cookies never leave the process: the SDK defaults
// would attach up to 10 kB of each body (the user's question and re-sent thread
// history) plus the authorization and cookie headers to every captured error
// and sampled transaction. The request URL and query string are still sent.
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

// Exported so tests/sentry.test.ts can initialise the SDK from the same options
// behind a stub transport and prove no request content reaches an envelope.
export function buildSentryOptions(env: NodeJS.ProcessEnv = process.env): Sentry.NodeOptions {
  return {
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    release: env.SENTRY_RELEASE,
    // Default 0.1 (10%) so production errors carry transaction/span context —
    // the chat route's server-side failures were previously captured with no
    // trace. Override with SENTRY_TRACES_SAMPLE_RATE.
    tracesSampleRate: Number(env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Both halves are needed: the first stops the body being buffered onto the
    // scope at all, the second keeps body, cookies and headers off the event.
    // Do NOT reach for the `dataCollection` option instead: passing it switches
    // every field it leaves unspecified on, and it does not gate body capture.
    integrations: [
      Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' }),
      Sentry.requestDataIntegration({ include: { data: false, cookies: false, headers: false } }),
    ],
  };
}

if (dsn && environment && environment !== 'development') {
  Sentry.init(buildSentryOptions());
}

export { Sentry };
