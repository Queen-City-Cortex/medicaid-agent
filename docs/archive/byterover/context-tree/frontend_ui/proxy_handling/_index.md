---
children_hash: d2c1a6a4be6746292959f67b2fc614e66f6f6ea20b305d830f9e9933f4e0200f
compression_ratio: 0.4340329835082459
condensation_order: 1
covers: [context.md, next_js_16_proxy_authkit_migration.md, web_theme_persistence.md]
covers_token_total: 1334
summary_level: d1
token_count: 579
type: summary
---
# proxy_handling

Frontend proxy and theme behavior are centered in the web app’s Next.js 16 migration and user-preference persistence model.

## Core topics

- **context.md** — Domain overview for `proxy_handling`
  - Covers the migration from deprecated Next.js middleware to the Next.js 16 `proxy.ts` entrypoint.
  - Key concepts: `authkitProxy`, `middlewareAuth`, and route matcher configuration for public paths.
  - Related drill-down: `frontend_ui/chat_page_scroll_stability` for page behavior interactions.

## Proxy migration and auth integration

- **next_js_16_proxy_authkit_migration.md**
  - Documents the switch from `authkitMiddleware` to `authkitProxy` in `packages/web/src/proxy.ts`.
  - The proxy function now uses the Next.js 16 signature: `NextRequest` only, with `NextFetchEvent` removed to fix the `adapterFn is not a function` error.
  - Authentication remains gated to `/auth/callback` via `unauthenticatedPaths`, while the matcher stays broad enough to cover app routes.
  - The matcher continues excluding `_next/static`, `_next/image`, `favicon`, `sitemap`, and `robots` so assets and public metadata are not proxied.
  - Dependencies: `@workos-inc/authkit-nextjs` and Next.js 16 proxy conventions.

## Theme persistence model

- **web_theme_persistence.md**
  - Documents a corrected, cookie-first theme persistence flow for the web app.
  - Theme is read from a cookie for first paint; WorkOS metadata is secondary and used only for cross-device sync and cookie backfill.
  - Server-side read in `layout.tsx` and client-side pre-paint read prevent a flash of incorrect theme.
  - Depends on `packages/web/README.md`, `packages/web/src/app/actions/theme.ts`, and `packages/web/src/app/layout.tsx`.
  - The model supports preference carryover across devices without making WorkOS the primary source of truth.

## Structural relationship

- The `proxy_handling` domain captures two related frontend infrastructure concerns:
  - **request interception/auth routing** via the Next.js 16 proxy + Authkit
  - **persistent UI preference application** via cookie-first theme handling
- Both emphasize early, framework-level handling to avoid user-visible issues:
  - proxy auth must align with Next.js 16 signatures and route matching
  - theme must be available before paint to avoid visual flash