# Working artifact from the security-appsec reviewer

## Memory-route authorization matrix (verified offline against real @mastra routes + app middleware)

| Route (allowlisted in execution-gateway.ts) | Ownership enforced? | Result |
|---|---|---|
| GET /api/memory/threads/:id | yes (enforceThreadAccess w/ fetched thread) | 403 cross-user (correct) |
| GET /api/memory/threads/:id/messages (with agentId) | yes; recall drops client include | correct |
| GET /api/memory/threads/:id/messages (no agentId, include=) | NO on included ids | **H1 leak** |
| POST /api/memory/threads/:id/clone | yes | 403 cross-user (correct) |
| DELETE /api/memory/threads/:id | yes | 403 cross-user (correct) |
| PATCH /api/memory/threads/:id | yes | correct |
| POST /api/memory/threads {threadId} | NO existence/owner check -> INSERT OR REPLACE | **C1 takeover** |

PoC output (poc-memory-idor.mts, no network, mock models never invoked):
```
B reads A thread (expect 403): 403
B lists A messages (expect 403): 403
B clones A thread (expect 403): 403
B include= leaked texts: ["user_A:user:SECRET_QUESTION: ...","user_A:assistant:SECRET_VERIFIED_ANSWER for user_A"]
B include= WITH agentId (recall path) message count: 0
B re-creates A thread id: status 200, returned owner "user_B"
stored owner after takeover: "user_B"
A reads own thread after takeover: 403   | A thread list after takeover: []
B clones hijacked thread: leaked A's user+assistant texts
B deletes hijacked thread: 204 | A messages remaining in store: 0
```

## Request middleware order (deployer createHonoServer)
1. registerContextMiddleware (parses body JSON — M5/body-DoS) [index.js:4174]
2. setupBrowserStream routes + /health (pre-gateway — M2) [4181, 4217]
3. server.middleware: bindResource -> executionGateway -> bodySizeGuard -> rateLimit [4247]
4. per-route checkRouteAuth (route-level WorkOS getUser — M4)
