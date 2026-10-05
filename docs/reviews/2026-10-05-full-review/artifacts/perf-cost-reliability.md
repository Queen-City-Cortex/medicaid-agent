# Working artifact from the perf-cost-reliability reviewer

## A. Request-path ledger (web chat, as coded)

| # | Stage | Dependency | Calls per chat | Timeout | Retries | Cancelled on disconnect | In usage_events | User sees |
|---|---|---|---|---|---|---|---|---|
| 1 | Binding middleware | WorkOS JWKS (new jwks-rsa client per call) | 1 fetch | library default | none | no | n/a | nothing |
| 2 | Mastra route auth | JWKS fetch + WorkOS getUser | 2 | SDK default | none; failure = 401 | no | n/a | nothing |
| 3 | Body guard, rate limit | SQLite (app client) INSERT + DELETE | 2 statements | busy timeout 0 | none; 503 in prod | n/a | n/a | nothing |
| 4 | Identifier screen | CPU: 5 regexes over whole body (cap 2 MiB) | 1 | n/a | n/a | n/a | n/a | 422 on match |
| 5 | Thread ownership, memory recall | SQLite (Mastra client) | several reads | 5 s sync busy wait | Mastra 5x | no | n/a | nothing |
| 6 | Scope gate | gpt-5-mini generateObject | 1 | none | SDK default 2 | no | no | nothing; fails open |
| 7 | Injection detector | gpt-5-mini via Mastra agent | 1 (new message only) | none | Mastra/SDK default | no | no | nothing; fails open |
| 8 | Step 0 | main model, forced tool call | 1 | none | SDK default | yes | yes | tool chip |
| 9 | resolveAnswerFrame | Voyage x2-3; Neo4j about 30-36 statements per search over 7-8 sessions, then sequential hydration | 1 | Voyage 15 s; Neo4j 30 s server-side per statement | Voyage 1; Neo4j 0 (errors mostly become empty) | no | n/a | tool chip |
| 10 | Steps 1..n | main model + 9 tools | 2 in sample | none | SDK default | yes (model call) | yes | tool chips |
| 11 | Token limiter | CPU estimate each step | every step | n/a | n/a | n/a | n/a | nothing |
| 12 | Memory observer | gpt-5.4-mini (30k message-token threshold, async buffer every 20%) | 0-2 | not checked | not checked | not checked | no | nothing |
| 13 | Verifier | gpt-5.6-terra, 1-2 passes | 1.33 in sample | 30 s per pass | 0 | yes | no | 'verifying', then the whole answer |
| 14 | Persistence | SQLite upserts per step (savePerStep) | per step | 5 s sync | Mastra 5x | n/a | n/a | nothing |
| 15 | Usage row | SQLite INSERT + DELETE, fire and forget | 1, success only | busy timeout 0 | none | n/a | main agent only | nothing |

## B. Cost and latency per chat

Source: budget-ledger.json and sample-summary.json, six questions, fresh thread each, CLI path (no gates, no observer, server storage disabled), gpt-5.4 agent and gpt-5.6-terra verifier.

| Segment | Mean | Range |
|---|---|---|
| Step 0 forced call | 1.3 s, 2,427 in / 42 out | 1.0-2.2 s |
| Frame tool (2-3 searches + hydration) | 7.1 s | 3.9-10.8 s |
| Step 1 (one more tool call) | 1.3 s, 8.3k in | 0.9-1.7 s |
| Final generation | 7.2 s, 14.2k in / 692 out | 4.2-11.3 s |
| Verifier | 5.0 s, 9.2k in per pass | 1.9-10.4 s |
| Whole question | 25.1 s, $0.086 | 15.7-32.2 s, $0.030-$0.161 |

- Tokens per question: agent 25.0k in (35% cached) / 768 out; verifier 12.3k in (15% cached) / 481 out. Verifier is 37% of spend.
- Time to first visible prose is the whole pipeline: about 22 s in the sample plus the two web-only classifier calls and auth round trips. Until then the stream carries tool-call parts and one 'verifying' data part.
- Not measured anywhere: the two gates, the observer, and multi-turn context. With observational memory, earlier turns' tool results stay in context until about 30k message tokens are observed and observations can grow to 40k, so steady-state input per model call in a long thread is several times the fresh-thread figure. Treat $0.086 as a floor for web chats.
- Prompt cache: step-0 calls share only 1,408 tokens; step 1 shares 2,560 (instructions plus nine tools); step 2 reuses 5.6-7.7k when the cache is warm. Two back-to-back calls 1-2 s apart missed entirely. The date line at the top changes daily and is not the limiter; the limiters are the step-0 tool list, per-request system messages and the verifier's ordering.

## C. Idle RSS creep: what was tested and ranked suspects

Tested in scratch (macOS arm64, Node 26.9, repo binaries, no server, fetch disabled):
- Recovery-sweep statements exactly as written, at about 96 statements/s for 100 s (9,578 statements): RSS flat at 61 MB. The 60 s sweep and its timestamp-interpolated SQL are not the cause.
- LibSQLStore + app client + sweep + Memory with observational memory + Agent with processors + workflow + Mastra + startWorkers(): Mastra created no interval timers, native connections stayed at 2, RSS flat at 171.2 MB from 220 s to 480 s (a 0.45 MB/min creep would have added about 1.9 MB).
- PinoLogger uses an in-process pino-pretty stream, no worker thread.

Not a root cause; ranked by fit to 'RSS up, heap flat, external flat':
1. Un-closed libsql native connections (finding 12 reproduces the signature at 180 KB each). Experiment: log the open-fd count next to rss every minute in the real process; a rising count settles it.
2. The layers my harness left out: the bundled HTTP server, the two MastraAuthWorkos instances, Sentry wiring. Experiment: preload a 20-line probe (patched setInterval plus process.getActiveResourcesInfo() dump every minute) into `node index.mjs` and diff against the harness.
3. `mastra dev` machinery if the local reproduction used it (watcher, Studio, hourly provider-registry refresh in dev). Experiment: compare slope of `mastra dev` against `node .mastra/output/index.mjs`.
4. Allocator behaviour on Linux: run with MALLOC_ARENA_MAX=2, and compare AnonHugePages in /proc/PID/smaps_rollup ten minutes apart. The macOS reproduction argues against this unless it ran in Docker.
5. V8 memory outside heapUsed: log v8.getHeapStatistics() total_physical_size, malloced_memory and external_memory; if rss minus those is what grows, it is native.
6. neo4j-driver reconnect attempts if anything probes /readyz while Neo4j is absent: log driver creation in getDriver().
One discriminating capture: on macOS `vmmap --summary PID` twice ten minutes apart, on Linux smaps_rollup, and compare by region type.

## D. Other brief items

- SQLite: one file, WAL (set by the Mastra store), two clients. Mastra's client waits up to 5 s synchronously on a lock; the app client waits 0. Every call blocks the event loop for its duration. In-scope periodic writers: recovery sweep every 60 s, retention every 24 h and at each start.
- Neo4j driver: pool 100 (default), acquisition 30 s, connect 10 s, statement timeout 30 s server-side, no client read timeout, no liveness check, no retry. One search uses 7-8 connections, so about 12 concurrent searches fill the pool.
- Cold start: the top-level awaits are local (migrations, key read, store init); no network. The owner measured 7 s to first 200. The first chat after a wake also pays Neo4j connection setup for 7-8 sessions, the WorkOS fetches and a cold prompt cache. The authenticated /corpus-status call on page load wakes the service before the user finishes typing.
- Token limiter: tokenx estimate, every step, system messages always kept, newest-first best-fit. In the sample the largest request was 21k tokens, so it never engaged.
- Server-side maps and listeners in scope are bounded (retry timers per run, single-slot caches, unref'd intervals).
