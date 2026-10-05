# Working artifact from the agent-server reviewer

## Route inventory (verified in an in-process createHonoServer assembly)

### Custom routes (registered by index.ts apiRoutes) — gated by execution gateway + bound resource id
| Method | Path | Auth/binding |
| --- | --- | --- |
| POST | /chat | owned; chat-route pre-checks thread ownership |
| GET/POST | /feedback, DELETE /feedback/:id | owned; feedback repo filters by resourceId |
| GET | /corpus-status | owned (auth required; not per-user data) |
| POST/GET | /research/runs, /research/runs/:id, .../decision|cancel | owned; research repo binds resourceId |
| GET | /livez /readyz /dependencyz /healthz | public (requiresAuth:false) |

### Built-in Mastra routes the gateway EXPOSES (7) — ownership via MASTRA_RESOURCE_ID_KEY
GET/POST /api/memory/threads; GET/PATCH/DELETE /api/memory/threads/:id; GET /api/memory/threads/:id/messages; POST /api/memory/threads/:id/clone. Ownership holds on GET/PATCH/DELETE/clone; the messages `include` read and createThread overwrite are the gaps (finding 1).

### Built-in routes BLOCKED: 344 / 351 (agents, workflows, tools, telemetry/observability, memory save/search, stored-*, vectors, a2a, mcp) → gateway 404.

### Routes that execute BEFORE the gateway (no auth) — finding 9
GET /health → 200; GET /api/agents/:id/browser/session → 200; POST /api/agents/:id/browser/close → handler runs (404 today); GET /browser/:id/stream (WebSocket upgrade) answered by setupBrowserStream before server.middleware.

## Configuration surface (one system vs two — finding 6)
| Variable | Read by | Validated at startup? | Consumed from runtimeConfig? | Silent-failure mode |
| --- | --- | --- | --- | --- |
| DATABASE_URL, PORT, CORS_ORIGINS, TRACE_STORE, *_RETENTION_* | runtime-config | yes (Zod/throws) | yes | fail-fast |
| NEO4J_URI/USER/PASSWORD | runtime-config (prod rules) AND neo4j.ts strEnv | partial | no (neo4j.ts re-reads env) | prod rules enforced; dev silent default |
| AGENT_MODEL | runtime-config AND model.ts strEnv | min(1) | no (model.ts re-reads) | validated value discarded |
| MAX_BODY_BYTES, MAX_MESSAGE_CHARS | runtime-config AND middleware/guard intEnv | positive-int | no (consumers re-read) | garbage → silent default |
| RATE_LIMIT_MESSAGES_PER_HOUR/DAY, RATE_LIMIT_RETENTION_HOURS | rate-limit intEnv (+runtime-config retention) | only retention | partial | garbage → silent default |
| NEO4J_QUERY_TIMEOUT_MS, NEO4J_IDLE_CLOSE_MS, VOYAGE_TIMEOUT_MS, EMBEDDING_DIMENSIONS, DEEP_RESEARCH_* | intEnv/strEnv at use site | no | no | garbage → silent default |
| OBSERVATIONAL_MEMORY_ENABLED, ALLOW_MASTRA_STUDIO | boolEnv | no | no | case-sensitive: 'TRUE'/'yes' → default |
| VERIFIER_ENABLED, SCOPE_GATE_ENABLED, JEV_SECTION_ROLES_ENABLED | runtime-config + env.ts/scope-gate/readiness | partial | no | '!== false' semantics by design |
| CORPUS_RELEASE_ID | readiness.ts only | no | no | required for /readyz in prod but not startup-validated (fail-at-healthcheck) |
