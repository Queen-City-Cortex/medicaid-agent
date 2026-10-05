# Working artifact from the e2e reviewer

## A. Flow coverage inventory

`yes` = asserted; `weak` = touched but the assertion would not catch a break; `-` = none. The unit column means a jsdom test exists in packages/web/tests; it does not judge quality.

| User-visible flow | Mocked e2e (CI) | Local smoke (paid) | Prod smoke (paid) | Web unit |
|---|---|---|---|---|
| Landing, terms, privacy render logged out | yes | - | - | - |
| /chat redirects when logged out | weak (only "left localhost") | - | readiness mode, after logout | - |
| Hosted WorkOS login | - | yes (auth.setup) | yes | - |
| Sign-out | - | - | readiness mode only | yes |
| Token refresh / expired session | - | - | - | yes |
| Empty state, example cards | yes | - | - | yes |
| First message, answer renders | yes | weak | yes | yes |
| Second message in the same thread | - | - | - | - |
| Streaming states (indicator, narration, Stop, "Checking the answer…") | - (body delivered at once) | indicator only | - | yes |
| Tool trail, sources panel, citation footnote | yes | trail trigger only | panel + at least 1 step | yes |
| Verification passed / corrected / withheld / legacy history | yes | - | passed or corrected required | yes |
| Blocked message (tripwire) | yes | yes | - | yes |
| 429 rate limit, 413 payload | yes | opt-in (429) | - | yes |
| Agent nested errors 401/404/422/503 | - | - | - | - |
| Provider failure mid-run (error chunk after tools) | - | - | - | partial |
| Thread list, select, new | yes | - | yes | yes |
| Thread rename, duplicate, export, delete | - | - | - | yes (client mocked) |
| History restore after reload | idealised single-row fixtures | broken spec | yes (real) | yes |
| Feedback up / down / comment / clear / rehydrate | weak (visibility only) | - | readiness: up + delete on a restored message | yes |
| Re-run and answer versions | - | - | - | yes |
| Copy answer | - | - | - | yes |
| Deep research: plan, prune, approve, decline, cancel, recovery, report, error | - | one happy path | - | hook + report view |
| Corpus date in masthead, degraded-search banner | - | - | - | partial |
| First-visit disclaimer and dismissal | - | - | - | yes |
| Theme toggle and persistence | - | - | - | yes |
| Mobile layout (sidebar overlay, Enter inserts newline) | - | - | - | yes |
| 10,000-character limit and counter | - | - | - | yes |
| Accessibility scan, keyboard-only journey | - | - | - | - |
| Firefox / WebKit | - | - | - | - |
| /preview returns 404 in production | - | - | - | - |
| Scroll stability | yes (class selectors) | - | - | yes |

34 of the 63 `data-testid` values in packages/web/src (excluding /preview) are referenced by no e2e tier.

## B. Agent routes the web calls, against the mock

| Route (execution-gateway.ts:26-34) | Web caller | Mocked? |
|---|---|---|
| POST /chat | use-chat-thread.ts | yes |
| GET /feedback | use-feedback.ts | yes |
| POST /feedback | use-feedback.ts | yes |
| DELETE /feedback/:id | use-feedback.ts | yes |
| GET /api/memory/threads | ThreadSidebar.tsx | yes |
| POST /api/memory/threads | use-chat-thread.ts | yes |
| GET /api/memory/threads/:id/messages | use-chat-thread.ts, ThreadSidebar.tsx | yes |
| GET /corpus-status | use-corpus-status.ts | no (request goes to localhost:4111) |
| POST /research/runs | use-deep-research.ts | no |
| GET /research/runs/:id | use-deep-research.ts | no |
| POST /research/runs/:id/decision | use-deep-research.ts | no |
| POST /research/runs/:id/cancel | use-deep-research.ts | no |
| GET /api/memory/threads/:id | ThreadSidebar.tsx (export) | no |
| PATCH /api/memory/threads/:id | ThreadSidebar.tsx (rename) | no |
| DELETE /api/memory/threads/:id | ThreadSidebar.tsx | no |
| POST /api/memory/threads/:id/clone | ThreadSidebar.tsx | no |

## C. Wire protocol: real gated stream against the e2e builder

Offline reproduction: real Mastra agent loop, `handleChatStream` v6, `gateAnswerStream`, `installMemoryReleaseGate`, LibSQL temp file. The LLM was `MockLanguageModelV3` and the verifier's model call was replaced by a canned verdict, with emission code copied from processor.ts:64-92. Observational memory was off. Scenario: one tool call, then an answer.

| # | Real stream | `AISdkStreamBuilder` as specs use it |
|---|---|---|
| 1 | `start` {messageId} | `start` {messageId} |
| 2 | `start-step` | `start-step` |
| 3 | `tool-input-available` | `text-start` / `text-delta` "Let me look that up." / `text-end` (narration; the real gate strips it) |
| 4 | `tool-output-available` | `tool-input-available` |
| 5 | `finish-step` | `tool-output-available` |
| 6 | `start-step` | `text-start` / `text-delta` answer / `text-end` |
| 7 | `data-verification-status` {status: verifying} | `finish-step` |
| 8 | `data-verification-status` {status, passCount, confidence, severity, counts} | `data-verification-status` {status, passCount}, auto-injected by `finish()` |
| 9 | `text-start` / `text-delta` (whole released answer) / `text-end` | `finish` {finishReason: stop} |
| 10 | `finish-step` | |
| 11 | `finish` (no finishReason key) | |

Browser message parts after AI SDK `readUIMessageStream`:

- real: `step-start, tool-getSection, step-start, data-verification-status(verifying), data-verification-status(passed), text`
- mock: `step-start, text(narration), tool-getSection, text(answer), data-verification-status(passed)`

Other real shapes that no e2e fixture models:

| Case | Real stream | e2e mock |
|---|---|---|
| Input-guard tripwire | `data-tripwire` {reason, retry, metadata, processorId}, `finish` {other}. No `start`. Nothing is persisted for the turn. | `start`, `start-step`, `data-tripwire`, `finish('other')` |
| Provider failure in the synthesis step | `start`, `start-step`, tool in/out, `finish-step`, `start-step`, `error` {generic text}, `finish-step`, `data-verification-status` {withheld, unavailable}, text (withheld notice), `finish` | HTTP 500 JSON before any stream |
| Persisted assistant row (current code, OM off) | one row: `tool-invocation, step-start, text, data-verification-status`, with `content.metadata.answerRelease` | `text, tool-invocation, text, data-verification-status` in one row, or a plain string |
| Persisted turn, June production capture (OM on, before the gate) | four assistant rows; answer row timestamped first; `data-om-*` parts throughout | not modelled in e2e (the web unit test parse-message.test.ts does model it) |

The live assistant id equalled the persisted assistant id in the reproduction.

## D. Tier ledger: what runs, what it costs, what it leaves behind

| Tier | Target and auth | Paid calls per run | Data created | Cleanup | In CI |
|---|---|---|---|---|---|
| `mocked` (38 tests) | `next dev` + JWKS stub; minted cookie | none | none | n/a | yes |
| Helper tests (`scripts/tests/*.test.mjs`) | fake `.invalid` origin | none | temp files | yes | yes |
| `smoke` (5 tests, 1 opt-in) | local web + local agent; real hosted login | 2 full answers, 1 scope-gate call, 1 deep-research run (sized at 10-15x a chat answer by config.ts) | threads, messages, usage and rate-limit rows, one research run in the local DB | none | no |
| `design` (2 tests) | local web; real hosted login; backend mocked | none | PNGs in gitignored `design-shots/` | n/a | no |
| `smoke-production.mjs` | production web and agent; fresh hosted login with TEST_USER_* | 1 full answer (generation, 1-2 verifier passes, scope gate, injection detector, query embeddings) | 1 production thread with messages, usage and rate-limit rows; readiness mode also creates and deletes one feedback row | none in code; readiness receipt lists thread ids for manual cleanup | no |

What the production smoke proves: login works; one real question returns a passed or corrected answer of at least 200 characters with a sources panel and at least one tool step; the same text and outcome come back after a thread switch and after a reload. With `SMOKE_EXPECTED_RELEASE_ID`, it also proves /readyz reports that release before and after. It does not prove citations resolve, second turns work, deep research works, or anything outside desktop Chromium.

Secrets: credentials come from the environment or four local env files and are not printed. The screenshot goes to /tmp. The readiness receipt requires a 0700 directory and is written 0600. The activation receipt uses default permissions.

## E. Scratch scripts

All under `<review scratch directory, not kept>/e2e/`. No network, no servers.

| Script | What it showed |
|---|---|
| `first-turn-422.mts`, `followup-422.mts` | Real guard rejects 7 of 11 ordinary questions; a prior answer with a phone number or ZIP+4 blocks follow-ups; 1/50 and 0/50 recorded answers affected |
| `route-precedence.mts` | Spec override returns 429 JSON to a server-action POST; shared helper lets it through |
| `repro/real-vs-mock.mts` | Table C, persisted row shape, id equality |
| `repro/tripwire-and-error.mts` | Real tripwire and provider-failure shapes |
| `extract_report.py` | Today's local Playwright report: 39 passed, 0 flaky, 11.2 s |
