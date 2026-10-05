# Tests and quality gates: all issues

The suites are fast and stable: about 1,340 JavaScript and 724 Python tests run in under a minute. The answer-release path is tested through a real Mastra agent, memory and SQLite, and sentinel strings show that no draft leaks. Tests are weak wherever a fake stands in for the real thing: most of the release predicate, the real HTTP server, tool schemas, Cypher text, the Python and TypeScript contracts, and the browser wire format. A mutation probe aimed at the riskiest lines (a judgment sample) found that 21 of 30 single-line changes passed every test. Almost every item is latent: the code is right today, and a refactor or the planned Mastra upgrade could break it with every check green. Two gaps have already hidden live defects, in the chat identifier guard and in thread ownership. Start with the test tables for the identifier guard, the release predicate and the stream gate.

## What is working

- `packages/agent/tests/answer-release-mastra.test.ts` and `packages/agent/tests/chat-memory-http.test.ts` run a real Mastra agent, memory, LibSQL store and stream handler with a mock model, and assert a sentinel draft is absent from the stream, stored history, clones and prompts.
- Authorisation tests are adversarial: `packages/agent/tests/auth-middleware.test.ts:71-147` forges identity through the request body and query across valid, invalid, missing and throwing tokens, and `packages/agent/tests/chat-memory-http.test.ts:183-209` covers a foreign thread on the custom chat route.
- Fail-closed behaviour is layered: in the mutation probe, no single-line change in the verifier-outage path opened the gate, and all five changes that weakened URL or quotation matching were caught by `packages/agent/tests/processors/hallucination-verifier-guards.test.ts` and `verification-surface-guards.test.ts`.
- `e2e/scripts/smoke-production.mjs` requires a passed or corrected outcome (lines 243-248) and identical answer text and outcome after a thread switch and reload (292-307); its helper scripts have negative tests that run in continuous integration (`e2e/scripts/tests`).
- `e2e/tests/mocked/verification-release.spec.ts` uses a draft sentinel to show that withheld and legacy answers never render prose across the live stream, a thread switch and a reload; hermetic authentication stays inside the harness (`e2e/helpers/hermetic-env.ts`).
- Gates and stubs fail closed by construction: `packages/pipeline/tests/test_release.py:152-175` is a matrix of five metrics against below-threshold, missing and NaN values, and `packages/policy-corpus/tests/helpers/graph-fixtures.ts:49-60` throws when source reads an undeclared fixture field.

## Medium severity

### TEST-1 · Six of ten answer-release predicate terms can be deleted with every test green

**medium** · effort S · wrong-answer risk, test gap

The release predicate at `packages/agent/src/processors/verifier/run.ts:120-126` decides whether an answer is shown as verified. A mutation run deleted its terms one at a time: six deletions (either relevance arm, `citationsComplete`, empty `unsupportedClaims`, empty `missingCitationClaims`, the leftover-marker check) left all 168 agent tests that reach the file passing. Every fixture carrying one of those signals also sets `supported: false`, so that term always decides first. A separate reading of the fixtures adds the empty-answer check, which was not mutated. The code is correct today.

**Impact.** If a refactor drops one term, an answer the verifier flagged as off-policy, uncited or partly unsupported would reach an attorney or beneficiary labelled as verified, with every check green.

**Fix.** Add one `it.each` table to `packages/agent/tests/answer-release.test.ts` beside `withholds on %s`. Start from the existing clean verdict and a cited answer, assert that this base case passes, then change exactly one thing per row: a major relevance issue, `relevant: false`, `citationsComplete: false`, one unsupported claim, one missing-citation claim, a leftover `[unverified: ...]` marker, whitespace-only evidence and a whitespace-only answer. Expect `withheld` and the standard notice on every row.

*What is and is not established: Latent: the predicate is correct today. Mutations ran in a scratch copy; the empty-answer term was read from fixtures, not mutated.*

Where: `packages/agent/src/processors/verifier/run.ts:122`, `packages/agent/tests/answer-release.test.ts:43`, `packages/agent/tests/processors/hallucination-verifier-guards.test.ts:221`

### TEST-2 · Five secondary answer-release defences can be removed without failing a test

**medium** · effort S · wrong-answer risk, privacy, test gap

Five single-line changes to `packages/agent/src/answer-release.ts`, the last server-side barrier before the browser, each left the 27 tests that exercise it passing: removing the write-side memory guard (line 70), the reasoning-chunk filter (118), the withheld-notice fallback when a run ends with no verdict (120), the provider-error text replacement (127), and the outcome from the signed payload (11). Stream fixtures hold only a draft followed by a release.

**Impact.** A regression could show unverified model reasoning or provider error text to a user, return an empty reply in place of the withheld notice, or leave unsigned drafts in stored history and backups.

**Fix.** Extend `packages/agent/tests/answer-release.test.ts` with a small chunk-sequence table for the stream gate: a finish with no verdict yields the withheld notice; reasoning, metadata and provider-error text carrying a sentinel never appear; a tripwire passes through without synthesised text. Add a raw `SELECT` on `mastra_messages` proving an unsigned draft is never stored verbatim, and a forged-outcome case for the signature. In `packages/agent/tests/chat-memory-http.test.ts`, assert the usage `record` calls.

*What is and is not established: Latent: all five defences behave correctly today; survival was shown by single-line mutations in a scratch copy.*

Where: `packages/agent/src/answer-release.ts:70`, `packages/agent/src/answer-release.ts:118`, `packages/agent/tests/answer-release.test.ts:65`, `packages/agent/tests/chat-memory-http.test.ts:91`

### TEST-3 · Citation validators skip six input forms and wrongly flag three; tests are single examples

**medium** · effort S · wrong-answer risk, test gap, cost

The deterministic URL and quotation checks in `packages/agent/src/processors/verifier/answer-validation.ts` feed the release decision, yet their roughly 18 tests are single hand-picked examples. A 23-input probe of the real module found six unchecked forms: uppercase or mixed-case schemes, protocol-relative targets, `www.` and scheme-less targets (which render as broken relative links), and a fabricated quotation after an inch mark. Three forms are wrongly flagged: a source URL followed by a period, a URL containing parentheses, and bold markup inside a verbatim quotation. The verifier model still runs in every case.

**Impact.** An attorney can lose a valid citation link, and the owner pays for a second verifier call, when a cited URL ends a sentence in its source. Withholding follows only if the correction fails.

**Fix.** Add the probe rows as `it.each` cases in `packages/agent/tests/processors/verification-surface-guards.test.ts`, marking any row not yet fixed as `it.fails`. In the same change, make both URL patterns case-insensitive, allow a link target only when its normalised form is in the retrieved set, strip trailing punctuation from source-side URLs as the answer side already does, allow balanced parentheses, and strip emphasis markers before comparing quotations. Choose a rule for a quote mark that follows a digit.

*What is and is not established: The probe ran the real module on 23 hand-built inputs; how often these forms occur in real answers was not measured.*

Where: `packages/agent/src/processors/verifier/answer-validation.ts:144`, `packages/agent/src/processors/verifier/answer-validation.ts:199`, `packages/agent/src/processors/verifier/answer-validation.ts:250`, `packages/agent/tests/processors/verification-surface-guards.test.ts:8`

### TEST-4 · No test exercises the chat identifier guard, which rejects ordinary Medicaid questions

**medium** · effort S · test gap, privacy, user experience

No test exercises the client-identifier check at `packages/agent/src/chat-route.ts:33`: disabling it leaves both chat-route test files (15 tests) passing, and no default browser test sends a second message. The gap hid a live defect, reported in full in the chat section. Run on the request shape the web client sends, the real guard classified six ordinary questions as member IDs, flagged text from earlier assistant answers, and returned a nested 422 body that `packages/web/src/lib/parse-chat-error.ts:39` cannot read.

**Impact.** Until tests pin the guard, a fix to it can regress unnoticed, and an attorney asking a routine question again gets a generic error whose retry button cannot succeed.

**Fix.** Land these with the chat section's guard fix (newest user message only; the combined member-ID pattern; phone and email redacted, not rejected). Add must-block and must-not-block tables to `packages/agent/tests/sensitive-data.test.ts`, including 'My Medicaid ID is 945123456K' and 'Medicaid no cubre'; a route case in `packages/agent/tests/chat-diagnostics-http.test.ts` expecting 422 before storage or generation; a nested-envelope case in `packages/web/tests/lib/parse-chat-error.test.ts`; and one mocked two-turn browser test asserting both request bodies.

*What is and is not established: Rated medium as a test gap; the live defect is the high item in the chat section. The guard was run locally, not against production.*

Where: `packages/agent/src/chat-route.ts:33`, `packages/agent/src/sensitive-data.ts:13`, `packages/web/src/lib/parse-chat-error.ts:39`, `e2e/tests/mocked/abuse-ui.spec.ts:19`

### TEST-5 · No test runs the real Mastra server; cross-user isolation rests on stub handlers

**medium** · effort M · security, privacy, test gap

All seven HTTP-level agent test files build a bare Hono app and set the request context by hand; a 24-line helper re-implements the context merge. No request to `/api/memory/threads/*` reaches the real Mastra handlers, and the composition in `packages/agent/src/index.ts:66-298` runs in no test. Dropping the production guard on the Studio bypass (`packages/agent/src/execution-gateway.ts:67`) or loosening the thread path pattern (line 32) leaves 36 tests passing. A scratch boot refused 16 hostile requests, but the security section reports two ownership gaps on these routes.

**Impact.** After a Mastra upgrade or lockfile refresh, one signed-in user could read another's conversation history, or an unowned framework route could become reachable, with every check green.

**Fix.** Add `packages/agent/tests/server-isolation.test.ts`: boot the real server with `createHonoServer`, temporary LibSQL and a stub auth provider. Assert cross-user refusal on every memory route, including the security section's two cases (a thread write that changes the owner; `include` reading another user's messages), plus the forged-context merge. Move route composition out of `packages/agent/src/index.ts` so the test uses production order. Add Studio-flag, nested-path and wrong-method cases to `packages/agent/tests/execution-gateway.test.ts`.

*What is and is not established: Latent regression risk for the gateway mutations; the scratch boot was not kept as a test. The two ownership gaps are reported in the security section.*

Where: `packages/agent/tests/helpers/client-request-context.ts:3`, `packages/agent/tests/auth-middleware.test.ts:109`, `packages/agent/src/index.ts:66`, `packages/agent/src/execution-gateway.ts:67`

### TEST-6 · No test submits a research decision or cancellation as a non-owner

**medium** · effort S · security, test gap

`ResearchService.decide` and `cancel` depend on an owner-scoped lookup at `packages/agent/src/deep-research/service.ts:231`, the only authorisation on two state-changing endpoints. Replacing it with an unscoped lookup left the 40 tests in the service, recovery, routes and repository suites passing, and a second user's approval with edited sub-questions was then accepted. Cross-user assertions exist only for reads, and the routes test stubs the service. Neutralising the lease-owner predicate in `saveCheckpoint` (`packages/agent/src/deep-research/repository.ts:384`) also passed; that predicate only separates different processes, so it matters less on a single instance.

**Impact.** If the owner check regressed, any signed-in user who learned a run's random identifier could redirect or stop someone else's research, and continuous integration would not notice.

**Fix.** Add a case to `packages/agent/tests/deep-research/service.test.ts` in which a second user calls `decide` (approve with edited sub-questions, then decline) and `cancel` on another user's run: expect `not_found` or false, no workflow resume or cancel, and unchanged state. In the routes test, assert 404 and the forwarded user id. While the lease code stays, also let one owner's lease expire in `packages/agent/tests/deep-research/repository.test.ts`, acquire as a second owner, and assert the first owner's `saveCheckpoint` rejects.

*What is and is not established: Latent: the owner check is correct today; the cross-user approval was accepted only with the mutation applied in a scratch copy.*

Where: `packages/agent/src/deep-research/service.ts:231`, `packages/agent/src/deep-research/repository.ts:384`, `packages/agent/tests/deep-research/service.test.ts:90`, `packages/agent/tests/deep-research/repository.test.ts:141`

### TEST-7 · Retention SQL for conversations and research snapshots never executes in any test

**medium** · effort S · privacy, reliability, test gap

`runRetention` at `packages/agent/src/storage/app-database.ts:194` runs unattended at every process start and every 24 hours. Its only test uses a database without the Mastra tables and rows dated 2020 or now, and asserts two research tables, so the thread, message and workflow-snapshot deletes never execute and a days-to-hours cutoff error would pass. The missing delete for `mastra_observational_memory` is reported in the privacy section. `deleteUserData` has one unasserted delete, but no production code calls it.

**Impact.** A cutoff regression would silently delete every conversation idle for 90 hours on the next deploy, or stop purging private research intermediates, on a volume that may hold client case details.

**Fix.** Add `packages/agent/tests/storage/retention.real-schema.test.ts` on a temporary LibSQL file initialised by the Mastra store and `AppDatabase.migrate()`. Pass a fixed `now` and give the four policy values distinct numbers. Assert an 89-day-old thread survives and a 91-day-old one is removed with its messages, expired research runs lose their snapshots, and feedback, usage and rate-limit rows obey their own cutoffs. Assert the privacy section's `mastra_observational_memory` delete in the same test.

*What is and is not established: Latent: no cutoff error exists today; the statements have simply never been executed by a test.*

Where: `packages/agent/src/storage/app-database.ts:197`, `packages/agent/src/storage/app-database.ts:209`, `packages/agent/tests/storage/app-database.test.ts:66`, `packages/agent/src/index.ts:87`

### TEST-8 · Every tool test replaces `createTool`, so Mastra's schema validation never runs under test

**medium** · effort S · test gap, reliability

Eight test files, the only ones that import from `packages/agent/src/tools`, mock `@mastra/core/tools` so `createTool` returns its raw configuration. Mastra 1.58.0's input validation, output validation and stripping of undeclared output keys therefore run in no test, including the two real-Neo4j integration suites. The stripping and validation-error behaviours were confirmed against the installed package. This has already failed once: commit e4fae18 fixed a schema that silently stripped `lastRevised` and `federalRegisterCite`, with no test added. The tenth tool, `webSearch`, has no tool-level test.

**Impact.** A field added to a retrieval view can pass its tests yet be stripped in production, so an attorney's temporal or amendment answer loses revision metadata; a schema mismatch instead produces withheld answers.

**Fix.** Delete the `vi.mock('@mastra/core/tools', ...)` block from all eight files in one change. Complete the section fixtures in `packages/agent/tests/tools/answer-frame.test.ts` so they satisfy the output schema, then run both integration suites with `RUN_NEO4J_INTEGRATION=1` and treat any validation failure as a schema defect to fix in `packages/agent/src/tools`. Reword the error in `packages/agent/tests/helpers/run-tool.ts` to 'failed schema validation', since it will now also fire for output errors.

*What is and is not established: Mechanism confirmed against installed Mastra 1.58.0; no field is known to be stripped today, and the earlier incident is from commit history.*

Where: `packages/agent/tests/integration/neo4j-tools.integration.test.ts:4`, `packages/agent/tests/helpers/run-tool.ts:29`, `packages/agent/src/tools/answer-frame.ts:29`

### TEST-9 · Most retrieval Cypher goes unchecked: stubs ignore query text and failures are swallowed

**medium** · effort M · test gap, reliability, wrong-answer risk

`packages/policy-corpus` has 26 `session.run` call sites; unit stubs answer them by substring match and execute no Cypher. The only real-database coverage is ten agent integration tests whose helper creates the two vector indexes; the fulltext index exists in continuous integration only because an earlier pytest step creates it, and the suite passes without it. Ten bare `catch` blocks in seven backend files return nothing and log nothing. The sort key that orders undated change notices (`packages/policy-corpus/src/primitives/amendments.ts:30`) is unguarded everywhere.

**Impact.** A query typo or Neo4j upgrade can silently turn off a lexical backend, so attorneys searching by policy number or exact phrase get weaker evidence and more withheld answers; nothing reports it.

**Fix.** Add the `section_fulltext` index to `packages/agent/tests/helpers/integration-indexes.ts`. Replace the ten bare catches with one helper that always logs a warning and rethrows when a strict flag is set by the agent `test:integration` script. Add four or five `searchSections` integration cases so every query shape executes, including one with embeddings failing that asserts `lexical-degraded`. Add an undated change notice to the amendments fixture and assert the ordering that the retrieval section's amendment design settles on.

*What is and is not established: Latent: no broken query was found. The effect on answers is inferred, not observed.*

Where: `packages/agent/tests/helpers/integration-indexes.ts:14`, `packages/policy-corpus/src/retrieval/backends/fulltext.ts:42`, `packages/policy-corpus/src/primitives/amendments.ts:30`, `packages/policy-corpus/tests/helpers/graph-fixtures.ts:380`

### TEST-10 · No test crosses the Python and TypeScript boundary; each side uses hand-written fixtures

**medium** · effort M · test gap, data quality, evaluation validity

No test loads a document through the Python graph writer and reads it back through the TypeScript retrieval code: both agent real-Neo4j suites seed with hand-written `CREATE` statements (`packages/agent/tests/integration/neo4j-tools.integration.test.ts:70`). No shared fixture pins the agent command-line output blocks that the evaluation harness parses. The pipeline also writes to the crawler's SQLite registry and re-declares two of its tables, yet every registry test builds its own reduced `documents` table (`packages/pipeline/tests/test_source_audit.py:15` has seven columns against the crawler's 25).

**Impact.** A rename on one side passes both suites and shows up later as empty evidence and withheld answers, or as missing verifier telemetry in evaluation results; crawler schema changes reach the Python writers untested.

**Fix.** Derive each side's fixture from the real writer. Add a Python seed script that loads the Docling fixture through `load_document` under a test-only id, and an agent integration test that reads it back through the retrieval tools. Check in one golden command-line output file, generated by a TypeScript test and parsed by a Python test. Move the registry table definitions into one SQL file loaded by the crawler's `schema.ts` and a shared pytest fixture.

*What is and is not established: Latent: the duplicated table definitions are identical today and no drift was observed.*

Where: `packages/agent/tests/integration/neo4j-tools.integration.test.ts:70`, `packages/pipeline/tests/test_answer_eval.py:173`, `packages/pipeline/tests/test_source_audit.py:15`, `packages/pipeline/src/pipeline/retirement.py:17`

### TEST-11 · Browser and component tests render hand-written streams the answer gate cannot produce

**medium** · effort M · test gap, user experience

`e2e/helpers/stream-builder.ts` and the fixture helper at `packages/web/tests/components/MessageList.test.tsx:24` are hand-written and share nothing with the agent. Both emit narration text that the answer gate always strips and append a `passed` verdict by default; the builder also puts the verdict after the answer, where the real stream sends it first. Responses arrive in one `route.fulfill`, so the verifying state and the Stop button cannot be reached. An agent test runs the real gated loop but asserts only sentinel strings. Four of seven `VerificationBadge` tests cover a path the app cannot reach.

**Impact.** A wire-format change from the planned AI SDK and Mastra upgrade can break what users see while browser tests stay green; an earlier regression removed verification badges and citations from restored threads.

**Fix.** Extend `packages/agent/tests/answer-release-mastra.test.ts` to snapshot the gated chunk sequence and stored rows for passed, corrected, withheld, tripwire and error turns into `packages/agent/tests/fixtures/wire`. Replay those files from `e2e/helpers/mock-routes.ts` and from a `MessageList` fixture helper. As an interim step, replace the builder's implicit verdict with one `release(text, outcome)` method that emits the verdict before the text. Delete the four unreachable `VerificationBadge` tests and branches once stored history is confirmed free of the old part types.

*What is and is not established: Latent until the wire format changes; the earlier badge regression is taken from repository history, not reproduced.*

Where: `e2e/helpers/stream-builder.ts:101`, `packages/agent/tests/answer-release-mastra.test.ts:49`, `packages/web/tests/components/MessageList.test.tsx:24`, `packages/web/tests/components/VerificationBadge.test.tsx:41`

### TEST-12 · The mocked browser backend never checks requests and omits nine of sixteen routes

**medium** · effort M · test gap, reliability

`mockMastraAPI` in `e2e/helpers/mock-routes.ts` fulfils every intercepted call without checking the Authorization header or body, and no browser test asserts a request. It handles 7 of the 16 route and method pairs on the agent allow-list; calls for corpus status, deep research and thread management reach an unbound port and fail quietly. Five tests in `e2e/tests/mocked/abuse-ui.spec.ts` and `e2e/tests/mocked/error-handling.spec.ts` override `**/chat` without the server-action guard, so they also answer AuthKit's session requests. Two feedback tests end on an already-visible button, and the 'can send again' test sends once.

**Impact.** Dropping the bearer token or the thread id from the chat request passes every mocked browser test; in production the first fails every call and the second silently starts a new thread per message.

**Fix.** Anchor every mocked route to the backend origin and replace the five per-test overrides with a `chatResponse` option. Record requests in `mockMastraAPI` and assert the bearer header, a stable `memory.thread` across two sends, and the feedback request body. Fail the test on any unmocked call. Add corpus-status, research and thread handlers with tests for plan approval, thread delete and the degraded-search banner. Add `aria-pressed` to the rating buttons and assert it.

*What is and is not established: Latent: the client sends the bearer token and thread id correctly today.*

Where: `e2e/helpers/mock-routes.ts:36`, `e2e/tests/mocked/abuse-ui.spec.ts:10`, `e2e/tests/mocked/feedback.spec.ts:26`, `packages/web/src/lib/use-chat-thread.ts:91`

### TEST-13 · Deep-research recovery was validated only with stub agents and a reduced live run

**medium** · effort M · test gap, documentation, reliability

`packages/agent/tests/deep-research/recovery.test.ts` runs the real Mastra workflow and SQLite but replaces the planner, worker and report agents with `vi.fn` mocks. Interruptions are injected by throwing after a checkpoint is saved, plus one resume rejection and one verifier outage; no test makes an agent's provider call reject, and the mocked planner never returns follow-up questions. The single recorded live run used one sub-question and zero reflection rounds. `docs/operations/answer-release-and-recovery.md:39` says 'mocked providers' and 'a live research run with two automatic recoveries' without stating either limit. Failures on these paths fail closed.

**Impact.** The owner may believe recovery was proven end to end, yet the repository records no completed run at the default six sub-questions and two reflection rounds under the release gate.

**Fix.** Correct the operations document: state that all three agents are stubbed, interruptions follow a checkpoint write, and the live run's limits. Add `it.each` provider-rejection cases (a 503 for planner, worker, reflection and report; one 401 expecting terminal failure) to the recovery test. Add one happy-path test with real `Agent` objects on `MockLanguageModelV3`. Replace the mocked lease loss in `packages/agent/tests/deep-research/service.test.ts` with a simulated takeover. Defer the default-limit live run to the corpus qualification checklist.

*What is and is not established: No reviewer ran a live research job. The finding concerns what the repository records, not an observed recovery failure.*

Where: `packages/agent/tests/deep-research/recovery.test.ts:20`, `docs/operations/answer-release-and-recovery.md:39`, `packages/agent/tests/deep-research/service.test.ts:156`, `packages/pipeline/data/eval-results/milestones/2026-09-22-verified-release/tagged-research-smoke.mts:3`

### TEST-14 · No automated accessibility check exists, and browser tests run only desktop Chrome

**medium** · effort S · accessibility, test gap, user experience

The end-to-end package has no accessibility engine and no test runs a scan. Every Playwright project in `e2e/playwright.config.ts` uses `devices['Desktop Chrome']`, so the mobile layout and sidebar overlay are never rendered; mobile behaviour is tested only in jsdom with a mocked `useIsMobile`. Browser keyboard coverage is Enter-to-send only. Contrast computed from the light-theme tokens in `packages/web/src/app/globals.css` (not measured in a browser) is about 2.4:1 for sidebar dates, 2.6:1 for the 'Generated' line and 2.2:1 for message action icons, below the 4.5:1 and 3:1 thresholds.

**Impact.** Beneficiaries and legal-aid staff with low vision likely meet text and controls that are hard to read in the light theme, and a regression in the mobile sidebar or keyboard focus would ship unnoticed.

**Fix.** Add `@axe-core/playwright` and one `e2e/tests/mocked/a11y.spec.ts` scanning the landing page, a legal page, and the empty and answered chat in both themes against the Web Content Accessibility Guidelines A and AA rules. Land it green: fix the muted colour tokens in the same change or disable the contrast rule against a tracked issue. Add one mobile-viewport test for the sidebar overlay, Escape and focus return, and a tab-order check in `e2e/tests/mocked/keyboard.spec.ts`.

*What is and is not established: Contrast ratios were computed from the CSS tokens, not measured in a browser; no assistive-technology testing was done.*

Where: `e2e/package.json:5`, `e2e/playwright.config.ts:55`, `e2e/tests/mocked/keyboard.spec.ts:38`, `packages/web/src/app/globals.css:73`

### TEST-15 · Production smoke fails on its second run because it leaves a same-titled thread

**medium** · effort S · release gate, reliability, cost

`e2e/scripts/smoke-production.mjs` asks 'What is EPSDT?' on every run, and the web stores the first 60 characters as the thread title. `activeThreadForRestore` at `e2e/scripts/smoke-thread.mjs:7` throws when that title matches more than one sidebar entry, and nothing renames or deletes the thread. Once a same-titled thread is among the account's 50 most recent, every default run fails at the persistence step, after a paid answer has been generated and verified. A retained receipt from 2026-10-03 records this failure; recovery meant deleting six conversations by hand.

**Impact.** The operator's post-deploy and corpus-activation gate fails falsely once it has passed once, needs hand cleanup of the production test account, and so invites being distrusted or bypassed.

**Fix.** Add a `renameActiveThread(page, title)` helper to `e2e/scripts/smoke-thread.mjs` and call it after the answer and before the persistence check, giving the fresh thread a unique `smoke <run id or timestamp>` title. Delete that thread on success, warning without throwing if cleanup fails, and keep it on failure for diagnosis. Leave the duplicate-title rejection in place. Add a `node:test` case with two same-titled rows in which only the active row is renamed, and update `RUNBOOK.md`.

Where: `e2e/scripts/smoke-thread.mjs:7`, `e2e/scripts/smoke-production.mjs:22`, `packages/web/src/app/chat/page.tsx:139`, `scripts/ops/weekly-refresh.sh:81`

## Low severity

### TEST-16 · Neither the benchmark nor unit tests can detect policy-number extraction or lookup-ordering errors

**low** · effort S · test gap, evaluation validity, wrong-answer risk

None of the 155 benchmark questions contains a look-alike token such as '3D mammogram'. The only extractor assertion (`packages/policy-corpus/tests/query-analysis.test.ts:10`) uses 'Policy 3K-2', and the one real-database `lookupPolicy` test uses a collision-free number.

**Impact.** A change to extraction or lookup can move an attorney's question onto a neighbouring policy while every test and the answer evaluation stay unchanged.

**Fix.** Treat these as acceptance tests for the retrieval section's policy-number fix. Add a table test for `extractExplicitPolicyNumbers` with look-alike negatives ('3D mammogram', 'stage 3b') and positives ('Policy 9', '1-H', 'MA-2180'). Add one sibling pair to `packages/agent/tests/integration/neo4j-tools.integration.test.ts` and assert the exact match is returned first. Add three to five look-alike golden questions only after checking each answer key against the current corpus, recording them in `packages/pipeline/data/golden/CHANGELOG.md`.

*What is and is not established: A regression-guard gap for two defects reported in the retrieval section, not a separate defect. The one mis-routed 'Policy 9' question comes from a replay that was not re-run.*

Where: `packages/policy-corpus/tests/query-analysis.test.ts:10`, `packages/policy-corpus/tests/policy-lookup.test.ts:44`, `packages/agent/tests/integration/neo4j-tools.integration.test.ts:70`, `packages/pipeline/data/jev/fresh-paraphrases.json:191`

### TEST-17 · Verifier tests cover dead fallback code while live release-target selection is untested

**low** · effort S · needless complexity, test gap

`renderCorrectedAnswer` and `replaceFinalAnswerText` have no caller in any `src` directory, yet 14 of 42 tests in `packages/agent/tests/processors/hallucination-verifier.test.ts` exist for them. No test would notice the wrong assistant message receiving the release (`packages/agent/src/processors/verifier/processor.ts:86`).

**Impact.** A contributor could re-wire the tested 'fall back to the original draft' helper, which the release gate forbids. A slip in message selection would replace later stored answers with a 'not verified' notice.

**Fix.** Delete `renderCorrectedAnswer`, `extractMissingCitations` and `replaceFinalAnswerText`, the always-false `pureMarkerFallback` and `substanceLossFallback` options, their telemetry fields, the matching web branches in `packages/web/src/components/VerificationBadge.tsx` and `packages/web/src/components/SourcesPanel.tsx`, and the tests that exist only for them. Extend `packages/agent/tests/answer-release-mastra.test.ts` with a second turn that returns a different draft and assert the stored assistant texts in order.

*What is and is not established: Latent: message selection is correct today; the dead code has no caller.*

Where: `packages/agent/tests/processors/hallucination-verifier.test.ts:631`, `packages/agent/src/processors/verifier/processor.ts:86`, `packages/agent/src/processors/verifier/processor.ts:101`, `packages/agent/src/processors/verifier/answer-validation.ts:282`

### TEST-18 · Ranking tests pin eight exact floats yet miss two scoring errors

**low** · effort M · test gap

`packages/policy-corpus/tests/retrieval-ranking.test.ts:100` asserts eight scores to full floating-point precision, yet swapping minimum for maximum in the fulltext mid-range placement and reversing a latest-change penalty left all 319 package tests passing. Other tests assert questionable behaviour as correct.

**Impact.** Retuning any constant breaks tests without showing whether ranking improved, while a real scoring slip that promotes weak lexical matches or the wrong 'Effective' section into the evidence set would pass.

**Fix.** Delete the pinned-float test and keep the relative-ordering tests. Add a collector test with two existing hits at 1.0 and 0.2 and two fulltext-only hits, asserting insertion at 0.6 and 0.58. Add a ranking test asserting the penalty as an exact difference between two otherwise identical hits. Alongside each related defect fix, add fixture tests for multi-group fulltext merging, `lookupPolicy` ordering, same-year amendment ties, type-group completeness and content past the 6,000-character cap.

*What is and is not established: Latent: both scoring mutations were applied in a scratch copy; scoring is as designed today.*

Where: `packages/policy-corpus/tests/retrieval-ranking.test.ts:100`, `packages/policy-corpus/src/retrieval/collector.ts:178`, `packages/policy-corpus/src/internal/rerank.ts:492`, `packages/policy-corpus/tests/internal/document-selection.test.ts:131`

### TEST-19 · Verifier call bounds are weakly pinned: retryability, deadline and retry count

**low** · effort S · test gap, cost

At `packages/agent/tests/processors/verifier-timeout.test.ts:18`, the `maxRetries` assertion sits inside the mock and is swallowed by the code under test. No test sees `failureRetryable: false`, and the deadline branch that takes a caller signal (`packages/agent/src/processors/verifier/verify.ts:97`) has no test or production caller.

**Impact.** Each of these regressions would still withhold the answer, so users are unaffected; the owner's budget would bear up to two wasted recovery attempts with paid verifier calls, or silently re-enabled provider retries.

**Fix.** Assert `maxRetries: 0` on the recorded `generateObject` call after awaiting, not inside the mock. Add a verifier case that rejects with a 401 and expects `failureRetryable: false`, a `runVerificationForAnswer` case expecting `retryable: false`, and a recovery case in which a non-retryable report verification ends as `failed` with no recovery attempt. Either test the caller-signal deadline or remove the unused `signal` parameter until Mastra forwards one.

*What is and is not established: Latent: each regression would still withhold the answer; only cost is at stake.*

Where: `packages/agent/tests/processors/verifier-timeout.test.ts:18`, `packages/agent/src/processors/verifier/verify.ts:97`, `packages/agent/src/processors/verifier/run.ts:167`

### TEST-20 · The only real-document loader test asserts little more than non-emptiness

**low** · effort S · test gap, data quality

Four tests at `packages/pipeline/tests/test_loader.py:71-93` run the loader on the one real Docling fixture, picked by an unordered glob, and assert only non-empty output, an id prefix and more than one level. The fixture yields 46 sections across three levels.

**Impact.** A loader or docling-core change that loses section numbers, parent links or body text on real policy documents would pass these tests and would not trip the corpus audit's zero-section or blank-body flags.

**Fix.** Read the fixture by name so a missing file fails instead of skipping. Collapse the four tests into one structural test: 46 sections; level counts 25, 13 and 8; 29 numbered; 38 with content; one with tables; no duplicate ids; 21 parent links; 33 sibling links; 16,513 body characters. Add parent-chain anchors for sections 1.0, 1.1 and 2.1.1. Skip a byte-exact golden file.

*What is and is not established: Latent; the counts were measured on the single checked-in fixture.*

Where: `packages/pipeline/tests/test_loader.py:71`, `packages/pipeline/tests/test_loader.py:78`, `docs/development/gotchas.md:25`

### TEST-21 · The opt-in Playwright smoke and design projects have rotted outside continuous integration

**low** · effort S · test gap, cost, needless complexity

`e2e/tests/smoke/message-persistence.spec.ts` asserts tool labels that are unmounted once an answer completes; `chat-roundtrip.spec.ts` cannot tell a verified answer from a withheld one; `deep-research.spec.ts` runs a paid job with no opt-in. The `design` project asserts nothing and needs a live login.

**Impact.** A developer running the local smoke tier by hand pays for model calls, including a research run the code sizes at 10 to 15 chat answers, and may see a false failure or pass.

**Fix.** Delete `e2e/tests/smoke/message-persistence.spec.ts` and the `design` project with its stale screenshots, and point `packages/web/AGENTS.md` at `/preview` and the mocked tier. Add `waitForVerifiedAnswer` to `e2e/helpers/chat-page.ts` and require a passed or corrected badge in `e2e/tests/smoke/chat-roundtrip.spec.ts`. Gate `e2e/tests/smoke/deep-research.spec.ts` behind `DEEP_RESEARCH_E2E=1`, add its health-check skip, raise its timeout to 600 seconds, set `workers: 1` on the smoke project, delete the `test:e2e:all` script, and note in the README that the tier makes paid calls.

*What is and is not established: Read from the test source; the paid smoke tier was not run during the review.*

Where: `e2e/tests/smoke/message-persistence.spec.ts:44`, `e2e/tests/smoke/chat-roundtrip.spec.ts:33`, `e2e/playwright.config.ts:72`, `e2e/tests/design/screenshots.shots.ts:37`

### TEST-22 · The daily rate-limit window can be halved without failing a test

**low** · effort S · test gap, cost

`DAY_MS` at `packages/agent/src/rate-limit/repository.ts:12` sets the daily window, but the only daily-limit test places its events within about ten hours, so a 12-hour window passes. A separate retention setting (default 25 hours) prunes the same table; no test links them.

**Impact.** A halved window would give each user twice the daily budget (300 agent runs instead of the default 150), which is direct model spend for the owner.

**Fix.** Add one test to `packages/agent/tests/rate-limit/repository.test.ts`: five events at 0, 2, 4, 6 and 8 hours, a sixth at 21 hours expecting a denial with window `day`, limit 5 and a three-hour retry, then an allowed request just after 24 hours. Optionally make the configuration reject `RATE_LIMIT_RETENTION_HOURS` below 24.

*What is and is not established: Latent: the window is 24 hours today.*

Where: `packages/agent/src/rate-limit/repository.ts:12`, `packages/agent/tests/rate-limit/repository.test.ts:51`, `packages/agent/src/runtime-config.ts:164`

### TEST-23 · Test runs read live provider keys and write to the operational crawl log

**low** · effort S · reliability, cost

Importing `pipeline.config` or the agent environment loader fills live provider keys and workstation paths from the repository `.env`; no `conftest.py` exists. Crawler tests append to the workstation's operational `packages/crawler/data/crawl.log` (191.7 MB, no rotation), mixing test output with crawl history.

**Impact.** Only the developer's workstation is exposed: one missed mock could mean a paid provider call or a write to working data (none was observed), and the crawl log cannot be trusted as evidence.

**Fix.** Add `packages/pipeline/tests/conftest.py` that sets `PYTHON_DOTENV_DISABLED=1` before any pipeline import, removes variables ending in `_API_KEY` or `_TOKEN`, and points `CORPUS_DATA_ROOT` at a temporary directory. Add `vitest.config.ts` files for the crawler (temporary `CORPUS_DATA_ROOT`) and the agent (`AGENT_SKIP_DOTENV=1`, honoured in `packages/agent/src/load-env.ts`). Write one crawl log per run, and serialise `Error` objects with name, message, stack and code.

*What is and is not established: No paid call or working-data write from a test was observed; the log size is from one workstation.*

Where: `packages/pipeline/src/pipeline/config.py:12`, `packages/agent/src/load-env.ts:104`, `packages/crawler/src/utils/logger.ts:30`, `packages/pipeline/pyproject.toml:48`

### TEST-24 · Root `npm test` can replay a stale pass after a dependency package changes

**low** · effort S · reliability

`turbo.json:10-15` gives `test`, `lint` and `typecheck:tests` no `dependsOn`, so a warm local cache can replay a stale agent or web result after `policy-corpus` or `contracts` source changes (reproduced in a scratch workspace). Strict environment mode also strips `CORPUS_DATA_ROOT`.

**Impact.** A contributor or coding agent who edits retrieval code and runs the root commands can see a green result that was never re-run. Continuous integration and per-package commands are unaffected.

**Fix.** Add a `transit` task with `dependsOn: ["^transit"]` to `turbo.json` and make `test`, `test:coverage`, `lint` and `typecheck:tests` depend on it. Add `"@nc-medicaid/pipeline#test": {"cache": false, "passThroughEnv": ["CORPUS_DATA_ROOT"]}`. Confirm with `turbo run test --dry=json` that the agent and web hashes change when a `policy-corpus` or `contracts` source file is edited. Keep integration tests outside turbo.

*What is and is not established: Reproduced in a scratch workspace with a warm cache; continuous integration is unaffected.*

Where: `turbo.json:10`, `packages/policy-corpus/package.json:6`, `packages/agent/package.json:30`

### TEST-25 · Coverage is never measured, and contracts tests, browser tests and Python escape type checking

**low** · effort S · test gap

No continuous-integration step runs coverage and no threshold exists, although the tooling is installed. The contracts `typecheck:tests` script (`packages/contracts/package.json:14`) compiles only `src`. The end-to-end package has no type-check step, and the Python pipeline has no type checker.

**Impact.** The owner cannot see which modules are untested or notice coverage falling, and one green check reports on tests it never compiles; type errors in those areas appear only at run time.

**Fix.** Point the contracts `typecheck:tests` script at a new `tsconfig.tests.json` that includes the tests, and add `npx tsc -p .` for the end-to-end package to the mocked browser job. Run the installed coverage tooling in continuous integration as report-only, with no thresholds until the release path has completed once. For Python, defer a type checker; if wanted, start with pyright in basic mode on the release and graph-load modules only.

Where: `.github/workflows/ci.yml:127`, `packages/contracts/package.json:14`, `packages/contracts/tsconfig.json:11`, `packages/pipeline/pyproject.toml:25`
