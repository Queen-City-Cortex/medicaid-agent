---
children_hash: 976020f2589078cf094a209ea9705e311508469f6c0806f8ae051c660f334d0b
compression_ratio: 0.5155807365439093
condensation_order: 1
covers: [context.md, next_js_16_proxy_authkit_migration.md]
covers_token_total: 706
summary_level: d1
token_count: 364
type: summary
---
### proxy_handling (frontend_ui/proxy_handling)

- **Purpose**: Documents the Medicaid agent’s shift of Next.js middleware responsibilities to the Next.js 16 `proxy.ts` pattern while integrating WorkOS Authkit.
- **Architecture**: `packages/web/src/proxy.ts` now exports a named `proxy` function that forwards every `NextRequest` to `authkitProxy` with `middlewareAuth: { enabled: true, unauthenticatedPaths: ['/auth/callback'] }`, ensuring only `/auth/callback` is exempt from authentication.
- **Matcher Strategy**: The proxy matcher explicitly excludes Next.js static assets (`_next/static`, `_next/image`) plus metadata paths (`favicon.ico`, `sitemap.xml`, `robots.txt`) so only dynamic app routes reach the proxy.
- **Migration Highlights** (`next_js_16_proxy_authkit_migration.md`):
  - Replaced the deprecated `authkitMiddleware` export with `authkitProxy`.
  - Dropped the unused `NextFetchEvent` parameter to match Next.js 16’s single-argument proxy signature, resolving the “adapterFn is not a function” error.
  - Auth handling flow: Incoming `NextRequest` → `authkitProxy` with middlewareAuth config → authenticated request forwarded downstream.
- **Dependencies**: Shift relies on `@workos-inc/authkit-nextjs` for the new `authkitProxy` helper and the Next.js 16 requirement that middleware lives in `proxy.ts` as a named export.
- **Drill-down**: See `frontend_ui/chat_page_scroll_stability` for related Next.js page behavior considerations.