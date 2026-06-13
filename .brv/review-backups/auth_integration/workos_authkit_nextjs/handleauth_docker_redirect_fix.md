---
title: HandleAuth Docker Redirect Fix
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-02T22:23:03.685Z'
updatedAt: '2026-04-02T22:23:03.685Z'
---
## Raw Concept
**Task:**
Document the Docker-friendly WorkOS authkit-nextjs callback configuration for Railway deployments.

**Changes:**
- Added derived baseURL argument so handleAuth redirects to the public origin instead of 0.0.0.0 inside Docker.
- Explained the dependency between NEXT_PUBLIC_WORKOS_REDIRECT_URI and handleAuth baseURL.

**Files:**
- packages/web/src/app/auth/callback/route.ts

**Flow:**
NEXT_PUBLIC_WORKOS_REDIRECT_URI -> derive origin -> pass as baseURL to handleAuth -> GET handler returns /chat

**Timestamp:** 2026-04-02

**Author:** Migration efforts

## Narrative
### Structure
The callback route imports WorkOS authkit-nextjs handleAuth and immediately derives baseURL by parsing NEXT_PUBLIC_WORKOS_REDIRECT_URI so the returned GET handler uses a public-facing origin and returns users to /chat.

### Dependencies
Relies on NEXT_PUBLIC_WORKOS_REDIRECT_URI being set to the externally reachable callback, and on WorkOS authkit-nextjs explictly supporting a baseURL override for Docker hosts.

### Highlights
Fixes a Railway/Docker issue where HOSTNAME=0.0.0.0 causes the auth callback to redirect to 0.0.0.0:8080 by supplying the public redirect origin at runtime.

## Facts
- **callback_redirect_host**: WorkOS authkit-nextjs handleAuth invoked inside Railway Docker defaults to HOSTNAME=0.0.0.0, which causes callbacks to redirect to 0.0.0.0:8080 instead of the public site. [environment]
- **handle_auth_base_url**: Deriving baseURL from NEXT_PUBLIC_WORKOS_REDIRECT_URI origin forces handleAuth to use the public-facing callback host while still honoring WorkOS authkit-nextjs Docker support. [project]
