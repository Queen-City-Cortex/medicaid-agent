import type { NextRequest, NextFetchEvent } from 'next/server';
import { authkitMiddleware } from '@workos-inc/authkit-nextjs';

const auth = authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ['/auth/callback'],
  },
});

// Next.js 16 renamed middleware.ts → proxy.ts with a named `proxy` export.
export function proxy(request: NextRequest, event: NextFetchEvent) {
  return auth(request, event);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
};
