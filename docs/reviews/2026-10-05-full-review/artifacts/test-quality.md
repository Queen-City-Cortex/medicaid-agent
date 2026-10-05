# Working artifact from the test-quality reviewer

## A. CI inventory (run 37246450460, main @ c48a9d4, 2026-10-05; `test` job 188 s)

| Step | Tests | Wall time |
| --- | --- | --- |
| contracts (vitest) | 4 in 1 file | 0.4 s |
| policy-corpus (vitest) | 319 in 29 files | 6.7 s |
| crawler (vitest) | 284 in 23 files | 6.9 s |
| web (vitest, jsdom) | 282 in 28 files | 16.4 s |
| agent (vitest) | 454 passed, 10 skipped, 57 files | 17.2 s |
| pipeline pytest (RUN_NEO4J_INTEGRATION=1, bolt 7687) | 724 passed, 24 skipped | 38.3 s |
| embedding plans (bolt 7688) | 21 | 5.5 s |
| Jev annotations (bolt 7689) | 3 | 2.1 s |
| ops: node:test + bash | 16 + 8 | ~2 s |
| ops: unittest x2, pytest | 10 + 3 + 17 | ~1.5 s |
| agent integration (bolt 7687) | 10 in 2 files | ~3 s |
| mocked e2e (separate job) | 39 Playwright + 11 node:test | 33 s + 32 s |

All JS steps ran in parallel under one 18 s turbo task. Typecheck of tests: 7 s. No coverage step. Last 40 runs: no reruns, 1 failure and 1 cancellation (same PR branch).

## B. What executes against a real Neo4j in CI

| Instance | Suite | Schema created | Notes |
| --- | --- | --- | --- |
| 7687 | pytest: test_identity_integration (2), test_resolver_integration (1), test_identity_read (1) | none | nodes seeded by raw Cypher |
| 7687 | agent integration (10) | two vector indexes only | nodes seeded by raw CREATE; createTool mocked; no fulltext index |
| 7688 | test_embedding_plan_integration (21) | planner's own | real CorpusGraphWriter.upsert_document_bundle; must start empty |
| 7689 | test_jev_integration (3) | ensure_schema() | only un-mocked ensure_schema call in any test |

No test writes with the Python loader and reads with the TypeScript corpus.

## C. Would-it-fail ledger

| Area | Plausible wrong implementation | Assertion that catches it | Result |
| --- | --- | --- | --- |
| Verifier pass predicate (run.ts:122-126) | drop `!majorRelevance`, `citationsComplete`, `unsupportedClaims.length`, `missingCitationClaims`, the marker regex, or `.trim()` on evidence | none | UNCAUGHT x6 |
| same | drop `verification.supported` | answer-release.test.ts:41-49 | caught |
| same | drop unknown-URL or unknown-quote terms | hallucination-verifier-guards.test.ts:243-273 | caught |
| same | release with no sources | answer-release.test.ts:56-59 | caught |
| Two-pass limit | allow a third pass | answer-release.test.ts:50-55 | caught |
| Correction | release a correction without rechecking its text | answer-release.test.ts:33-40 | caught |
| Stream gate | let draft text-delta through | answer-release.test.ts:65-79 | caught |
| Stream gate | drop finish fallback, reasoning filter, error scrub | none | UNCAUGHT x3 |
| guardMessage | skip the signature check | answer-release.test.ts:80-86, 102-112 | caught |
| guardMessage | sign text only, not the outcome | none (only text is tampered) | UNCAUGHT |
| trustedChatInput | trust client resource, assistant or data parts | answer-release.test.ts:21-32 | caught |
| trustedChatInput | take the first user message instead of the newest | none (single message) | UNCAUGHT |
| Chat thread ownership | skip owner check | chat-diagnostics-http.test.ts:63-73; chat-memory-http.test.ts:183-209 | caught |
| Chat PII block | delete chat-route.ts:33-40 | none | UNCAUGHT |
| Resource binding | trust client `user` or stale resource id | auth-middleware.test.ts:71-147 | caught |
| Gateway allow-list | allow /api/agents/* | execution-gateway.test.ts:107-120 | caught |
| Gateway | ignore HTTP method on a listed path | none | UNCAUGHT |
| Gateway | drop the NODE_ENV clause on allowStudio | none | UNCAUGHT |
| Memory routes (framework) | cross-user thread access after an upgrade | none (handlers stubbed) | UNCAUGHT |
| Rate limit | off-by-one at the limit | rate-limit/repository.test.ts:22-28 | caught |
| Rate limit | record denied attempts | repository.test.ts:84-93 | caught |
| Rate limit | fail open in production | middleware.test.ts:86-92 | caught |
| Research recovery | third recovery claim | recovery.test.ts:208-234 | caught |
| Research recovery | resume against a new corpus release | recovery.test.ts:166-207 | caught |
| Recovery errors | treat any 'checkpoint' message as terminal | recovery-errors.test.ts:5-12 | caught |
| Tool schemas | field missing from outputSchema, wrong runtime type | none (createTool mocked) | UNCAUGHT |
| Retrieval Cypher | typo in keyword, concept or fulltext query | none (stubs, catch-all) | UNCAUGHT |
| Graph loader | drop most sections of a real document | test_loader.py:76-93 assert only > 0 | UNCAUGHT |
| Graph writer | invalid Cypher in MERGE queries | embedding-plan integration executes them | caught (syntax level) |
| Release gates | NaN or missing metric passes | test_release.py:152-175, 234-242 | caught |
| Release smoke | accept withheld or source-only stream | release-smoke.test.mjs:18-26 | caught |

## D. Read-only probes (scripts kept in the scratch directory; real modules, no source modified)

### D1. Release decision, one failing condition at a time (probe-run.mts)

| Verdict | Outcome today |
| --- | --- |
| clean | passed, released |
| only a major relevance issue (supported true) | withheld |
| only relevant=false, no issues | withheld |
| only citationsComplete=false | withheld |
| only unsupportedClaims non-empty (supported true) | withheld |
| only missingCitationClaims non-empty | withheld |
| clean verdict, draft contains `[unverified: ...]` | withheld |
| clean verdict, evidence text is whitespace | withheld |

### D2. gateAnswerStream (probe-gate.mts)

| Input chunks | Output |
| --- | --- |
| draft text, then finish, no outcome | withheld status + fixed withheld text; no leak |
| draft text, stream ends without finish | only `start`; no withheld text emitted |
| reasoning-start/delta/end + message-metadata | all dropped; withheld text |
| error chunk carrying provider text | generic error text; withheld text |
| data-tripwire, finish | passed through; no withheld text |
| legacy data-verification-rewrite / -ok | dropped |
| two outcomes with different answers | first answer released, second ignored |
| tool-output-available, source-url, other data-* | passed through unchanged (by design) |

### D3. Deterministic validators (probe-validators.mts)

| Answer fragment | Result |
| --- | --- |
| `[x](https://example.gov/fabricated)` (control) | flagged |
| `[x](HTTPS://example.gov/fabricated)` | not examined |
| `Https://example.gov/fabricated` | not examined |
| `[x](//example.gov/fabricated)` | not examined |
| `[x](www.example.gov/fabricated)`, `[x](example.gov/fabricated)` | not examined |
| link with title, angle-bracket destination, HTML anchor | flagged |
| source text 'See https://example.gov/manual.' and answer links that URL | flagged (false positive) |
| retrieved URL whose path contains parentheses | flagged, truncated (false positive) |
| fabricated 67-char quotation in straight quotes (control) | flagged |
| same quotation preceded by `5"` | not examined |
| same in single quotes, guillemets, italics; 29-char quotation | not examined (by design) |
| verbatim quotation containing **bold** | flagged (false positive) |
| verbatim quotation with ellipsis | flagged |
| verbatim with NBSP or different case | accepted |

### D4. Real Mastra server adapter with the app's middleware (idor/idor-probe.mts; core 1.58.0, server and deployer 1.45.0)

| Request | Status | Leaks A's data |
| --- | --- | --- |
| A creates thread, reads thread, reads messages | 200 | (own data) |
| B GET thread / GET messages | 403 | no |
| B GET messages with `resourceId=user-A` | 403 | no |
| B list threads with forged resourceId, and with forged requestContext query | 200, empty list | no |
| B PATCH / clone / DELETE A's thread | 403 | no |
| anonymous GET messages, with and without studio header | 401 | no |
| B GET messages with studio header | 403 | no |
| B POST /api/agents/ncMedicaidAgent/generate | 404 | no |
| A reads thread afterwards | 200, unchanged | n/a |

## E. Skipped and conditional tests

- No it.only, it.todo, xit or xfail anywhere.
- Env-gated: agent tests/integration (2 describes, RUN_NEO4J_INTEGRATION); pipeline test_identity_integration, test_resolver_integration, test_identity_read:107 (RUN_NEO4J_INTEGRATION); test_embedding_plan_integration (RUN_EMBEDDING_INTEGRATION); test_jev_integration (RUN_NEO4J_INTEGRATION plus JEV_DISPOSABLE_NEO4J). All run in CI.
- Platform or tool: test_parse_converter.py:431 (Linux), test_jev_backup.py:81 (GNU tar), test_corpus_sync.py:13 (sqlite3 CLI); `npm run test:ops` needs flock (gotchas.md:181).
- Skip-instead-of-fail: test_loader.py:73 and test_ecfr_parser.py:16 (fixture missing), test_resolver_integration.py:75 (id collision), three e2e smoke specs (agent unreachable).
- CI result: 724 passed and 24 skipped in the main pytest step; the 24 are exactly the 21 + 3 that run in the dedicated steps.

## F. Tests of code with no production caller (hallucination-verifier.test.ts, 42 tests)

| Lines | Subject | Tests |
| --- | --- | --- |
| 573-648 | renderCorrectedAnswer | 11 |
| 760-815 | replaceFinalAnswerText | 3 |
| 735-743; guards 190-195 | pureMarkerFallback / substanceLossFallback options (always false in run.ts) | 2 |
| guards 95-101, 142, 166-186 | validatedAnswer / lostSubstance outputs (never read by run.ts) | parts of 4 |
| 525-558 | verifyAnswer mock-echo | 2 |
