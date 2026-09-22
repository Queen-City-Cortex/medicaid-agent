# Live validation of verified answer release

## Protocol and provenance

Compare the release gate at `fce8923` against its baseline, `93d9b34`, using the same local Neo4j corpus and provider configuration. The baseline has a timing-only patch around its existing verifier so verification latency can be compared; its answer-generation and verification behavior is unchanged.

Both versions process the same 50 questions sequentially, with the two runs executing concurrently. Each has a separate SQLite database, result root, and in-memory observability store. The agent is `gpt-5.6-terra`, verifier `gpt-5.4-mini`, judge `claude-sonnet-4-6`, and query embeddings `voyage-4` with 1,024 dimensions. The agent subprocess timeout is 240 seconds. Provider and judge sampling remain nondeterministic, so a single question's score change requires inspection and, where needed, a repeat.

The local graph contains 7,589 documents, 71,695 sections, and 11,477 chunks; its vector and full-text indexes are online. It predates the immutable document-ID migration and has no corpus release identity. The current 55-question golden dataset has 112 missing document/section references on this graph. The dataset immediately before `baa9f38` has 50 questions and passes all schema and reference-integrity checks. Its question text, expected answers, difficulty, and reasoning type match the current dataset's `q-001` through `q-050` exactly. That matching historical dataset is used for both runs.

This comparison does not validate the five newer beneficiary-guidance questions or live research recovery against a tagged corpus release. It does not alter the corpus. Research checkpoint replay, corpus/version guards, leases, cancellation, approval, and bounded retries are separately covered by real Mastra execution with temporary SQLite and mocked providers.

## Integration checks

All nine previously skipped Neo4j integration tests passed against a separate disposable Neo4j `2026.05-community` container. The container was removed afterward; the benchmark corpus was untouched.

## Results

The initial complete comparison found:

| Measure | Baseline | Initial release gate |
|---|---:|---:|
| Questions | 50 | 50 |
| Overall mean (0–3), including withheld answers | 2.70 | 1.92 |
| Released answers | 50 | 35 |
| Passed / corrected / withheld | Not recorded | 22 / 13 / 15 |
| Withholding rate | 0% (no enforced gate) | 30% |
| Overall mean on the same 35 released questions | 2.743 | 2.743 |
| Median verification latency | 2.52 s | 5.06 s |
| p95 verification latency | 15.52 s | 16.63 s |

The baseline published every answer, including 28 verifier rewrites, and has no enforceable `passed`/`corrected` outcome. Its published answers are not verified releases. The initial gate withheld eight answers for unsupported claims, five for unusable corrections, and two for invalid citations. Neither full run had agent or judge errors or verifier outages.

## Fixes informed by live validation

The initial comparison exposed three correctness gaps and one calibration problem. The CLI's unexpected-exception path could print the original draft; it now returns the fixed withholding explanation, including when evidence extraction fails. Deterministic checks now cover bare/autolink/reference URLs and block quotations, and routing hints cannot authenticate quotations.

The answer planner returns actual corpus section bodies alongside routing advice. Previously, the entire combined block was labeled as non-evidence, causing the verifier to dismiss source text the answering agent had actually read. The extractor now emits those corpus sections separately, deduplicates their IDs within the frame, and keeps routing reasons out of their evidence text. A short correction also no longer fails merely because it is below 40% of the original draft's length: removing unsupported material can make an answer much shorter, and the exact correction still must pass its independent recheck.

Captured verification passes also showed false missing-citation findings and unsupported-claim entries whose own explanations said the claims were supported. The verifier now uses `gpt-5.6-terra` with low reasoning effort and explicit instructions to recognize existing links and supported paraphrases. The required 30-second deadline, no SDK retries, two-pass ceiling, and release criteria are unchanged. Private diagnostics accepted a supported correction, rejected a fabricated enrollment fee, and detected missing citations within that deadline. A stronger model alone was insufficient: an earlier ten-question diagnostic still withheld three answers, including two timeouts.

## Complete final comparison

The complete rerun at `1d93d60` used two isolated 25-question batches containing alternating questions from the same dataset. All 50 questions had valid agent and judge results. There were no verifier outages.

| Measure | Baseline | Final full run |
|---|---:|---:|
| Overall mean, including withheld answers | 2.70 | 2.60 |
| Passed / corrected / withheld | Not recorded | 35 / 13 / 2 |
| Withholding rate | 0% (no enforced gate) | 4% |
| Overall mean on the same 48 released questions | 2.708 | 2.708 |
| Factual accuracy on those 48 questions | 2.771 | 2.792 |
| Hallucination score on those 48 questions (higher is better) | 2.562 | 2.646 |
| Citation quality on those 48 questions | 2.729 | 2.792 |
| Median verification latency | 2.52 s | 4.86 s |
| p95 verification latency | 15.52 s | 24.22 s |

These are single-run observations, not evidence of statistical significance. Additional diagnostic calls overlapped the initial runs, but none overlapped the final two-batch run. Latencies are observational under concurrent load, not an isolated performance experiment. Verification latency includes both passes when a correction is required; the deadline remains 30 seconds for each pass.

Two released answers scored lower than baseline: `q-028` (completeness/citation specificity) and `q-047` (emphasis between related federal provisions). Both received a hallucination score of 3, and the matched released-answer mean remained unchanged. Those scores are retained without selective reruns.

## Deterministic quotation repair

The final full run withheld `q-036` and `q-050`. Both had a clean model verdict but one deterministic quotation failure; because the model returned no correction, the gate correctly withheld them as unusable corrections. These were the only two questions with deterministic URL/quotation findings in the complete rerun.

Commit `d52b284` moves the deterministic findings into the verifier's input before its first pass. The verifier must repair or remove unmatched quotations/URLs, then the gate rechecks that exact correction. The other 48 recorded cases follow the same prompt path because their deterministic findings are empty. A regression test proves that a model-clean but quotation-invalid draft receives a correction and independent recheck, with no third pass.

Both affected questions scored **3/3 on every judge dimension** after the quotation-feedback change, with released answers. Their results are stored separately as `quote-repair-regressions.json`; the full-run results and its 4% withholding rate above remain unchanged as the historical measurement. No complete 50-question rerun was performed after this final targeted fix.

The implementation passes 387 agent tests, all nine real Neo4j integration tests, 271 web tests, four contracts tests, and 38 mocked browser tests. Local builds/type checks/lint pass; PR CI also validates the full monorepo, mocked browser suite, and production Docker images.

## Review and deployment boundary

The implementation is ready for review in PR #133. The complete comparison shows unchanged overall quality on matched released answers and higher observed verification latency; the two remaining deterministic-quotation failures now pass their targeted regressions. Keep verification enabled and monitor production withholding reasons and latency.

The production preflight below establishes the active release identity, but the current 55-question dataset still cannot be validated against that graph. Deployment remains blocked on an appropriate current corpus. This work does not merge or deploy the PR.

Full snapshots, the matching dataset, the timing-only baseline patch, and provenance are in [`milestones/2026-09-22-verified-release`](../../packages/pipeline/data/eval-results/milestones/2026-09-22-verified-release/).

## Tagged production corpus preflight

Read-only checks on 2026-09-22 confirmed that the production agent and graph agree on `legacy-20260725-ae8595c`. The graph's `CorpusRelease` is marked `bootstrap`, with target color `legacy`. It contains 6,725 documents, 67,457 sections, and 6,640 chunks; all indexes are online. This is a different corpus from the local graph used for the complete comparison above.

All **112 evidence references in the current 55-question dataset are missing** from the production graph. All **104 references in the matching historical 50-question dataset exist**. A valid release identity and healthy indexes do not establish compatibility with the current benchmark.

Railway currently serves the legacy `neo4j` service. The `neo4j-blue` and `neo4j-green` service definitions have no deployments, and `corpus-job` has no active deployment and reports a failed status. Bootstrapping a candidate corpus, validating it, and promoting it remain operational prerequisites; no production graph, service configuration, or application database was changed during these checks.

Targeted follow-up checks use private SSH transport and isolated local SQLite databases. An initial transport opened one SSH session per pooled Bolt connection and reached Railway's connection limit; that run is excluded from comparison. The replacement transport multiplexes connections through one SSH session. No public Neo4j endpoint was created.

The matched five-question follow-up at `bbc3a67` covers `q-001`, `q-028`, `q-036`, `q-047`, and `q-050`. Every answer scored 3/3 overall on both baseline and candidate. All five candidate answers passed verification in one pass, with no withholding, agent errors, judge errors, or verifier outages. Median verification time was 1.74 seconds for baseline and 2.74 seconds for candidate. The two batches overlapped each other and research-smoke provider calls; these timings are observational. This targeted sample does not replace the full benchmark or validate the five newer beneficiary questions.

The live research interruption check exposed an overly broad terminal-error rule: a transient `ECONNRESET` whose message mentioned saving a checkpoint was classified as checkpoint incompatibility. The rule now requires an explicit incompatibility message. Eight classification regressions and the existing real-Mastra interruption suite cover this case, including nested network causes and incompatible versions that must remain terminal.

After that fix (`5f7ab7b`), the live research smoke passed against the tagged production graph with real providers and temporary local SQLite. It interrupted once immediately after the worker checkpoint and again immediately after the first report-verification checkpoint. Automatic retries ran after 30 seconds and two minutes. Three internal Mastra executions kept one public run ID, the same approved question, and the original limits. Planning, the worker, and synthesis each ran once; replay also reused the saved verifier pass. Usage recorded only three actual verifier calls: one worker check and two report passes. Consumed step counts remained 2/6 for planning, 7/16 for the worker, and 1/1 for synthesis. Public report data stayed empty until the corrected report passed its recheck.

This narrow live smoke used one approved question and zero reflection rounds. The broader interruption, reflection, cancellation, lease, quota, cleanup, and corpus/version matrix remains covered by the mocked-provider real-Mastra tests. The standalone live harness emitted a SQLite WAL-checkpoint warning during shutdown because its application connection was still open; all workflow assertions had passed, and the saved reproduction harness closes that connection first.

The final agent suite has 387 passing tests; the agent production TypeScript build, test type checks, and lint also pass. The saved production preflight, matched answer snapshots, failed-before-fix and successful research summaries, and standalone smoke harness accompany the earlier benchmark artifacts. Deployment remains blocked on the current corpus benchmark; this follow-up neither repairs nor promotes a production corpus.

## Review follow-up

Supplementary web search now retains the actual retrieved excerpt in private worker and synthesis checkpoints. Both worker and report verification use that evidence; a URL and title without an excerpt cannot authorize a claim. Public reports expose only source titles and URLs. The real-Mastra/temporary-SQLite suite covers successful web-evidence release and withholding when the excerpt is missing.

Citation provenance now records retrieved URLs separately from globally allowed reference links. Research restoration is scoped by authenticated user, removes inaccessible saved runs, and ignores responses arriving after an account switch. The web Railway watch list includes the contracts workspace.

Validation after these fixes: 390 agent tests, 277 web tests, four contracts tests, and 38 mocked browser tests passed. The agent production build and agent/web type and lint checks passed. The new web-evidence tests use mocked providers and do not replace the previously recorded live answer comparison. Current-corpus bootstrap remains in progress and neither application PR deployment nor graph promotion has occurred.

A follow-up authority check assigns web evidence a server-created supplementary role, with system instructions that forbid using it alone for governing policy claims. A live two-case diagnostic rejected a fabricated policy fee supported only by a web excerpt, removed it, and passed the corrected text on recheck (12.59 s total). Explicitly labeled research context passed in one check (2.55 s). These are narrow diagnostic cases, not a benchmark rerun. The corpus-only verifier prompt is unchanged.
