// Browser-side Sentry init, gated on the public DSN (inlined at build time by
// Next.js). Empty/unset -> Sentry.init is never called, so this is a no-op in
// local dev and any deploy without Sentry configured. Errors-only by default:
// tracesSampleRate is 0 unless NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE is set.
import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
}

// Lets Sentry tie client-side navigation to the originating request.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
