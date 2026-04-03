import { handleAuth } from '@workos-inc/authkit-nextjs';

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

export const GET = handleAuth({ returnPathname: '/chat', baseURL: getBaseURL() });
