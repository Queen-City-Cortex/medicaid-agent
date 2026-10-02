---
confidence: 0.97
sources: [auth_integration/_index.md, frontend_ui/_index.md, agent_architecture/_index.md]
synthesized_at: '2026-07-10T19:50:59.153Z'
type: synthesis
title: Runtime identity must be resolved at the boundary, not cached early
summary: Auth, chat transport, and deployment all fail when runtime-owned identity or origin values are frozen too early.
tags: [auth, runtime-boundaries, chat, deployment]
related: []
keywords: [runtime, identity, origin, transport, env, auth, thread, memoization]
createdAt: '2026-07-10T19:50:59.153Z'
updatedAt: '2026-07-10T19:50:59.153Z'
---

# Runtime identity must be resolved at the boundary, not cached early

Across auth_integration, frontend_ui, and agent_architecture, the same bug class appears: values like callback origin, thread/resource identity, and env ownership must be resolved from live runtime state rather than build-time defaults or stale cached instances. Auth fixes compute public base URLs dynamically, frontend chat recreates transport on threadId:resourceId changes, and env symlinking keeps a single runtime source of truth.

## Evidence

- **auth_integration**: Auth reliability depends on resolving callback origins dynamically across deployment environments, using NEXT_PUBLIC_WORKOS_REDIRECT_URI → WORKOS_REDIRECT_URI → RAILWAY_PUBLIC_DOMAIN.
- **frontend_ui**: Chat identity was expanded from threadId to threadId:resourceId, and DefaultChatTransport is memoized on threadId, resourceId, and getAccessToken so auth changes force a fresh transport.
- **agent_architecture**: The repo’s operational guidance emphasizes runtime-owned configuration over build-time assumptions and keeps a single source of truth for environment configuration.
