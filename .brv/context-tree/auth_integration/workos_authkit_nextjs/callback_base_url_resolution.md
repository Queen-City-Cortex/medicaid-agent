---
title: Callback Base URL Resolution
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-03T04:11:35.580Z'
updatedAt: '2026-04-03T04:11:35.580Z'
---
## Raw Concept
**Task:**
Resolve a reliable base URL for the WorkOS auth callback when NEXT_PUBLIC_* vars are missing in server routes.

**Changes:**
- Added fallback to WORKOS_REDIRECT_URI runtime variable
- Added fallback to RAILWAY_PUBLIC_DOMAIN when redirect URIs are not parseable

**Files:**
- packages/web/src/app/auth/callback/route.ts

**Flow:**
auth callback route -> getBaseURL helper -> read NEXT_PUBLIC_WORKOS_REDIRECT_URI | WORKOS_REDIRECT_URI -> parse origin -> if invalid use RAILWAY_PUBLIC_DOMAIN -> pass origin to handleAuth

**Timestamp:** 2026-04-03

## Narrative
### Structure
The GET handler for /auth/callback delegates to handleAuth with a baseURL resolved by getBaseURL. getBaseURL first attempts the compile-time NEXT_PUBLIC_WORKOS_REDIRECT_URI, then the runtime WORKOS_REDIRECT_URI, and lastly uses RAILWAY_PUBLIC_DOMAIN to avoid Railway/Docker internal hosts.

### Dependencies
Requires NEXT_PUBLIC_WORKOS_REDIRECT_URI for builds and WORKOS_REDIRECT_URI/RAILWAY_PUBLIC_DOMAIN at runtime; network requests rely on handleAuth from @workos-inc/authkit-nextjs.

### Highlights
Ensures standalone Next.js Route Handlers do not redirect clients to 0.0.0.0 by deriving a public origin before invoking handleAuth.

## Facts
- **env_inlining**: NEXT_PUBLIC_* env vars are only inlined in client bundles at build time. [project]
- **nextjs_runtime_env**: Server-side Route Handlers on Next.js standalone builds find process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI empty at runtime. [project]
- **base_url_fallback**: getBaseURL first tries NEXT_PUBLIC_WORKOS_REDIRECT_URI, then WORKOS_REDIRECT_URI, and finally the RAILWAY_PUBLIC_DOMAIN to derive a public origin. [project]
- **handle_auth_baseurl**: handleAuth is configured with baseURL from getBaseURL to avoid redirecting to Railway/Docker internal hostnames. [project]
