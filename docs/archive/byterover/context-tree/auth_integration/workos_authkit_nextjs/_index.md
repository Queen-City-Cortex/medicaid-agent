---
children_hash: 9c7e2eb4f21dbff4462b4aa2769165f27fd7c8c808d25e012399620955b63ff0
compression_ratio: 0.41116751269035534
condensation_order: 1
covers: [callback_base_url_resolution.md, context.md]
covers_token_total: 985
summary_level: d1
token_count: 405
type: summary
---
# workos_authkit_nextjs

## Overview
This topic documents the WorkOS authkit-nextjs callback routing fix for Railway/Docker deployments, centered on deriving a public `baseURL` for `handleAuth` instead of letting server-side callbacks resolve to internal hosts like `0.0.0.0`.

## Structural Summary
- **Primary file:** `callback_base_url_resolution.md`
  - Defines the callback route flow in `packages/web/src/app/auth/callback/route.ts`.
  - The `/auth/callback` GET handler delegates to `handleAuth` with a computed `baseURL`.
  - `getBaseURL` resolution order:
    1. `NEXT_PUBLIC_WORKOS_REDIRECT_URI`
    2. `WORKOS_REDIRECT_URI`
    3. `RAILWAY_PUBLIC_DOMAIN`
  - The helper parses an origin from redirect URIs and falls back to the Railway public domain when values are missing or unparseable.
  - The resulting public origin is passed into `handleAuth` so users are redirected back to `/chat` correctly.

## Key Facts and Relationships
- `NEXT_PUBLIC_*` env vars are build-time inlined and may be empty in Next.js server Route Handlers at runtime.
- The fix addresses a Railway/Docker issue where `HOSTNAME=0.0.0.0` causes auth callbacks to redirect to `0.0.0.0:8080`.
- `handleAuth` from `@workos-inc/authkit-nextjs` supports a `baseURL` override, which is used here to force public-facing redirects.
- The callback route depends on both build-time and runtime environment variables to remain portable across local, Docker, and Railway deployments.

## Drill-down Entry
- **`callback_base_url_resolution.md`** — full explanation of the base URL resolution helper, runtime fallbacks, and the redirect-host fix.