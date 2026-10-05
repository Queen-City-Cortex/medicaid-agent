# Answer verification and release: all issues

The text boundary holds: model prose never streams, only a passed answer or its rechecked correction is released, and storage replaces unsigned assistant text. In every failure exercised with mocked models, no draft answer text reached the client or the database, although observer notes and raw tool errors did. The main risk is what gets released as verified. One low-effort model call decides, its catch rate has never been measured, and its evidence can be truncated so that cited text is missing. The tracked September 2026 release answer gives a federal 90-day appeal ceiling under a North Carolina heading, the under-21 exception is often absent from coverage answers, and the amendment lookup presents change notices as authoritative. The product names no help contact. I would first fix the evidence ordering and the appeal-deadline prompt rule, then build the single verifier benchmark before adding any new check.

## What is working

- `gateAnswerStream` (`packages/agent/src/answer-release.ts:99-130`) emits answer text only from the server's verification part. With a provider 500, a malformed verdict, a tool error and a disconnect, no draft answer text appeared in the response.
- `installMemoryReleaseGate` (`packages/agent/src/answer-release.ts:56-96`) guards saves, updates, all three list methods and clones with a signature over text and outcome. When the processor's bookkeeping was wrong, the rejected draft was still replaced before reaching the database.
- The correction recheck is bounded (`packages/agent/src/processors/verifier/run.ts:101-141`): a fresh call on the exact corrected text with deterministic checks recomputed, at most two passes, and empty, unchanged or marker-bearing corrections are withheld.
- Link and long-quotation checks (`packages/agent/src/processors/verifier/answer-validation.ts:169-207`, `:237-273`) read the structured source list, so prompt content cannot influence them. Evidence is captured from raw tool results in request-local state (`packages/agent/src/processors/verifier/processor.ts:48-62`), out of reach of memory compaction.
- The boundary is tested against real Mastra and real SQLite with draft sentinels (`packages/agent/tests/answer-release-mastra.test.ts`, `packages/agent/tests/chat-memory-http.test.ts`), and production configuration rejects a disabled verifier (`packages/agent/src/runtime-config.ts:117`).
- The material for temporal checks exists: clinical-policy revision tables load as dated amendment rows with change text (155 rows for Policy 8C in the local July 2026 graph), and `packages/policy-corpus/src/scope/coverage.ts` fails closed for known-missing dated sources.

## High severity

### SAFE-1 · Appeal answers give the federal 90-day ceiling where North Carolina's shorter limit applies

**high** · effort M · wrong-answer risk, data quality, evaluation validity

Neither `packages/agent/src/prompt.ts:124` nor the verifier prompt distinguishes a federal bound from the North Carolina rule. Thirteen of 48 distinct stored answers to one appeal question state only the federal maximum of 90 days (42 CFR 431.221(d)) for a fee-for-service hearing request; none states North Carolina's limit, 30 days under N.C.G.S. 108A-70.9A(d) or 60 days for county decisions. One is the tracked 22 September 2026 release answer, which puts it under an 'NC Medicaid Direct' heading and was released as verified. Its 18 sources held no North Carolina hearing source.

**Impact.** A beneficiary who reads 90 days and files on day 45 is out of time and may lose continued services during the appeal, under a green verified badge.

**Fix.** Sharpen `packages/agent/src/prompt.ts:124` into a general rule: state a federal maximum or minimum only as the federal bound, give the North Carolina figure only from a North Carolina source, and otherwise say the notice's deadline controls. Amend the q-033 answer key and add one county-decision case (60 days). Then seed the four hearing statutes from ncleg.gov and alias appeal phrases to MA-2420 and MA-3430 in `PolicyCorpus`. Add no verifier rule and no fixed number in the web interface.

*What is and is not established: Counts come from stored April to September runs on the older local graph; no live model was run. The 90-day sentence is accurate federal law, misplaced.*

Where: `packages/agent/src/prompt.ts:124`, `packages/pipeline/data/eval-results/milestones/2026-09-22-verified-release/final-gate-full.json:5427`, `packages/agent/src/processors/verifier/verify.ts:78`

### SAFE-2 · Verifier evidence budget drops cited section text and keeps section listings

**high** · effort S · wrong-answer risk, release gate, test gap

`buildSourceText` (`packages/agent/src/processors/verifier/evidence.ts:458-480`) puts sources whose link the answer cites first, then stops at the first block that exceeds the budget. Entries sharing a link all count as cited, so long section listings can crowd out section bodies. Replaying current code on the recorded 22 September 2026 gate evidence, one answer carried a passed outcome although about 1,400 characters of federal requirements it stated were absent from the verifier text. Across 1,449 recorded answers the replay truncates 34 and drops a section body in 24.

**Impact.** An attorney can receive specific requirements marked verified that the verifier had no evidence for; a fabricated detail in that position would have passed the same way.

**Fix.** Reorder `buildSourceText` to cited section bodies, cited other entries, uncited bodies, then the rest, and skip an oversized entry instead of stopping. Return the dropped entries, record `evidence_chars_sent` and `evidence_entries_dropped` in telemetry, and withhold without a model call when a cited body is dropped. Keep the budget, deadline and listing lines. Add the q-010 regression, a listing-title quotation test and a dropped-cited-body test. Land it with or after the deep-research report source split, because oversized reports will otherwise be withheld.

*What is and is not established: Replay of current code on recorded evidence, not a captured prompt. The production budget is unrecorded; the 30,000-token default is assumed. Most truncated rows predate July 2026.*

Where: `packages/agent/src/processors/verifier/evidence.ts:476`, `packages/agent/src/processors/verifier/evidence.ts:458`, `packages/agent/src/processors/verifier/run.ts:109`, `packages/pipeline/src/pipeline/eval/evidence.py`

### SAFE-3 · Under-21 EPSDT exception often fails to reach adult yes/no coverage answers

**high** · effort M · wrong-answer risk, data quality, test gap

The Early and Periodic Screening, Diagnostic and Treatment (EPSDT) rule is last in `COVERAGE_SUPPORTING_PROFILE_RULES` (`packages/policy-corpus/src/frame/coverage-sections/candidates.ts:494`), and only the first four supporting candidates survive. Selection and the planner match the provision by phrases in body text, so a 129-character cross-reference banner in section 4.0 is taken for it. In 133 recorded frames for 16 questions since 13 June 2026, the provision's text was present in 50, only the banner in 38 and neither in 45. With neither, 43 of 45 answers omitted the exception, including every acupuncture and massage run.

**Impact.** A parent or case manager asking whether a service is covered gets a verified 'not covered' with no mention that a child under 21 may still qualify.

**Fix.** Move the `epsdt-exception-supporting` rule to the front of `COVERAGE_SUPPORTING_PROFILE_RULES`, gated to yes/no or not-covered questions that are not already pediatric. Export one predicate from policy-corpus that matches the provision by section number and title with non-empty content, and use it in selection and the planner. When section 2.2.1 is empty, select the '42 U.S.C. § 1396d(r)' sibling. Replace the two hand-built tests with a real template fixture and add under-21 evaluation checks. Fix lettered-heading hierarchy at the next graph rebuild.

*What is and is not established: Frequencies are the reviewer's saved outputs over recorded runs and the local June parse, read but not re-derived. No live model was run.*

Where: `packages/policy-corpus/src/frame/coverage-sections/selection/groups.ts:56`, `packages/policy-corpus/src/frame/coverage-sections/candidates.ts:494`, `packages/policy-corpus/src/frame/coverage-sections/selection/assembly.ts:94`, `packages/agent/src/processors/answer-frame-planning.ts:185`

### SAFE-4 · Amendment lookup names the newest change notice as authoritative, and retrieval ignores document status

**high** · effort M · wrong-answer risk, data quality, test gap, user experience

`getAmendments` promotes the newest change notice to `authoritativeDocument` (`packages/policy-corpus/src/primitives/amendments.ts:51`) and fetches the amended document with `LIMIT 1` and no ordering. `packages/agent/src/prompt.ts:93` tells the model to adopt it, the verifier receives it under 'Authoritative document', and `packages/web/src/components/ToolStep.tsx:184` labels it 'Current document'. In the local July 2026 graph, 114 of 193 notices amend several manuals, and the top notice for 125 of 335 amended documents has under 50 characters of text. No retrieval backend filters on status or date, so limit tables for 2019 to 2023 marked `current` compete with the newest.

**Impact.** A beneficiary or case manager asking for a current income limit can receive a prior year's figure, cited and marked verified. How often this happens on real questions was not measured.

**Fix.** Return `{ document, amends, amendments, latestAmendment, truncated }`, where `document` is the queried document and `amends` lists every amended document in a stable order; drop `authoritativeDocument` and `baseDocument`. Update together `packages/policy-corpus/src/frame/pipelines/amendment.ts:78-91`, `packages/agent/src/prompt.ts:93`, `packages/agent/src/tools/navigate.ts`, the verifier evidence headings, `ToolStep.tsx` and their tests. Fix notice-date ordering separately, because `latestAmendment` depends on it. Then exclude documents that are not retrieval-ready and mark superseded year-stamped editions at load, with golden questions that fail on a 2019 to 2022 limit.

*What is and is not established: Counts come from the older local July 2026 graph. No stored or live answer giving a prior-year limit was shown; the wrong-figure impact is inferred.*

Where: `packages/policy-corpus/src/primitives/amendments.ts:46`, `packages/policy-corpus/src/frame/pipelines/amendment.ts:78`, `packages/agent/src/prompt.ts:93`, `packages/web/src/components/ToolStep.tsx:184`

### SAFE-5 · Questions about a past date are answered from current policy text

**high** · effort M · wrong-answer risk, data quality, evaluation validity, test gap

The corpus holds one text version per document, and only `resolveCoverageScope` (`packages/policy-corpus/src/scope/coverage.ts:67`, `:83`) relates a date in the question to a source, for two Modified Adjusted Gross Income (MAGI) tables and one COVID-19 bulletin. A probe asking what Policy 8C required in March 2024 returned no scope. In the local July 2026 graph, 378 of 3,322 documents other than change notices carry an effective date. The verifier's only temporal rule favours the latest revision, and no golden question asks about a past date.

**Impact.** A legal-aid attorney preparing an appeal over a 2024 denial can receive today's rule presented as the rule then in force, marked verified, because every claim matches a retrieved current section.

**Fix.** Add a unit-tested `asOfDate` detector that fires on one explicit past date, not on ranges such as 'amended since 2024', and carry it on the coverage scope. Using `getAmendments`, make the answer name later revisions and state the earlier rule only where a change summary quotes it; otherwise say only current text is held. Fail `coverageEvidenceIssue` without that evidence. Add ten as-of golden questions. Defer loading prior versions.

*What is and is not established: The end-to-end case was not run; the wrong-answer outcome is inferred from the scope probe. Counts come from the older local July 2026 graph.*

Where: `packages/policy-corpus/src/scope/coverage.ts:67`, `packages/policy-corpus/src/internal/rerank.ts:220`, `packages/pipeline/src/pipeline/graph/loader.py:451`, `packages/agent/src/processors/verifier/verify.ts:65`

### SAFE-6 · Release depends on one low-effort model call whose catch rate is unmeasured

**high** · effort M · wrong-answer risk, release gate, evaluation validity, test gap

Beyond deterministic coverage, link and quotation checks, release rests on one `generateObject` call at low reasoning effort (`packages/agent/src/processors/verifier/verify.ts:94-99`), and the same model rechecks its own correction; 13 of 50 answers in the September 2026 milestone run were released that way. The call is hard-wired to OpenAI, so a Claude `VERIFIER_MODEL` would withhold every answer. No catch rate is measured. In stored runs a mismatched first document preceded low-accuracy answers 3.7 times more often (36 of 580 rows against 26 of 1,576), and the enforced gate has never met one.

**Impact.** Anyone relying on the verified badge: a transposed dollar figure, a wrong deadline or a flipped qualifier is released if that single pass misses it.

**Fix.** Build one offline benchmark that replays `runVerificationForAnswer` three times over two sets: captured answers with one seeded error each (figure, date, qualifier, section label), and the 64 stored judged-bad answers, copied out of the gitignored results directory and hand-confirmed. Report catch and false-withhold rates. Route `verifyAnswer` through `createModel()` and validate `VERIFIER_MODEL` at startup. Report per run whether the first routed document is a golden document. Change effort or model only against that benchmark, within the limits fixed by issue #188.

*What is and is not established: No live verifier was run. Stored-run figures use noisy judge scores on the older graph, and all 36 bad mismatch rows date from April to June 2026.*

Where: `packages/agent/src/processors/verifier/verify.ts:93`, `packages/agent/src/processors/verifier/run.ts:120`, `packages/agent/src/processors/verifier/config.ts:9`, `packages/agent/src/tools/answer-frame.ts:105`

### SAFE-7 · Citation section labels are model-written, and no check ties them to evidence

**high** · effort M · wrong-answer risk, release gate, evaluation validity, test gap

Tools return one link per document (`packages/policy-corpus/src/internal/record-mapping.ts:129`), and the model writes the 'Policy 8C § 3.2.1' label. `validateAnswerUrls` checks only that the link was retrieved, so with only § 3.2.1 retrieved, citations to § 5.6 and a nonexistent § 9.9.9 passed both deterministic checks. Replaying the two proposed label validators on 7,102 stored labels flagged mostly correct citations: in the four enforced September 2026 runs they failed 3 and 1 of 90 released answers and caught no wrong citation. `docs/reviews/2026-06-11-remediation-plan.md:48` lists per-citation verification as completed; it was never built.

**Impact.** An attorney can quote a section that does not contain the rule, from an answer marked verified, and must search the whole document to check it.

**Fix.** Add `policyNumber`, `sectionNumber` and `childSectionNumbers` to `SourceEntry`, populated in `extractGetSection` and the container branch of `getSection`. Compare labels after normalising ('1-H' equals '1H', trailing '.0', container children count as retrieved) and only log an `unknownSections` counter; keep it out of the `clean` predicate. Commit the replay as a regression test over the tracked September 2026 files, asserting zero flags on the final gate. Promote to enforcement only after a clean replay on current-corpus evidence. Correct the June plan's banner.

*What is and is not established: Shown with a constructed example. Stored runs on the older graph hold no wrong section label in 90 enforced answers and 8 of 1,697 advisory-era answers.*

Where: `packages/policy-corpus/src/internal/record-mapping.ts:129`, `packages/agent/src/processors/verifier/answer-validation.ts:169`, `packages/agent/src/processors/verifier/evidence.ts:130`, `packages/policy-corpus/src/primitives/sections.ts:128`

### SAFE-8 · Stream gate forwards unverified observer text, classifier reasons and raw tool errors

**high** · effort S · release gate, security, test gap, documentation

`gateAnswerStream` (`packages/agent/src/answer-release.ts:118-127`) drops text, reasoning and metadata chunks and forwards every other chunk type unchanged. Through the real chat route with mocked models, the response carried the observational-memory model's observations under production memory defaults, a free-text classifier abort reason and a raw tool error naming an internal Neo4j host. The observer text was also stored inside signed released messages, because the signature covers only text and outcome. The runbook says the stream emits only the final release, and the regression test never asserts that the observer's output is absent.

**Impact.** The web client hides observer text, so no unverified policy text is displayed today. A failed tool call can show its raw error, and any chunk type a framework upgrade adds would be released.

**Fix.** Replace the deny-list with an allow-list that rebuilds each chunk from named fields, with fixed text for `tool-output-error`, and drop all `data-om-*` chunks. Redact observer text from stored markers in `releaseMessage`. Strip `metadata.mastra` from thread responses and, in the same change, stop the client sending thread metadata on rename, or rename will erase memory state. Extend `packages/agent/tests/chat-memory-http.test.ts` to assert the observer string is absent from the response and the database. Correct the runbook.

*What is and is not established: Reproduced with mocked models. A 'suggested response' crossed only under the forced-observation test configuration, and the web client does not render observer text; high reflects the breached server invariant.*

Where: `packages/agent/src/answer-release.ts:118`, `packages/agent/src/answer-release.ts:21`, `packages/web/src/components/ToolStep.tsx:317`, `docs/operations/answer-release-and-recovery.md:7`

## Medium severity

### SAFE-9 · Deterministic evidence guard is satisfied by the routing hint alone

**medium** · effort S · wrong-answer risk, release gate, test gap

`runVerificationForAnswer` releases only when some source has text (`packages/agent/src/processors/verifier/run.ts:126`), but the `resolveAnswerFrame` routing entry, forced at step 0 of each turn, always has text, as does an empty `getAmendments` result. `validateAnswerUrls` also accepts links found only in that hint. When a frame returns no section bodies, only the model verdict stands between the answer and release: with routing-only evidence and a stubbed clean verdict, an answer citing the hint's link passed. The existing test uses `sources: []`, which chat reaches only if the frame tool fails.

**Impact.** A user asking about something the corpus does not cover can receive an answer written from the model's memory, citing a listed document, released on one model verdict.

**Fix.** Skip `resolveAnswerFrame` entries in `validateAnswerUrls`, as `validateAnswerQuotes` already does. Replace the guard with an exported predicate that excludes the routing entry, and return no source entry when a `getAmendments` result names no document. Withhold before any model call when no source passes and the answer cites a link or long quotation, so abstentions still release. Replace the `sources: []` test with routing-only, empty-amendments and routing-only abstention fixtures.

*What is and is not established: Shown with routing-only evidence and a stubbed clean verdict. Frames with no section bodies are unusual, and their frequency was not measured.*

Where: `packages/agent/src/processors/verifier/run.ts:126`, `packages/agent/src/processors/verifier/answer-validation.ts:171`, `packages/agent/src/processors/verifier/evidence.ts:321`, `packages/agent/tests/answer-release.test.ts:56`

### SAFE-10 · Planner injects a '60-day review cycle' directive whenever federal text contains '60 days'

**medium** · effort S · wrong-answer risk, needless complexity, test gap

For every federal-authority frame, `federalCoreConditions` (`packages/agent/src/processors/answer-frame-planning.ts:528-540`) scans all section text and, on the bare substring '60 days', adds a system directive to include a '60-day review cycle'. The labels paraphrase one golden reference answer for 42 CFR 440.70. In the local July 2026 graph, 111 of 3,779 federal sections contain '60 days' and only 5 also mention a plan of care. All three saved 22 September 2026 answers to one unrelated question, and a baseline answer to another, spend a paragraph denying a 60-day review cycle.

**Impact.** Users get an unexplained paragraph rebutting a rule they never asked about. A more literal model could assert the rule, with '60 days' in the cited section for the verifier to match.

**Fix.** Delete `federalCoreConditions`, the `coreConditions` context field and the rule at lines 586-589; do not keep a variant gated on 440.70. Add a planner unit test that a federal frame whose supporting section contains '60 days' yields a checklist with no '60-day' or 'plan of care' text. At the next qualification run, check the home-health question for regression and confirm the unsolicited rebuttal is gone.

*What is and is not established: No saved answer asserts a false 60-day rule; that risk is inferred. Section counts come from the older July 2026 graph.*

Where: `packages/agent/src/processors/answer-frame-planning.ts:536`, `packages/agent/src/processors/answer-frame-planning.ts:587`

### SAFE-11 · Keyword-only fallback retrieval is invisible to the answer frame, release record and evaluations

**medium** · effort M · evaluation validity, reliability, wrong-answer risk, privacy

When the Voyage embedding call fails, `embedQuery` (`packages/agent/src/policy-corpus.ts:120`) returns an empty vector and retrieval continues on keywords. `searchSections` reports this per call, but the forced `resolveAnswerFrame` call does not, so the mode never reaches the model's plan, the signed release record or evaluation output, and the masthead banner reads a process-wide flag that the next successful embed resets. Three related gaps: the agent never checks that its embedding model matches the graph's, user-edited research sub-questions skip the client-identifier screen, and prompt-injection detector failures surface only through `console.warn`.

**Impact.** During a Voyage outage, users receive answers built from thinner evidence under a normal verified badge, and the owner can record a keyword-only benchmark and read it as hybrid.

**Fix.** Run `resolveAnswerFrame` inside the retrieval-mode context, keep the scoped mode sticky once degraded and return `retrievalMode` in its output schema; test a frame whose first embed fails and second succeeds. Fail command-line evaluation runs after any degraded embed. Have `/readyz` compare the embedding model stamped on the release node with the agent's. Screen edited research sub-questions with `findSensitiveIdentifiers`, and log detector failures.

*What is and is not established: Derived from code reading and local probes; no embedding outage was observed in production, so the thinner-evidence impact is inferred.*

Where: `packages/agent/src/policy-corpus.ts:120`, `packages/agent/src/tools/answer-frame.ts:101`, `packages/pipeline/src/pipeline/release.py:296`, `packages/agent/src/deep-research/routes.ts:87`

### SAFE-12 · Product tells people to seek local help but names no contact anywhere

**medium** · effort S · user experience, release gate, live failure

`packages/agent/src/prompt.ts:22` tells the model to route personal cases to the local Department of Social Services (DSS) or legal help, but names no office, number or link. The release gate rejects any link outside retrieved sources and the `medicaid.ncdhhs.gov` root (`packages/agent/src/processors/verifier/answer-validation.ts:149`), so a referral link is stripped on correction or the answer is withheld. The web application has no help contact: notices say 'Verify critical details with NC DHHS' with no link, and every dead-end message says to try again. Of 548 saved answers, 2 mention DSS and none legal aid.

**Impact.** A beneficiary holding a termination notice gets a cited answer, a block or 'try again', and is never told where to get free help.

**Fix.** Add one human-reviewed static 'Get help' constant in the web package holding the county DSS directory, the NC Medicaid Ombudsman and the Legal Aid of NC helpline, dated when last verified. Link it beside Terms and render it in every dead-end box. Reword 'Verify critical details with NC DHHS' to say who decides, and fix 'contact support' in `error.tsx`. Afterwards, and as a pair, add the two referral pages to `ALWAYS_ALLOWED_URLS` and a matching exemption to the verifier prompt.

*What is and is not established: The missing contacts are observed in source. Link stripping was shown with a stubbed verifier; live model behaviour was not run.*

Where: `packages/agent/src/prompt.ts:22`, `packages/agent/src/processors/verifier/answer-validation.ts:149`, `packages/agent/src/processors/verifier/run.ts:122`, `packages/web/src/components/MessageList.tsx:166`

### SAFE-13 · No path shows 988 or 911 to a user in crisis

**medium** · effort S · user experience, test gap

No source file in the agent, web, contracts or policy-corpus packages mentions 988, 911, suicide or crisis. A message such as 'I want to kill myself. They cut off my Medicaid.' receives the off-topic block (`packages/agent/src/processors/scope-gate.ts:98`), a policy answer or the withheld notice. If the model adds a crisis link, the release gate cannot release it: only `medicaid.ncdhhs.gov` is exempt from the source-link rule, so the link is stripped on correction or the whole answer is withheld.

**Impact.** A beneficiary in distress after losing coverage, or describing a medical emergency, may be told only to ask a Medicaid question or try again.

**Fix.** Add one permanent sentence to the composer helper line in `packages/web/src/components/ChatInput.tsx` and to the site footer: 'In an emergency call 911. Thinking about suicide or in crisis? Call or text 988.' Append it to the off-topic message at `scope-gate.ts:98` and assert '988' in `scope-gate.test.ts`. Add a web test that the line renders with and without messages. Do not change the withheld text or add an aborting processor. Decide whether the line also appears beside the three help contacts.

*What is and is not established: Absence is observed in source. What the live classifier and models do with a crisis message was not tested. Verification lowered the reviewer's high to medium.*

Where: `packages/agent/src/processors/scope-gate.ts:98`, `packages/web/src/components/ChatInput.tsx:131`, `packages/agent/src/processors/verifier/answer-validation.ts:149`, `packages/contracts/src/schemas.ts:90`

### SAFE-14 · Verifier evidence omits the supersession details that `lookupPolicy` tells the model to relay

**medium** · effort S · release gate, reliability, test gap

`extractLookupPolicy` renders each document through `formatDocMeta` (`packages/agent/src/processors/verifier/evidence.ts:208`), which has no supersession field, so the replacement policy, reason and tool-built link never reach the verifier, and that link is flagged as unknown unless the replacement was retrieved separately. The tool description tells the model to relay exactly this. It affects two Code of Federal Regulations (CFR) stubs in the local July 2026 graph, 45 CFR 74 and 75, which one golden question targets. The evidence formatters use hand-copied result types that have drifted from the tool schemas.

**Impact.** An attorney asking what 45 CFR Part 75 requires gets the true statement that it was replaced stripped from the answer, or the whole turn withheld. No wrong answer is released.

**Fix.** Render the supersession (replacement policy and title, effective date, reason, citation link) in `extractLookupPolicy`; `validateAnswerUrls` then accepts the link without further plumbing. Type the extractors from each tool's `outputSchema` and add a drift test that every output field is rendered or explicitly excluded. Add a regression test that a superseded lookup yields no unknown links, and re-check golden question q-041 with private capture.

*What is and is not established: Limited to two superseded federal stubs in the older local graph. No wrong answer is released, and the golden question was not re-run.*

Where: `packages/agent/src/processors/verifier/evidence.ts:208`, `packages/agent/src/processors/verifier/evidence.ts:103`, `packages/agent/src/tools/lookup.ts:12`, `packages/policy-corpus/src/primitives/policy-lookup.ts:96`

### SAFE-15 · Verifier keeps the retired rewrite design, and its confidence dot can contradict the badge

**medium** · effort S · needless complexity, user experience, test gap

The gate now either releases exact text or withholds, but the verifier still carries the earlier marker design: `renderCorrectedAnswer`, `replaceFinalAnswerText`, the `validatedAnswer` outputs and two fallback flags hard-coded false have no production use, and about 130 test lines exercise only them. The confidence score is still streamed and accumulates first-pass link and quotation failures, so a corrected answer that passed its recheck can show 'medium (75%)' in `packages/web/src/components/SourcesPanel.tsx` beside a green verified badge; the dot also disappears on reload.

**Impact.** A user sees a precise-looking confidence percentage the mechanism cannot support. A maintainer reading the tests concludes fabricated links are demoted and marked, which production no longer does.

**Fix.** Remove the confidence dot from `packages/web/src/components/SourcesPanel.tsx` and stop streaming `confidence`, `severity` and `counts` at `packages/agent/src/processors/verifier/processor.ts:88-89`, updating the web, gallery and end-to-end tests together. Delete `renderCorrectedAnswer`, `extractMissingCitations`, `replaceFinalAnswerText` and their tests. Remove `validatedAnswer` only by converting the two `.replace()` callbacks to `matchAll` loops, because those callbacks also populate `unknownUrls` and `unknownQuotes`. Keep the marker check in `packages/agent/src/processors/verifier/run.ts`.

*What is and is not established: The contradiction between the dot and the badge is derived from the code; it was not run in a browser.*

Where: `packages/agent/src/processors/verifier/answer-validation.ts:282`, `packages/agent/src/processors/verifier/processor.ts:88`, `packages/agent/src/processors/verifier/run.ts:144`, `packages/web/src/components/SourcesPanel.tsx:62`

## Low severity

### SAFE-16 · Verifier outages withhold finished answers under the same notice as grounding failures

**low** · effort S · reliability, user experience, documentation, cost

Each verifier pass is one 30-second attempt (`packages/agent/src/processors/verifier/verify.ts:97-98`), a documented choice. The web shows a verifier outage and a grounding failure with the same sentence, and `docs/architecture/README.md:21` describes chat retries that do not exist.

**Impact.** A user who waited through a full answer must ask again without learning the failure was an outage, and the owner pays for generation twice.

**Fix.** Give `reason === 'unavailable'` its own wording at `packages/web/src/components/MessageList.tsx:166` and in `packages/agent/src/processors/verifier/run.ts`, and correct `docs/architecture/README.md:21`. Leave the single attempt, the 30-second limit and the two-pass ceiling as they are, as issue #188 requires, and complete its timeout diagnosis first: record per-pass latency and evidence size in the private capture and classify each timeout.

*What is and is not established: Reproduced with a stubbed provider error. Project records show verifier timeouts but no such provider error.*

Where: `packages/agent/src/processors/verifier/verify.ts:98`, `packages/agent/src/processors/verifier/run.ts:117`, `packages/web/src/components/MessageList.tsx:166`, `docs/architecture/README.md:21`

### SAFE-17 · Deep-research plan card shows unchecked planner statements before approval

**low** · effort S · user experience, release gate

The planner's free-text brief and rationales are rendered verbatim on the approval card (`packages/web/src/components/DeepResearchView.tsx:61`), and `packages/agent/src/deep-research/agents.ts:49` tells the planner to pin down effective date and policy version. Nothing labels the text as unchecked.

**Impact.** An attorney may read a model-stated policy version or effective date on the plan card as settled before any source has been gathered.

**Fix.** Have the planner state scope choices as assumptions to confirm, and not state coverage outcomes, limits or amounts (`agents.ts:49`). Add one line under 'Proposed research plan' saying the plan has not been checked against sources. Remove `brief` from the public report object at `packages/agent/src/deep-research/workflow.ts:487`, which no client renders.

*What is and is not established: What a live planner writes in a brief was not observed. Showing the plan is the approval gate's documented purpose, so verification lowered this from medium to low.*

Where: `packages/agent/src/deep-research/agents.ts:49`, `packages/web/src/components/DeepResearchView.tsx:61`, `packages/agent/src/deep-research/workflow.ts:487`, `packages/agent/src/deep-research/repository.ts:78`

### SAFE-18 · A question can imitate the verifier's evidence block

**low** · effort S · security, release gate, test gap

`verifyAnswer` interpolates the question, answer and source text under markdown headings (`packages/agent/src/processors/verifier/verify.ts:111`). A captured request showed a forged 'SOURCE DOCUMENTS' block ahead of the real one. A probabilistic injection classifier runs first.

**Impact.** Only the user asking the question can plant the text, so the harm is a verified badge on a self-planted claim that can then be screenshotted or forwarded.

**Fix.** Wrap the question, answer and source sections in markers carrying a per-request random nonce, and add a short paragraph to the system prompt saying only text between the source markers is evidence. Add a test in `packages/agent/tests/processors/hallucination-verifier-guards.test.ts` that a planted header stays inside the question markers and the nonce differs between calls.

*What is and is not established: Whether the verifier model is fooled by the forged block was not tested.*

Where: `packages/agent/src/processors/verifier/verify.ts:111`, `packages/agent/src/chat-route.ts:49`, `packages/agent/src/index.ts:160`

### SAFE-19 · Step-limit forced synthesis stores a spurious 'not verified' notice in history

**low** · effort S · release gate, user experience, test gap

`processOutputStep` releases onto the last assistant message (`packages/agent/src/processors/verifier/processor.ts:86`). At 97 or more tool steps Mastra adds a separate feedback message, which the storage guard converts into the 'not verified' notice.

**Impact.** After a reload, a user sees an extra bubble telling them to rerun a question whose answer did pass verification. A chat turn rarely runs that long.

**Fix.** Pick the release target as the last current-turn assistant message whose `metadata.completionResult` is unset, and strip text and reasoning from every other current-turn assistant message. Add a real-Mastra test with a small `maxSteps` and a feedback-returning `onIterationComplete`, with observational memory on and off, asserting one signed assistant text part and no `unverified_history` outcome.

*What is and is not established: Needs a chat turn of 97 or more tool steps, which is rare. No unverified text is released.*

Where: `packages/agent/src/processors/verifier/processor.ts:86`, `packages/agent/src/index.ts:186`

### SAFE-20 · Threads whose observational memory predates the release gate never rebuild it

**low** · effort S · reliability, cost, privacy, test gap

`installMemoryReleaseGate` hides observational-memory records without `answerReleaseVersion` (`packages/agent/src/answer-release.ts:60-63`), but the store keeps returning the legacy row, so each lookup inserts a record that is never read back. Retention never deletes these rows.

**Impact.** Memory stays off on those threads and the owner may pay for repeated observer calls. Nothing unverified is recalled.

**Fix.** Change the wrapper so that, when the returned record lacks `answerReleaseVersion: 1`, it calls `memory.clearObservationalMemory(threadId, resourceId)` and returns null. Extend `packages/agent/tests/answer-release.test.ts` to assert that a second get-or-create returns the same record and the table holds one row for the key. Delete observational-memory rows for expired threads in `runRetention`, and correct `docs/operations/answer-release-and-recovery.md:11`.

*What is and is not established: Reproduced in a temporary database; repeated paid calls are inferred. The 2 October 2026 production snapshot holds six such threads, all on test accounts.*

Where: `packages/agent/src/answer-release.ts:60`, `packages/agent/tests/answer-release.test.ts:95`, `docs/operations/answer-release-and-recovery.md:11`

### SAFE-21 · Client disconnect cannot cancel verification because Mastra never passes the abort signal

**low** · effort S · dependency, cost, test gap

`processOutputStep` destructures `abortSignal` (`packages/agent/src/processors/verifier/processor.ts:64`), but `@mastra/core` 1.58.0 never supplies it, so a client disconnect cannot cancel either verifier pass.

**Impact.** The owner pays for up to two 30-second verifier calls per abandoned request. Users are unaffected: the checked answer is still saved to history.

**Fix.** Decide the behaviour first. To let verification finish, remove the unused `abortSignal` pass-through and comment that Mastra does not supply it. To cancel instead, put `c.req.raw.signal` on the server-owned request context in `packages/agent/src/chat-route.ts`, treat a caller abort separately from a timeout so it is neither logged as `verifier.failed_closed` nor stored as withheld, and test an abort after the 'verifying' chunk.

*What is and is not established: Shown with stubbed verifier passes that ran to completion after an abort; the cost per abandoned request is inferred.*

Where: `packages/agent/src/processors/verifier/processor.ts:64`, `packages/agent/src/processors/verifier/verify.ts:97`, `packages/agent/src/chat-route.ts:114`

### SAFE-22 · Verifier prompt order makes the recheck pass re-bill all evidence uncached

**low** · effort S · cost

The verifier message is ordered question, answer, sources (`packages/agent/src/processors/verifier/verify.ts:111`), so the recheck shares only the 1,571-token system prompt with the first pass and re-bills 5,000 to 13,000 evidence tokens uncached.

**Impact.** The owner's budget only: roughly $0.005 per question in a sample where two of six questions needed a recheck.

**Fix.** Treat this as opportunistic. When the verifier prompt is next changed or re-qualified under issue #188, order the message as question, sources, answer, then deterministic findings, and make `buildSourceText` emit an order that does not depend on the candidate. Confirm the saving from cached-token usage on the second pass, and keep the current order if verifier quality regresses.

*What is and is not established: The cost figure comes from a six-question sample on 3 October 2026. Whether reordering changes verifier quality is untested.*

Where: `packages/agent/src/processors/verifier/verify.ts:111`, `packages/agent/src/processors/verifier/evidence.ts:467`
