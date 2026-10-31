import { CallbackError, handleAuth } from '@workos-inc/authkit-nextjs';
import { NextResponse } from 'next/server';

// Derive the public base URL from the redirect URI so the callback doesn't
// redirect to the container-internal 0.0.0.0 address on Railway/Docker.
// NEXT_PUBLIC_ vars are only inlined in client bundles; in server-side Route
// Handlers we need the runtime env var. Try both, plus RAILWAY_PUBLIC_DOMAIN.
function getBaseURL(): string | undefined {
  const redirectUri =
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ||
    process.env.WORKOS_REDIRECT_URI ||
    '';
  if (redirectUri) {
    try { return new URL(redirectUri).origin; } catch { /* fall through */ }
  }
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayDomain) return `https://${railwayDomain}`;
  return undefined;
}

// A sign-in that did not start on this site, such as accepting a WorkOS
// invitation from its email, reaches the callback without this browser's
// sign-in cookie. AuthKit refuses that (correctly: the cookie is the CSRF
// check), but the user is already signed in at WorkOS, so starting a fresh
// sign-in from /chat passes straight through instead of showing an error.
const RESTARTABLE = new Set(['missing_auth_params', 'missing_pkce_cookie', 'oauth_state_mismatch']);

export const GET = handleAuth({
  returnPathname: '/chat',
  baseURL: getBaseURL(),
  onError: ({ error, request }) => {
    if (error instanceof CallbackError && RESTARTABLE.has(error.code)) {
      return NextResponse.redirect(new URL('/chat', getBaseURL() ?? request.url));
    }
    return NextResponse.json(
      { error: { message: 'Something went wrong', description: "Couldn't sign in. Please try again." } },
      { status: 500 },
    );
  },
});
