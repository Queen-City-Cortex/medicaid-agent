// Browser-side Sentry init, gated on the public DSN (inlined at build time by
// Next.js) and a non-development / non-local environment. Empty/unset DSN ->
// Sentry.init is never called, so this is a no-op in any deploy without Sentry
// configured. Development AND localhost are skipped so local sessions never
// report into the shared Sentry project. Errors plus sampled traces:
// tracesSampleRate falls back to 0.1 (10%) so production errors carry
// transaction/span context — override with NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE.
import * as Sentry from '@sentry/nextjs';
import type { Breadcrumb } from '@sentry/nextjs';

// The SDK's click/input breadcrumbs serialise the event target with the full
// value of these attributes, and labels here carry user text: the rename input
// is labelled `Rename <thread title>`, and a title is the start of a user's
// question. The SDK does not escape values, so a title can contain anything a
// selector can, including `"] > `, and no pattern can find where it ends. Cut
// from the first such attribute to the end: the crumb keeps the path down to
// that element and the attribute's name, and loses the rest.
const LABEL_ATTRIBUTE_VALUE = /\[(aria-label|title|alt|name)="[\s\S]*$/;

export function scrubUiBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (!breadcrumb.category?.startsWith('ui.') || typeof breadcrumb.message !== 'string') {
    return breadcrumb;
  }
  return { ...breadcrumb, message: breadcrumb.message.replace(LABEL_ATTRIBUTE_VALUE, '[$1]') };
}

// NODE_ENV / the public env var are inlined at BUILD time, so a stale or
// production build run locally (`next start`) could slip past them. The
// runtime hostname check is the belt-and-suspenders that catches any local
// session regardless of how it was built — this is what prevents the
// localhost:3000 dev events that leaked into Sentry from pre-fix builds.
const isLocalHost =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(window.location.hostname);

const isDevelopment =
  process.env.NODE_ENV === 'development'
  || process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === 'development'
  || isLocalHost;

if (process.env.NEXT_PUBLIC_SENTRY_DSN && !isDevelopment) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Fall back to NODE_ENV (inlined by Next.js client-side) so events stay
    // sliceable by environment in the dashboard even when the public env var
    // is unset — mirrors the server-side init in instrumentation.ts.
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    beforeBreadcrumb: scrubUiBreadcrumb,
  });
}

// Lets Sentry tie client-side navigation to the originating request.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
