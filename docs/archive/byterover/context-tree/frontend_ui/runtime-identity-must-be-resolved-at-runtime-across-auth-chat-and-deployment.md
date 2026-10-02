---
confidence: 0.98
sources: [auth_integration/_index.md, frontend_ui/_index.md, agent_architecture/_index.md, database_operations/_index.md]
synthesized_at: '2026-07-10T02:33:44.466Z'
type: synthesis
title: Runtime identity must be resolved at runtime across auth, chat, and deployment
summary: Auth, chat transport, and deployment all fail when build-time or stale identity is used instead of live runtime state.
tags: [auth, runtime-boundaries, chat-state, deployment]
related: []
keywords: [runtime identity, callback origin, thread identity, environment source of truth, transport reinitialization, neo4j auth, baseurl]
createdAt: '2026-07-10T02:33:44.466Z'
updatedAt: '2026-07-10T02:33:44.466Z'
---

# Runtime identity must be resolved at runtime across auth, chat, and deployment

A shared architectural boundary appears across `auth_integration`, `frontend_ui`, and `agent_architecture`: runtime identity must be resolved from live environment and auth state, not from static defaults. `auth_integration` shows callback/baseURL resolution must choose public origins at request time; `frontend_ui` shows `DefaultChatTransport` must reinitialize on `threadId:resourceId` and auth changes; and `agent_architecture`/`database_operations` tie reliability issues to runtime-owned env and initialization-only assumptions. The same correctness rule prevents redirects to internal hosts, stale anonymous chat sessions, and first-run-only credential mistakes.

## Evidence

- **auth_integration**: Auth reliability depends on resolving callback origins dynamically across deployment environments instead of using internal container hosts.
- **frontend_ui**: Chat identity was expanded from threadId to threadId:resourceId, and DefaultChatTransport is memoized on threadId, resourceId, and getAccessToken so auth changes force a fresh transport.
- **agent_architecture**: The environment consolidation work makes the root .env the source of truth and symlinks package env files to keep runtime settings aligned.
- **database_operations**: Neo4j auth on Railway is environment-sensitive and NEO4J_AUTH only sets the password on first volume initialization.
