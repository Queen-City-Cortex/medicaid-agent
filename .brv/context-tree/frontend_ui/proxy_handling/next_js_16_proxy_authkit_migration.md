---
title: Next.js 16 proxy authkit migration
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-02T05:00:12.449Z'
updatedAt: '2026-04-02T05:00:12.449Z'
---
## Raw Concept
**Task:**
Track the Next.js 16 proxy.ts migration that replaces the deprecated authkitMiddleware export with authkitProxy and drops the NextFetchEvent argument to resolve adapterFn TypeError.

**Changes:**
- Swapped authkitMiddleware export for authkitProxy with the same middlewareAuth config block.
- Removed the unused NextFetchEvent second argument from the proxy entrypoint to match Next.js 16 proxy signature.
- Continued to gate authentication to /auth/callback via unauthenticatedPaths while keeping the matcher broad.
- Documented the config matcher that excludes Next.js static and metadata paths so only app routes are proxied.

**Files:**
- packages/web/src/proxy.ts

**Flow:**
Next.js proxy entrypoint receives NextRequest -> authkitProxy middlewareAuth handles auth -> request forwarded to downstream routes.

**Timestamp:** 2026-04-02

**Author:** Medicaid Agent web team

## Narrative
### Structure
frontend/packages/web/src/proxy.ts now exports a named proxy function that simply forwards the incoming NextRequest to authkitProxy({ middlewareAuth: { enabled: true, unauthenticatedPaths: ['/auth/callback'] } }). The config matcher retains the exclusion of _next/static, _next/image, favicon, sitemap, and robots to avoid proxying assets while still covering dynamic routes.

### Dependencies
Relies on @workos-inc/authkit-nextjs for authkitProxy which replaces the deprecated authkitMiddleware export, and Next.js 16 expects middleware definitions inside proxy.ts with a named proxy export.

### Highlights
Fixes the "adapterFn is not a function" TypeError by updating to the new authkitProxy helper and dropping the NextFetchEvent parameter, aligning with Next.js 16 proxy conventions.

## Facts
- **nextjs_proxy_signature**: Next.js 16 proxy functions are invoked with only the NextRequest argument and no NextFetchEvent, making the legacy middleware signature invalid. [project]
- **authkit_proxy_usage**: authkitProxy now centralizes middlewareAuth configuration so the function exported from proxy.ts can be a plain req -> auth call. [project]
- **proxy_matcher**: The proxy matcher continues to block Next.js static assets and public metadata (favicon, sitemap, robots) from being intercepted. [project]
