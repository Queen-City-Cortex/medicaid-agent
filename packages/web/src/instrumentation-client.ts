// Browser-side Sentry init, gated on the public DSN (inlined at build time by
// Next.js) and a non-development environment. Empty/unset DSN -> Sentry.init is
// never called, so this is a no-op in any deploy without Sentry configured.
// Development is skipped too, so local `next dev`/HMR sessions don't report into
// the shared Sentry project (NODE_ENV is inlined by Next; the public env var is
// the explicit signal). Errors-only by default: tracesSampleRate is 0 unless
// NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE is set.
import * as Sentry from '@sentry/nextjs';

const isDevelopment =
  process.env.NODE_ENV === 'development'
  || process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === 'development';

if (process.env.NEXT_PUBLIC_SENTRY_DSN && !isDevelopment) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Fall back to NODE_ENV (inlined by Next.js client-side) so events stay
    // sliceable by environment in the dashboard even when the public env var
    // is unset — mirrors the server-side init in instrumentation.ts.
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
}

// Lets Sentry tie client-side navigation to the originating request.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
