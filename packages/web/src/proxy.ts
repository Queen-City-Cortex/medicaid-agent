import type { NextRequest, NextFetchEvent } from 'next/server';
import { authkitProxy } from '@workos-inc/authkit-nextjs';

const auth = authkitProxy({
  middlewareAuth: {
    enabled: true,
    // `/preview` is the dev-only component gallery. It's allow-listed here so
    // it's reachable without a login round-trip; the route itself returns 404
    // in production (see app/preview/page.tsx), which is the real protection.
    unauthenticatedPaths: ['/auth/callback', '/preview'],
  },
});

// Next.js 16 renamed middleware.ts → proxy.ts with a named `proxy` export.
export function proxy(request: NextRequest, event: NextFetchEvent) {
  return auth(request, event);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
};
