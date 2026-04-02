import { handleAuth } from '@workos-inc/authkit-nextjs';

// Derive the public base URL from the redirect URI so the callback doesn't
// redirect to the container-internal 0.0.0.0 address on Railway/Docker.
const redirectUri = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? '';
const baseURL = redirectUri ? new URL(redirectUri).origin : undefined;

export const GET = handleAuth({ returnPathname: '/chat', baseURL });
