# Working artifact from the mastra-upstream reviewer

## A. Version inventory (npm registry, 2026-10-04)

| Package | Installed (published) | Latest (published) | Stable releases behind | How declared |
| --- | --- | --- | --- | --- |
| @mastra/core | 1.58.0 (2026-08-12) | 1.74.0 (2026-10-01) | 18 | exact, plus inert root override |
| @mastra/memory | 1.26.1 (2026-08-12) | 1.35.0 (2026-10-01) | 14 | exact |
| @mastra/observability | 1.16.6 (2026-08-12) | 1.18.3 (2026-10-01) | 14 | exact |
| @mastra/libsql | 1.14.0 (2026-06-19) | 1.25.0 (2026-10-01) | 26 | caret |
| @mastra/ai-sdk | 1.5.0 (2026-06-19) | 1.10.6 (2026-10-01) | 18 | caret |
| @mastra/duckdb | 1.5.0 (2026-06-19) | 1.12.1 (2026-10-01) | 15 | caret |
| @mastra/auth-workos | 1.6.0 (2026-06-19) | 1.6.6 (2026-09-29) | 6 | caret |
| @mastra/loggers | 1.2.0 (2026-06-19) | 1.3.4 (2026-10-01) | 5 | caret |
| mastra (CLI) | 1.15.0 (2026-06-19) | 1.32.1 (2026-10-01) | 33 | dev, caret |
| @mastra/deployer | 1.45.0 (2026-06-19) | 1.74.0 (2026-10-01) | 33 | transitive via CLI |
| @mastra/server | 1.45.0 (2026-06-19) | 1.74.0 (2026-10-01) | 33 | transitive via deployer |
| @mastra/client-js (web) | 1.26.0 | 1.51.2 | 33 | caret |
| ai | 6.0.209 | 7.0.127 | 270, including a major | caret |

Not installed: @mastra/evals 1.10.5, @mastra/hono 1.7.16, @mastra/otel-exporter 1.4.4, @mastra/langfuse 1.5.12, @mastra/braintrust 1.3.18, @mastra/sentry 1.2.23.

Cadence: core 1.0.0 shipped 2026-01-20; 87 stable 1.x releases across 74 minors by 2026-10-01, nine to fourteen a month. Release trains: core 1.72.0 with CLI 1.31.4 (2026-09-30), core 1.73.0 with CLI 1.32.0, core 1.74.0 with CLI 1.32.1 (both 2026-10-01).

## B. Probes (scratch directory only, mock models, no provider calls)

| Question | Installed set (core 1.58.0) | Latest set (core 1.74.0) |
| --- | --- | --- |
| What does a custom `processInput` receive on a follow-up turn? | history plus new message | same |
| Stream `start.messageId` vs stored answer id, default observational memory, 30,000-char tool result | differ (two stored assistant messages) | differ |
| Same with 20,000 chars | equal | not run |
| Id an output processor sees at the final step | equals stored answer id | equals stored answer id |
| Store methods called by `Memory.cloneThread` | cloneThread 1 | copyThread 1, listMessages 1, cloneThread 0 |
| Metadata-only patchThread racing a rename | rename lost | rename kept |
| One transient 503, `maxSteps: 1` | `generate()` rejects | resolves, text '', finishReason 'retry' |
| Persistent 503, budget 16 | 1 call, 1 reservation, rejects | 3 calls, 3 reservations, rejects |
| Budget already exhausted | rejects, message prefixed "Exhausted all fallback models. Last error:" | rejects, plain message |
| Next-step prompt after stripping reasoning parts | tool call keeps provider item id, no reasoning part | same |
| Stock routes reachable through the gateway | 7 of 351 | same 7 of 419 |
| PR #190 tree, npm 11.11.0 vs 11.19.1 resolver | one core 1.72.0 vs three cores | n/a |

## C. Custom code against what Mastra ships

| Custom code | Closest built-in | Verdict |
| --- | --- | --- |
| HallucinationVerifier plus release gates | Faithfulness and hallucination scorers (@mastra/evals) | Keep. Scorers are asynchronous, sampled and advisory; they take a static `context` array and cannot gate a response. A cheaper win than live scorers is persisting the verifier telemetry the app already computes. |
| ScopeGateProcessor | `ClassifierProcessor` (core 1.69.0, fails closed by default) | Optional after upgrade. The custom gate is 104 lines, has the Jev provider switch and reports to Sentry. |
| CoverageBoundaryProcessor, answer-frame processors | none | Keep; domain logic. |
| MessageLengthGuard | none (TokenLimiter trims, it does not reject) | Keep. |
| sensitive-data.ts regex at the route | `PIIDetector` (LLM call), `RegexFilterProcessor`, `UnicodeNormalizer` | Keep the route-level regex (it rejects before any model call); normalise input and widen separators. |
| OpenAIResponsesDedupProcessor | `ProviderHistoryCompat` and its `openai-orphan-item-id` rule (adjacent bug, not the same) | Keep until disproved by a recorded history. |
| Rate limit and usage tables | `TokenCostControl` (formerly CostGuardProcessor) | Keep. The built-in reads cost from the observability store, which is off in production, and calls itself best-effort. |
| chat-route.ts around `handleChatStream` | `chatRoute()` | Keep. The stock route cannot host the ownership check or the stream gate. |
| Resource-binding middleware | `mapUserToResourceId` | Partial. Keep the middleware; add the callback as a second layer. |
| Execution gateway | none | Keep; verified against 1.74.0. |
| Retention SQL on mastra_* tables | `storage.prune()`, `Memory.deleteThread` | Partial; see finding 7. |
| Research repository, leases, checkpoints | Workflow snapshots, `restart()`, durable agents | Keep the app's; drop or slim the Mastra half (finding 10). |
| DuckDB trace store | OTel, Langfuse, Braintrust, LangSmith, Datadog exporters | Adopt one in production after observability 1.17.6 (finding 8). |
| Python evaluation harness | `runEvals` with gates and thresholds, `@mastra/evals/checks` | Complement only: trajectory gates such as `checks.calledTool('getSection')` and `checks.noToolErrors()` are cheap additions; the Python harness stays the system of record. |

## D. Upstream changes after 1.58.0 that touch the release and recovery guards

| Version | Change (primary source: package CHANGELOG.md in mastra-ai/mastra) | Effect here |
| --- | --- | --- |
| core 1.59.0 | Output processors run again on failed streams (#21370) | On 1.58.0 a provider error skips the verifier; the stream gate and storage gate still fail closed. |
| core 1.60.0 | Output processors no longer miss response messages after a mid-run save (#21533) | Relevant to `savePerStep: true`; covered by chat-memory-http.test.ts on 1.58.0. |
| core 1.61.0 | Atomic resume claims (#21725) | App leases already prevent double resume. |
| core 1.67.0, memory 1.30.0, libsql 1.23.0 | `copyThread()` (#23567) | Gate's clone wrapper bypassed (finding 6). |
| core 1.68.0 | Completed workflow runs no longer stay in memory after resume (#24267) | The research happy path leaks one run per completion on 1.58.0. |
| core 1.70.0 | TokenLimiter enforces its budget on the provider prompt; stored messages no longer changed (#24679) | Semantics of the 128k limiter change; re-check evidence visibility. |
| core 1.71.0 | Tools start as soon as their arguments are complete (#25005) | The paid web-search tool can fire for a step that later errors and is retried. |
| core 1.73.0 | Three error processors on by default (#24473) | Finding 4. |
| core 1.73.0 | `run.cancel()` no longer overwrites a finished run's status (#25628) | Benign for service.ts cancel paths. |
| memory 1.31.0, 1.32.0 | Observational memory fixes: `Turn already ended` in multi-step loops, observer recording its own instructions as user statements, deleted threads leaving records | 51 of 76 distinct memory changelog entries in the window concern observational memory. |
| libsql 1.20.0 | Partial thread updates (#21257) | Finding 9. |
| ai-sdk 1.5.1 | Error responses no longer leak the system prompt (#18335) | Already mitigated by the stream gate. |
| ai-sdk 1.9.0 | `version: 'v7'` (#21720) | Prerequisite for issue #145. |
| observability 1.17.6 | SensitiveDataFilter redacts span request context | Finding 8. |
| server 1.64.0, 1.65.0 | Startup warning without `mapUserToResourceId`; invalid mapper output fails closed | Add the mapper. |
| deployer 1.58.0, 1.60.0, 1.67.0 | Output manifest keeps declared ranges; app-directory lookup; `MASTRA_BUILD_SKIP_INSTALL` | Finding 1. |

Only two entries in core 1.59 to 1.74 are labelled breaking (Agent Controller stream events in 1.68.0, `subscribeQueuedMessages` in 1.67.0); neither is used here. The changes that matter are default flips.

## E. Upgrade plan, ranked by risk

1. Now, no behaviour change: remove the inert override; pin every @mastra/*, `mastra`, ai and @ai-sdk/* dependency exactly; add @mastra/deployer and @mastra/server as explicit pins; add the lockfile guard; one Dependabot group; close #164 and #190.
2. Low risk, independent: @mastra/libsql 1.14.0 to 1.20.0 (fixes the title race; peer core >= 1.51.0; own `cloneThread` retained). Qualify with the real-storage HTTP test and the live observational-memory smoke.
3. App-side fixes that no upgrade provides and that make upgrades safe: gate decorator with a surface check including `copyThread`; persisted message id in the verification part; validate research agent results before checkpointing; observational-memory rows in retention; one contract test that boots the real server (`createHonoServer` from @mastra/deployer/server, or @mastra/hono) with the app's middleware and asserts forged context is dropped, only allowlisted routes answer and history is guarded.
4. Medium risk: the 2026-09-30 train in one PR (core, deployer, server 1.72.0; memory 1.33.0; libsql 1.24.0; ai-sdk 1.10.5; observability 1.18.2; auth-workos 1.6.6; duckdb 1.12.0; loggers 1.3.3; CLI 1.31.4). Step 1 must land first because deployer >= 1.58 writes declared ranges into the image manifest. Stopping at 1.72 stays below the default error processors.
5. Core 1.73 or later: `errorProcessorDefaults: false` on the research agents, a decision on the chat agent (the defaults probably help it), `errorStrategy` on the injection detector, `allowUnclaimedResumes` if snapshots are restricted. Re-run the probes in section B.
6. AI SDK 7 (issue #145): no longer blocked by Mastra's model type; needs ai-sdk >= 1.10.5 with `version: 'v7'`, the v4 providers and the web client. Detail belongs to the ai-sdk-providers scope.

Gate for every step: agent tests, build, Docker build, boot the built image, the contract test, the probes, then the owner-run live smoke.

## F. Is Mastra still a sound foundation?

Yes, for now, with a smaller footprint and with upgrade discipline. The reasons are specific to this codebase.

- The product's guarantees do not live in Mastra. Release, verification, quotas, retention, research durability, route exposure and identity binding are app-owned, and the probes show the first, fourth and fifth of those surviving the jump to 1.74.0.
- The cost so far has been coordination, not capability. Every Mastra incident on record here (patchThread, PR #164's logger import, the override that does nothing) is a version-coherence failure. Findings 1 to 3 remove that class in days.
- The project is healthy but moves fast and does not signal behaviour changes through semver: 28.5k stars, 302 open issues, about ten core releases a month, Apache-2.0 outside the `ee/` directories (RBAC, FGA, SSO are enterprise-licensed; this app uses only the Apache-licensed `authenticateToken` path). Default flips such as 1.71.0 and 1.73.0 arrive in minors. Budget for a monthly upgrade train with the contract test and probes, not weekly Dependabot merges.
- Shrink the surface that needs guarding. Deep research does not need Mastra workflows. Observational memory is the fastest-churning and most guard-intensive feature in use; with 6,000-character section caps and re-retrieval on every turn, a bounded history window plus `ToolCallFilter` is a credible replacement and would remove three of the nine patched methods. `mastra build` is the least defensible piece (finding 1).

Alternatives. Calling the AI SDK directly (`streamText` with `prepareStep`, an app-owned Hono server, the existing SQLite tables) is the realistic exit: the verifier, scope gate and stream gate are already written against AI SDK types. It means rebuilding thread persistence, seven memory endpoints and the tool loop glue, a matter of weeks, and it does not escape churn (the `ai` package shipped 270 releases and a major in the same window). LangGraph.js or the OpenAI Agents SDK would be rewrites without a matching benefit. I would set exit criteria rather than migrate now: another runtime-contract outage after the pins and guard are in place, or AI SDK 7 remaining blocked on Mastra for more than a quarter.

## G. Primary sources

npm registry (`npm view`, publish times, peer ranges, tarballs) on 2026-10-04. CHANGELOG.md for packages/core, packages/memory, stores/libsql, client-sdks/ai-sdk, observability/mastra, packages/server, packages/deployer, packages/cli, packages/loggers and auth/workos in github.com/mastra-ai/mastra, fetched with gh. Installed package sources and the 432 documentation pages bundled in node_modules/@mastra/core/dist/docs/references (vendor-published, matching the installed version). GitHub API for repository statistics. gh run and pr logs for this repository's PRs #164 and #190 and main run 37246450460.
