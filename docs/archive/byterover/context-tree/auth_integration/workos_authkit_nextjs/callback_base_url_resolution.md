---
consolidated_at: '2026-06-12T03:04:59.529Z'
consolidated_from: [{date: '2026-06-12T03:04:59.529Z', path: auth_integration/workos_authkit_nextjs/handleauth_docker_redirect_fix.md, reason: 'These files document the same WorkOS authkit-nextjs callback baseURL fix for Railway/Docker. They overlap heavily on the baseURL derivation from redirect env vars, the handleAuth override, and the 0.0.0.0 redirect problem, with only minor additions in the newer file (fallback to WORKOS_REDIRECT_URI and RAILWAY_PUBLIC_DOMAIN).'}]
---
## Raw Concept
**Task:**
Resolve a reliable base URL for the WorkOS auth callback when NEXT_PUBLIC_* vars are missing in server routes.

**Changes:**
- Added fallback to WORKOS_REDIRECT_URI runtime variable
- Added fallback to RAILWAY_PUBLIC_DOMAIN when redirect URIs are not parseable
- Added derived baseURL argument so handleAuth redirects to the public origin instead of 0.0.0.0 inside Docker.
- Explained the dependency between NEXT_PUBLIC_WORKOS_REDIRECT_URI and handleAuth baseURL.

**Files:**
- packages/web/src/app/auth/callback/route.ts

**Flow:**
auth callback route -> getBaseURL helper -> read NEXT_PUBLIC_WORKOS_REDIRECT_URI | WORKOS_REDIRECT_URI -> parse origin -> if invalid use RAILWAY_PUBLIC_DOMAIN -> pass origin to handleAuth

**Timestamp:** 2026-04-03

**Author:** Migration efforts

## Narrative
### Structure
The GET handler for /auth/callback delegates to handleAuth with a baseURL resolved by getBaseURL. getBaseURL first attempts the compile-time NEXT_PUBLIC_WORKOS_REDIRECT_URI, then the runtime WORKOS_REDIRECT_URI, and lastly uses RAILWAY_PUBLIC_DOMAIN to avoid Railway/Docker internal hosts.

The callback route imports WorkOS authkit-nextjs handleAuth and immediately derives baseURL by parsing NEXT_PUBLIC_WORKOS_REDIRECT_URI so the returned GET handler uses a public-facing origin and returns users to /chat.

### Dependencies
Requires NEXT_PUBLIC_WORKOS_REDIRECT_URI for builds and WORKOS_REDIRECT_URI/RAILWAY_PUBLIC_DOMAIN at runtime; network requests rely on handleAuth from @workos-inc/authkit-nextjs.
Relies on NEXT_PUBLIC_WORKOS_REDIRECT_URI being set to the externally reachable callback, and on WorkOS authkit-nextjs explicitly supporting a baseURL override for Docker hosts.

### Highlights
Ensures standalone Next.js Route Handlers do not redirect clients to 0.0.0.0 by deriving a public origin before invoking handleAuth.
Fixes a Railway/Docker issue where HOSTNAME=0.0.0.0 causes the auth callback to redirect to 0.0.0.0:8080 by supplying the public redirect origin at runtime.

## Facts
- **env_inlining**: NEXT_PUBLIC_* env vars are only inlined in client bundles at build time. [project]
- **nextjs_runtime_env**: Server-side Route Handlers on Next.js standalone builds find process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI empty at runtime. [project]
- **base_url_fallback**: getBaseURL first tries NEXT_PUBLIC_WORKOS_REDIRECT_URI, then WORKOS_REDIRECT_URI, and finally the RAILWAY_PUBLIC_DOMAIN to derive a public origin. [project]
- **handle_auth_baseurl**: handleAuth is configured with baseURL from getBaseURL to avoid redirecting to Railway/Docker internal hostnames. [project]
- **callback_redirect_host**: WorkOS authkit-nextjs handleAuth invoked inside Railway Docker defaults to HOSTNAME=0.0.0.0, which causes callbacks to redirect to 0.0.0.0:8080 instead of the public site. [environment]
- **handle_auth_base_url**: Deriving baseURL from NEXT_PUBLIC_WORKOS_REDIRECT_URI origin forces handleAuth to use the public-facing callback host while still honoring WorkOS authkit-nextjs Docker support. [project]