# Working artifact from the mutation-probe reviewer

# Mutation probe: method, mutant table, proofs

## Method

- Sandbox: `<review scratch directory, not kept>/mutation-probe/sandbox`, holding the 252 tracked files of packages/agent, packages/policy-corpus and packages/contracts plus the root package.json and tsconfig.json. Root node_modules is a symlink. Each package's node_modules is a real directory of per-entry symlinks, so vitest's `node_modules/.vite` cache was written in the sandbox and not in the repo.
- Runner: Node 22.23.2, `node <repo>/node_modules/vitest/vitest.mjs run --no-file-parallelism --reporter=json <files>` from the sandbox package directory. Environment reduced to PATH, HOME, TMPDIR (scratch), LANG, CI=1, NO_COLOR=1 and NEO4J_URI=bolt://127.0.0.1:1. No provider keys and no .env file exist in the sandbox.
- Unmutated reference: agent 27 files 279/279; policy-corpus 24 files 212/212; aliased cross-package set 29 files 246/246.
- Per mutant: assert the sandbox file equals the repo file; assert the target text occurs exactly once; apply; run every non-integration test file that transitively imports the mutated file (section C); for a policy-corpus survivor also run TX; restore from the repo and compare bytes.
- Canaries: M00 (gateway rejects every owned route) was killed with 17 failing tests. An alias canary (amendments.ts authoritative id replaced) failed 2 of 4 agent navigate tests with the alias and 0 of 4 without it, proving TX executes the sandbox copy of policy-corpus.
- Predictions were recorded before any run (K should die, S may survive, ? unsure): 9 K, 18 S, 3 ?. Outcome: all 9 K killed; all 18 S and all 3 ? survived.
- Sandbox-only probe tests (section D) were added after the 30 runs and are excluded from every measured suite.
- After the probe: `git status` clean; the repo's vitest result caches still carry their 21:17 timestamps from before the probe started.

## A. Pre-registered mutants: 9 killed / 30 (30%)

| ID | Source line | What the mutant does | Before → after | Verdict | Tests run (passed/total) | Killed by (failing tests) |
|---|---|---|---|---|---|---|
| M01 | `agent/src/processors/verifier/run.ts:122` | release gate ignores verification.supported | `const clean = verification.supported && !majorRelevance && verification.citationsComplete` → `const clean = !majorRelevance && verification.citationsComplete` | **KILLED** | T2 128/134 | answer-release-mastra, answer-release, chat-memory-http (6) |
| M02 | `agent/src/processors/verifier/run.ts:120` | an explicit major relevance issue no longer counts as major | `const majorRelevance = verification.relevanceIssues?.some(i => i.severity === 'major') [newline] \|\| (!verification.relevant` → `const majorRelevance = (!verification.relevant` | **SURVIVED** | T2 134/134 | none |
| M03 | `agent/src/processors/verifier/run.ts:123` | release gate ignores listed unsupported claims | `&& verification.unsupportedClaims.length === 0 && (verification.missingCitationClaims?.length ?? 0) === 0` → `&& (verification.missingCitationClaims?.length ?? 0) === 0` | **SURVIVED** | T2 134/134 | none |
| M04 | `agent/src/processors/verifier/run.ts:126` | release no longer requires any retrieved evidence | `if (clean && candidate.trim() && sources.some(s => s.text.trim())) {` → `if (clean && candidate.trim()) {` | **KILLED** | T2 132/134 | answer-release, chat-memory-http (2) |
| M05 | `agent/src/processors/verifier/run.ts:167` | every verifier outage is reported retryable | `return { retryable: unavailable && verification.failureRetryable === true, finalAnswer` → `return { retryable: unavailable, finalAnswer` | **SURVIVED** | T2 134/134 | none |
| M06 | `agent/src/processors/verifier/verify.ts:97` | 30 s deadline dropped when the caller supplies an abort signal | `abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),` → `abortSignal: signal ? signal : AbortSignal.timeout(30_000),` | **SURVIVED** | T3 138/138 | none |
| M07 | `agent/src/processors/verifier/verify.ts:98` | provider retries re-enabled | `maxRetries: 0,` → `maxRetries: 2,` | **KILLED** (incidental, see note) | T3 137/138 | processors/verifier-timeout (1) |
| M08 | `agent/src/processors/verifier/processor.ts:86` | release is applied to the first assistant message instead of the last | `const last = messages.reduce((last, m, i) => m.role === 'assistant' ? i : last, -1);` → `const last = messages.reduceRight((last, m, i) => m.role === 'assistant' ? i : last, -1);` | **SURVIVED** | T4 105/105 | none |
| M09 | `agent/src/processors/verifier/processor.ts:88` | terminal verification part carries the raw draft instead of the released text | `data: { ...outcome, answer: finalAnswer,` → `data: { ...outcome, answer: text,` | **KILLED** | T4 103/105 | answer-release-mastra, chat-memory-http (2) |
| M10 | `agent/src/answer-release.ts:11` | signature binds only outcome.status | `update(JSON.stringify([text, outcome])).digest('hex')` → `update(JSON.stringify([text, outcome.status])).digest('hex')` | **SURVIVED** | T5 116/116 | none |
| M11 | `agent/src/answer-release.ts:11` | signature no longer binds the answer text | `update(JSON.stringify([text, outcome])).digest('hex')` → `update(JSON.stringify([outcome])).digest('hex')` | **KILLED** | T5 115/116 | answer-release (1) |
| M12 | `agent/src/answer-release.ts:70` | memory writes are no longer guarded | `memory.saveMessages = args => save({ ...args, messages: args.messages.map(guardMessage) });` → `memory.saveMessages = args => save({ ...args, messages: args.messages });` | **SURVIVED** | T5 116/116 | none |
| M13 | `agent/src/answer-release.ts:118` | stream gate lets model reasoning chunks through | `if (part.type.startsWith('text-') \|\| part.type.startsWith('reasoning-') \|\| part.type === 'message-metadata'` → `if (part.type.startsWith('text-') \|\| part.type === 'message-metadata'` | **SURVIVED** | T5 116/116 | none |
| M14 | `agent/src/chat-route.ts:58` | foreign-thread ownership check never fires | `if (thread && thread.resourceId !== userId) {` → `if (thread && thread.resourceId !== userId && !userId) {` | **KILLED** | T6 12/15 | chat-diagnostics-http, chat-memory-http (3) |
| M15 | `agent/src/chat-route.ts:33` | client-identifier rejection never fires on /chat | `if (findSensitiveIdentifiers(extractText(body)).length) {` → `if (findSensitiveIdentifiers(extractText(body)).length < 0) {` | **SURVIVED** | T6 15/15 | none |
| M16 | `agent/src/auth-middleware.ts:66` | a failed token no longer clears a pre-existing resource id | `if (rc?.set) {` → `if (rc?.set && userId) {` | **KILLED** | T7 63/66 | auth-middleware (3) |
| M17 | `agent/src/execution-gateway.ts:67` | Studio bypass no longer requires a non-production NODE_ENV | `if (options.allowStudio && process.env.NODE_ENV !== 'production') {` → `if (options.allowStudio) {` | **SURVIVED** | T1 36/36 | none |
| M18 | `agent/src/execution-gateway.ts:32` | thread rule matches any sub-path | `rule(['GET', 'PATCH', 'DELETE'], /^\/api\/memory\/threads\/[^/]+$/),` → `rule(['GET', 'PATCH', 'DELETE'], /^\/api\/memory\/threads\/.+$/),` | **SURVIVED** | T1 36/36 | none |
| M19 | `agent/src/rate-limit/repository.ts:74` | window allows limit + 1 events | `'(SELECT COUNT(*) FROM rate_limit_events WHERE user_id = ? AND created_at > ?) < ?'` → `'(SELECT COUNT(*) FROM rate_limit_events WHERE user_id = ? AND created_at > ?) <= ?'` | **KILLED** | T8 48/55 | rate-limit/middleware, rate-limit/repository (7) |
| M20 | `agent/src/rate-limit/repository.ts:12` | daily window is 12 h instead of 24 h | `const DAY_MS = 24 * HOUR_MS;` → `const DAY_MS = 12 * HOUR_MS;` | **SURVIVED** | T8 55/55 | none |
| M21 | `agent/src/deep-research/service.ts:231` | decide() loads the run without the owner predicate | `const owned = await this.repository.get(runId, resourceId);` → `const owned = await this.repository.getInternal(runId);` | **SURVIVED** | T9 24/24 | none |
| M22 | `agent/src/deep-research/repository.ts:417` | failOrRetry allows a third recovery | `WHERE id = ? AND lease_owner = ? AND lease_expires_at > ? AND recovery_count < 2` → `WHERE id = ? AND lease_owner = ? AND lease_expires_at > ? AND recovery_count < 3` | **KILLED** | T10 39/40 | deep-research/recovery (1) |
| M23 | `agent/src/deep-research/repository.ts:384` | saveCheckpoint accepts writes from any lease owner | `SELECT id, ?, ?, 1 FROM research_runs WHERE id = ? AND lease_owner = ? AND lease_expires_at > ?` → `SELECT id, ?, ?, 1 FROM research_runs WHERE id = ? AND (lease_owner = ? OR 1 = 1) AND lease_expires_at > ?` | **SURVIVED** | T10 40/40 | none |
| M24 | `agent/src/storage/app-database.ts:280` | account deletion skips observational memory (table-name typo) | `if (await this.hasTable('mastra_observational_memory')) {` → `if (await this.hasTable('mastra_observational_memories')) {` | **SURVIVED** | T11 162/162 | none |
| M25 | `agent/src/storage/app-database.ts:197` | conversation retention treats days as hours | `const conversationCutoff = new Date(now - policy.conversationsDays * 86_400_000).toISOString();` → `const conversationCutoff = new Date(now - policy.conversationsDays * 3_600_000).toISOString();` | **SURVIVED** | T11 162/162 | none |
| M26 | `agent/src/storage/app-database.ts:209` | retention never deletes workflow snapshots (table-name typo, runRetention occurrence) | `if (await this.hasTable('mastra_workflow_snapshot')) {` → `if (await this.hasTable('mastra_workflow_snapshots')) {` | **SURVIVED** | T11 162/162 | none |
| M27 | `policy-corpus/src/retrieval/collector.ts:178` | fulltext-only hits inserted at the top score instead of mid-range | `const minScore = scores.length > 0 ? Math.min(...scores) : 0.5;` → `const minScore = scores.length > 0 ? Math.max(...scores) : 0.5;` | **SURVIVED** | T12 73/73; TX 246/246 | none |
| M28 | `policy-corpus/src/internal/rerank.ts:492` | latest-change queries boost undated "effective" sections | `return score - LATEST_CHANGE_QUERY_EFFECTIVE_SECTION_PENALTY;` → `return score + LATEST_CHANGE_QUERY_EFFECTIVE_SECTION_PENALTY;` | **SURVIVED** | T13 212/212; TX 246/246 | none |
| M29 | `policy-corpus/src/primitives/amendments.ts:30` | undated amendments sort first again | `ORDER BY amend.effective_date IS NULL, amend.effective_date DESC, amend.id ASC` → `ORDER BY amend.effective_date DESC, amend.id ASC` | **SURVIVED** | T14 63/63; TX 246/246 | none |
| M30 | `policy-corpus/src/primitives/amendments.ts:36` | OPTIONAL MATCH null row is no longer filtered out | `.filter((record) => record.get('id') != null)` → (line deleted) | **SURVIVED** | T14 63/63; TX 246/246 | none |

Note on M07: the test asserts `maxRetries` inside the generateObject mock; verifyAnswer's catch swallows the assertion error and the test fails only because that error message is not classified as retryable. X01 below shows the same assertion passing for a different wrong value.

## B. Follow-up diagnostics: 6 killed / 14

Run after A to answer specific questions (the full release predicate, the stream gate when verification does not complete, and the two brief topics the 30 did not touch: evidence matching and thresholds). Not in the headline rate.

| ID | Source line | What the mutant does | Before → after | Verdict | Tests run (passed/total) | Killed by (failing tests) |
|---|---|---|---|---|---|---|
| X01 | `agent/src/processors/verifier/verify.ts:98` | maxRetries set to a value whose assertion message looks retryable | `maxRetries: 0,` → `maxRetries: 503,` | **SURVIVED** | T3 138/138 | none |
| X02 | `agent/src/processors/verifier/run.ts:122` | release gate ignores citationsComplete | `&& !majorRelevance && verification.citationsComplete` → `&& !majorRelevance` | **SURVIVED** | T2 134/134 | none |
| X03 | `agent/src/processors/verifier/run.ts:123` | release gate ignores listed missing-citation claims | `&& verification.unsupportedClaims.length === 0 && (verification.missingCitationClaims?.length ?? 0) === 0` → `&& verification.unsupportedClaims.length === 0` | **SURVIVED** | T2 134/134 | none |
| X04 | `agent/src/processors/verifier/run.ts:120` | relevant=false with no listed issue no longer counts as major | `const majorRelevance = verification.relevanceIssues?.some(i => i.severity === 'major') [newline] \|\| (!verification.relevant && !verification.relevanceIssues?.some(i => i.severity === 'minor'));` → `const majorRelevance = verification.relevanceIssues?.some(i => i.severity === 'major');` | **SURVIVED** | T2 134/134 | none |
| X05 | `agent/src/processors/verifier/run.ts:124` | release gate ignores unknown URLs | `&& urls.unknownUrls.length === 0 && quotes.unknownQuotes.length === 0` → `&& quotes.unknownQuotes.length === 0` | **KILLED** | T2 133/134 | processors/hallucination-verifier-guards (1) |
| X06 | `agent/src/processors/verifier/run.ts:124` | release gate ignores unknown quotations | `&& urls.unknownUrls.length === 0 && quotes.unknownQuotes.length === 0` → `&& urls.unknownUrls.length === 0` | **KILLED** | T2 132/134 | processors/hallucination-verifier-guards (2) |
| X07 | `agent/src/processors/verifier/run.ts:125` | release gate ignores leftover verifier markers in the candidate | `&& !/\[(?:unverified\|wrong source\|missing citation):/i.test(candidate);` → `;` | **SURVIVED** | T2 134/134 | none |
| X08 | `agent/src/answer-release.ts:120` | no withheld fallback when a run finishes without a release | `if (part.type === 'finish' && !released && !blocked) {` → `if (part.type === 'finish' && !released && !blocked && part.type !== 'finish') {` | **SURVIVED** | T5 116/116 | none |
| X09 | `agent/src/answer-release.ts:127` | stream gate forwards raw error text to the client | `controller.enqueue(part.type === 'error' ? { type: 'error', errorText: 'The answer could not be completed. Please try again.' } : part);` → `controller.enqueue(part);` | **SURVIVED** | T5 116/116 | none |
| X10 | `agent/src/processors/verifier/answer-validation.ts:244` | routing-hint frame text counts as quotation evidence | `.filter(source => source.toolName !== 'resolveAnswerFrame')` → (line deleted) | **KILLED** | T15 142/143 | processors/verification-surface-guards (1) |
| X11 | `agent/src/processors/verifier/answer-validation.ts:138` | URL matching ignores the query string | `${pathname}${parsed.search}` → `${pathname}` (inside the normalizeUrl template literal) | **KILLED** | T15 142/143 | processors/hallucination-verifier-guards (1) |
| X12 | `agent/src/processors/verifier/answer-validation.ts:216` | quotation check threshold doubled | `const QUOTE_MIN_LENGTH = 30;` → `const QUOTE_MIN_LENGTH = 60;` | **KILLED** | T15 141/143 | processors/verification-surface-guards (2) |
| X13 | `agent/src/processors/verifier/confidence.ts:75` | "high" confidence threshold becomes exclusive | `if (confidence >= 0.85) severity = 'high';` → `if (confidence > 0.85) severity = 'high';` | **KILLED** | T16 133/134 | processors/hallucination-verifier (1) |
| X14 | `agent/src/processors/verifier/evidence.ts:330` | supporting frame sections are no longer extracted as corpus evidence | `return [...frame.primarySections, ...frame.supportingSections,` → `return [...frame.primarySections,` | **SURVIVED** | T17 143/143 | none |

## C. Test sets

Every non-integration test file (under `tests/`, names without `.test.ts`) that transitively imports the mutated source, from a static import graph. The sets include files that mock the module (for example cli-verification mocks run.js).

- **T1** agent execution-gateway.ts, 2 files: auth-middleware, execution-gateway
- **T2** agent verifier/run.ts (and **T16** verifier/confidence.ts), 11 files: answer-release-mastra, answer-release, chat-diagnostics-http, chat-memory-http, cli-verification, deep-research/recovery, processors/coverage-boundary, processors/evidence-tool-results, processors/hallucination-verifier-guards, processors/hallucination-verifier, processors/verifier/diagnostics
- **T3** agent verifier/verify.ts, 13 files: T2 plus processors/verifier-timeout, processors/verifier/verify
- **T4** agent verifier/processor.ts, 7 files: answer-release-mastra, chat-diagnostics-http, chat-memory-http, deep-research/recovery, processors/evidence-tool-results, processors/hallucination-verifier-guards, processors/hallucination-verifier
- **T5** agent answer-release.ts, 8 files: T4 plus answer-release
- **T6** agent chat-route.ts, 2 files: chat-diagnostics-http, chat-memory-http
- **T7** agent auth-middleware.ts, 6 files: auth-middleware, chat-diagnostics-http, chat-memory-http, deep-research/routes, execution-gateway, rate-limit/middleware
- **T8** agent rate-limit/repository.ts, 4 files: auth-middleware, execution-gateway, rate-limit/middleware, rate-limit/repository
- **T9** agent deep-research/service.ts, 3 files: deep-research/recovery, deep-research/routes, deep-research/service
- **T10** agent deep-research/repository.ts, 4 files: T9 plus deep-research/repository
- **T11** agent storage/app-database.ts, 15 files: auth-middleware, chat-diagnostics-http, chat-memory-http, deep-research/recovery, deep-research/repository, deep-research/routes, deep-research/service, execution-gateway, feedback/repository, feedback/routes, rate-limit/middleware, rate-limit/repository, readiness, storage/app-database, usage/repository
- **T12** policy-corpus retrieval/collector.ts, 9 files: amendments, frames-coverage-routing, frames-coverage, frames-federal, frames-variant-priorauth, primitives, retrieval/collector, search-ranking, search
- **T13** policy-corpus internal/rerank.ts, 24 files: T12 plus answer-scope, coverage-document-profiles, coverage-rebalance, coverage-support, evidence-plan, federal-authority-signals, frame/coverage-sections/scoring, frame/finalize, frame/rebalance/federal-authority, internal/cfr-tiebreaker, jev/roles, policy-lookup, query-analysis, retrieval-profile, retrieval-ranking
- **T14** policy-corpus primitives/amendments.ts, 8 files: T12 without retrieval/collector
- **T15** agent verifier/answer-validation.ts (and **T17** verifier/evidence.ts), 13 files: T2 plus processors/verification-surface-guards, processors/verifier-frame-evidence
- **TX** 29 agent test files that execute policy-corpus code, run with `@nc-medicaid/policy-corpus` aliased to the sandbox copy: answer-release-mastra, answer-release, chat-diagnostics-http, chat-memory-http, cli-verification, corpus-status, deep-research/recovery, deep-research/routes, deep-research/service, policy-corpus-embed, policy-corpus, processors/answer-frame-planning, processors/coverage-boundary, processors/evidence-tool-results, processors/hallucination-verifier-guards, processors/hallucination-verifier, processors/scope-gate, processors/verification-surface-guards, processors/verifier-frame-evidence, processors/verifier/diagnostics, readiness, retrieval-cli-runner, runtime-config, tools/answer-frame, tools/concepts, tools/lookup, tools/navigate, tools/read, tools/search

## D. Non-equivalence proofs (ready-made tests)

Each probe is a vitest file in the sandbox at `sandbox/packages/agent/tests/_probe/` (policy-corpus: `sandbox/packages/policy-corpus/tests/_probe/`). Each passes on the unmodified code and fails on the mutants listed, one failing case per mutant unless noted. They can be ported into the real test tree as the fix for the corresponding finding.

| Probe file | On real code | Fails on |
|---|---|---|
| verifier-gate.probe.test.ts | 3/3 | M02, M03, M05 |
| verifier-gate-matrix.probe.test.ts | 4/4 | X02, X03, X04, X07 |
| verify-deadline.probe.test.ts | 1/1 | M06 |
| two-turn-history.probe.test.ts (real Mastra agent and LibSQL memory, two turns, different answers) | 1/1 | M08 |
| release.probe.test.ts | 3/3 | M10, M12, M13 |
| stream-gate.probe.test.ts | 2/2 | X08, X09 |
| chat-phi.probe.test.ts | 1/1 | M15 |
| gateway.probe.test.ts | 4/4 | M17 (1 case), M18 (3 cases) |
| rate-day.probe.test.ts | 1/1 | M20 |
| research.probe.test.ts | 2/2 | M21, M23 |
| storage.probe.test.ts (real @mastra/libsql schema) | 4/4 | M24, M25, M26 |
| diagnostics.probe.test.ts | 2/2 | X01, X14 |
| corpus.probe.test.ts (policy-corpus) | 4/4 | M27, M28, M29, M30 |
| om-reuse.probe.test.ts (observation for finding 4, not a mutant) | 2/2 | after runRetention: summary row left, present in a second user's model prompt; after Memory.deleteThread: no row, not present |

## E. Release predicate matrix (run.ts:120-126)

| Guard | Mutant | Verdict |
|---|---|---|
| verification.supported | M01 | killed |
| explicit major relevance issue | M02 | survived |
| relevant=false with no minor issue | X04 | survived |
| citationsComplete | X02 | survived |
| unsupportedClaims is empty | M03 | survived |
| missingCitationClaims is empty | X03 | survived |
| no unknown URLs | X05 | killed |
| no unknown quotations | X06 | killed |
| no leftover verifier marker in the candidate | X07 | survived |
| at least one evidence entry | M04 | killed |
