import type { NextRequest, NextFetchEvent } from 'next/server';
import { authkitProxy } from '@workos-inc/authkit-nextjs';

const auth = authkitProxy({
  middlewareAuth: {
    enabled: true,
    // `/`, `/terms`, `/privacy`, and `/get-help` are the public marketing/legal
    // surface. `/get-help` stays public so a person who cannot sign in can
    // still reach the help contacts.
    // Entries are matched as END-ANCHORED path-to-regexp patterns (see
    // getMiddlewareAuthPathRegex in @workos-inc/authkit-nextjs), NOT prefixes
    // — '/' admits exactly the root and nothing else. The logged-out e2e spec
    // (public-pages.spec.ts) asserts /chat still redirects to WorkOS, guarding
    // against a future authkit change to these semantics.
    // `/preview` is the dev-only component gallery. It's allow-listed here so
    // it's reachable without a login round-trip; the route itself returns 404
    // in production (see app/preview/page.tsx), which is the real protection.
    unauthenticatedPaths: ['/', '/terms', '/privacy', '/get-help', '/auth/callback', '/preview'],
  },
});

// Next.js 16 renamed middleware.ts → proxy.ts with a named `proxy` export.
export function proxy(request: NextRequest, event: NextFetchEvent) {
  return auth(request, event);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
};
