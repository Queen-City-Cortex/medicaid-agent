# Working artifact from the mastra-installed reviewer

## Mastra / AI-SDK type-suppression ledger (agent + web src)

| File:line | Cast | Classification |
| --- | --- | --- |
| deep-research/routes.ts:58,98,119 | `c.get('mastra') as unknown as ResearchMastra` | Typing gap — real Mastra type erased to a local structural interface (finding F6). |
| deep-research/service.ts:35-48 | `WorkflowLike`/`WorkflowRunLike` hand-declared, used via the cast above | Typing gap — no compile check vs installed workflow API (F6). |
| processors/verifier/processor.ts:14,117 | `(message as any).content` | Typing gap — MastraDBMessage.content union (string vs {parts}); defensive read. |
| processors/verifier/processor.ts:75,88 | `writer?.custom({ type: VERIFICATION_PART, ... } as any)` | Typing gap — ProcessorStreamWriter.custom wants a data- chunk; runtime shape is correct (ai-sdk passes data-* through). |
| processors/verifier/processor.ts:121 | `{ ...msg, content: corrected } as unknown as MastraDBMessage` | Typing gap — legacy string-content branch. |
| index.ts:372 | `await agent.generate(CLI_QUESTION, { ... } as any)` | Typing gap — onStepFinish/memory options on the CLI generate call. |
| index.ts:381 | `(result as any).response?.messages ?? (result as any).messages` | Typing gap — FullOutput message access; dual-shape fallback is dead against installed core. |

No `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck` touch Mastra or AI SDK types in agent or web src. None of the above were found to hide a real type error against the installed versions; all are boundary-typing gaps.

## Exposed route surface vs ownership enforcement (execution-gateway OWNED_ROUTES)

| Route | Handler owner | Ownership enforcement |
| --- | --- | --- |
| POST /chat | app (chat-route.ts) | app: thread.resourceId !== userId -> 404 (sound) |
| GET/POST /feedback, DELETE /feedback/:id | app | app repo (resourceId scoped) |
| POST /research/runs, GET/POST /research/runs/:id[/decision\|cancel] | app | app: getBoundUserId + repo.get(runId,resourceId) |
| GET /livez,/readyz,/dependencyz,/healthz | app | public (requiresAuth:false) |
| GET/POST /api/memory/threads | Mastra 1.45 | enforceThreadAccess — create-over-id upsert gap (F1) |
| GET/PATCH/DELETE /api/memory/threads/:id | Mastra 1.45 | enforceThreadAccess (read/update/delete OK) |
| GET /api/memory/threads/:id/messages | Mastra 1.45 | thread check OK; `include` storage-fallback gap (F1) |
| POST /api/memory/threads/:id/clone | Mastra 1.45 | enforceThreadAccess on source + dest |

## Installed version matrix

core 1.58.0 (root override) | deployer 1.45.0 | server 1.45.0 | mastra CLI 1.15.0 | libsql 1.14.0 | memory 1.26.1 (packages/agent/node_modules) | ai-sdk 1.5.0 | auth-workos 1.6.0 (auth 1.1.0) | observability 1.16.6 | duckdb 1.5.0 | loggers 1.2.0 | client-js 1.26.0 (nested @mastra/core 1.45.0 — npm "invalid"). hono 4.13.12. Peer ranges on all @mastra/* accept core 1.58 (>=1.32–1.42 floors), so the set installs/builds; behavior validated only by the app's own HTTP tests.
