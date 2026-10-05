# Working artifact from the round-two critic-release-path-walkthrough review

I walked the path from `corpus-release.sh bootstrap` to a promotable manifest (37 fail-closed stops, tabulated in the appendix), read the release, audit, scope, identity and backup modules in full, and ran four scratch probes. Fine: the CFR stage completes through the real client today (43 of 43 parts, one DIV5 each, 3,457 sections, title files of 2.9, 23.0 and 13.8 MB, all 21 golden CFR references resolve); issue #188's 406 line predates the fallback commit by about an hour. The legacy identity scan was re-verified by the owner on October 3, and the two snapshot-hash implementations agree. Failing today: the statute stage (uscode.house.gov still serves a maintenance page), the four #187 sources, freshness (no crawl since September 22), the judge credential, the missing baseline and the unmeasured evaluation gates. New: answer-scope approvals cannot coexist with the scheduled job; GovInfo publishes current USLM statute compilations for Titles XIX and XXI that would unblock the statute stage and remove two statute-parsing highs; the graph reset is never confirmed and nothing gates extra graph content; scope acceptance, cutover and restore hinge on unrepeated verifier outcomes; release inputs are validated after the wipe-and-embed. The appendix reconciles the cutover and retention fixes into one design, classifies the 45 highs (28 code-only, 8 rebuild, 6 paid evaluation, 3 owner decision; one rebuild suffices, plan two) and gives the shortest ordered path.

## A. Fail-closed stops from `corpus-release.sh bootstrap` to a promotable manifest

Status is for 2026-10-05, from the repo's October receipts, the scratch probes, or marked unknown. Line numbers: `crs` = scripts/ops/corpus-release.sh, `cli` = packages/pipeline/src/pipeline/cli/release.py, `rel` = packages/pipeline/src/pipeline/release.py.

| # | Stop | Fails when | Today |
|---|---|---|---|
| 1 | Job wrapper (railway-corpus-job.sh:197-208, 307-322) | unknown mode, lock held, no recovery-journal directory | not failing by receipts |
| 2 | validate_runtime (crs:21-34) | synthetic account, WorkOS, railway/curl/jq/rclone or venv missing | unknown (service variables not inspected) |
| 3 | Baseline variable (crs:310) | unset | **failing**: no legacy baseline exists (run-matrix `NOT_RUN`) |
| 4 | Target colour and typed confirmation (crs:312-322) | operator input | n/a |
| 5 | Colour URI/password; agent URI differs from target (crs:324-335) | missing variable, or target is the serving graph | expected to pass |
| 6 | release-retention-check (crs:337-342) | colour retained | passes (no promoted manifest) |
| 7 | RAILWAY_GIT_COMMIT_SHA (crs:344) | unset | likely unset in an uploaded maintenance container ("Uploaded deployment metadata does not carry a Git commit hash") |
| 8 | redeploy_graph (crs:348, 291-305) | no redeployable deployment; not SUCCESS in 600 s; Bolt not ready in 300 s | blue had a SUCCESS deployment on 2026-10-02; green had none |
| 9 | Manifest validation (rel:85-93) | bad id, sha or colour | n/a |
| 10 | Parse stage: require_downloaded_sources (cli:42) | required row with no payload, minus valid scopes | **failing**: rows 11805 and 11806; production scope not applied |
| 11 | Parse stage: scope approvals valid (answer_scope.py:272) | scope rows plus any change | n/a today; see finding 1 |
| 12 | Parse stage: require_documented_removals (cli:43) | undocumented removal | passes by receipt (0 undocumented, 152 retirements) |
| 13 | Parse stage: strict parse (cli:44-59) | any blocking required failure or an incomplete run | **failing**: rows 875 and 1905; no complete strict parse on current code is on record (the October 3 run was stopped part-way through 4,504 inputs); 696 fee workbooks must be re-parsed under the new representation |
| 14 | Build: schema (rel:211-215) | Neo4j error | unknown |
| 15 | Build: load (rel:216-223) | reset or any document error | unknown; see finding 5 |
| 16 | Build: cfr (rel:224-231) | any of 43 parts fails | **passes** (scratch run 09:14Z) |
| 17 | Build: ssa (rel:232-239) | either subchapter fails | **failing** (maintenance page 09:15Z; cache 114 days old) |
| 18 | Build: references, amendments (rel:240-249) | exception only | unknown |
| 19 | Build: embeddings (rel:250-254) | no Voyage key, no tokenizer asset, section without source epoch, provider failure after 5 attempts, coverage below 100% | unknown; the owner's own record says approved spend 0 and no budget gateway |
| 20 | Build: concepts, jevSections, schemaVersion | exception | unknown |
| 21 | Validate: baseline_metrics (cli:209) | baseline fingerprint differs from current code, models or catalog; baseline incomplete | **failing**: no baseline |
| 22 | Validate: evaluation_fingerprint (cli:211) | verifier disabled; EVAL_IDENTITY_CATALOG unset | variable not in the job configuration (finding 3) |
| 23 | Validate: parse inventory and snapshot unchanged (cli:215) | any corpus change since prepare | passes under the lock |
| 24 | Validate: audit (cli:241) | graph unreadable; invalid scope approvals | unknown |
| 25 | Validate: answerScopeAcceptance (cli:242-253) | any of 16 runs fails | only when scoped; see finding 4 |
| 26 | Validate: graphValidation (cli:254-258) | exception | unknown |
| 27 | Validate: retrievalEvaluation (cli:262-277) | run error | unknown |
| 28 | Validate: answerEvaluation (cli:281-296) | run error | **failing by receipt**: judge key HTTP 401 on both services (2026-10-04) |
| 29 | Validate: require_complete_results (cli:298) | not exactly 55 rows per level, any infrastructure-error row, mapping or catalog mismatch, missing verifier telemetry | unknown |
| 30 | Validate: fingerprint unchanged (cli:299-302) | code or environment changed mid-run | n/a |
| 31 | Gates: duplicate identities, missing loads, required parse exceptions, embedding coverage and dimensions, required families present (rel:577-620) | any non-zero or below 1 | never evaluated on a candidate |
| 32 | Gates: retrievalRecall >= 0.9, primaryDocumentHitRate >= 0.95 | below threshold | no retained run meets either (round one) |
| 33 | Gates: answerScore >= 2.75, hallucinationScore >= 2.5, aggregateRegression <= 0.15 | below threshold | last complete gated run scored 2.60 overall |
| 34 | Gate: freshnessSla (rel:680-686; no override in bootstrap) | any required family older than its SLA | **failing by receipt**: five required families last discovered 2026-09-22 |
| 35 | Gates: family and answer-ready count drops | versus previous manifest | pass trivially at bootstrap (nothing to compare) |
| 36 | graphReleaseMarker (cli:330-334) | Jev digest mismatch | n/a |
| 37 | After the manifest: sync, backup and restore receipt, activation preflight, smoke, browser receipt | several | not reached |

## B. CFR stage through the GovInfo fallback (question 2)

- Scratch copy of ecfr_client.py, parser.py, citations.py and identity.py (byte-identical), stub config with the cache in scratch. `fetch_part_xml(title, part, refresh=True)` then `parse_part_xml` for every entry in CFR_PARTS, counting errors as load_all_cfr does.
- Result at 2026-10-05T09:14Z: 43 parts loaded, 0 errors, 3,457 sections, 50 seconds, peak memory 313 MB. Every cache file has a CFRDOC root with exactly one DIV5 and stamped provenance.
- Requests per title: titles.json 200; versioner full text 406 ("This endpoint requires response compression"); GovInfo title file 200. Sizes 2,880,742 (title 2), 23,040,499 (title 42) and 13,788,852 bytes (title 45), all under the 64 MB cap and identical to the owner's October 3 probe.
- Against the workstation's April cache: 3,421 shared section numbers, 3,329 with identical normalised text, 92 changed, 36 new, 31 gone (mostly reserved ranges in 45 CFR 233 now kept as ranges).
- Golden dataset: 23 federal references (18 distinct ids); all 21 CFR references resolve in the GovInfo-derived sections; the 2 statute references are sections 1905 and 1915.
- Why #188 lists the 406s: its body was last edited 2026-10-03T21:35Z and describes the rehearsal at revision 46a91da, whose client had no fallback. The fallback landed in 1e32afc at 22:23Z, 71 minutes after that revision and 48 minutes after the issue edit. Later records (qualification-unblock: 43 fresh parts; qualification-cycle blockers: statutes only) supersede that line.

## C. Gate modules (question 3)

Can pass on incomplete or mismatched evidence:
- Extra graph content is not gated and the reset is unverified (finding 5).
- `requiredSourceFamiliesPresent` is satisfied by one document per required type (rel:330-376); at bootstrap both count-drop gates compare with nothing.
- The per-family `documents` count is a count of active registry rows, not of loaded documents (rel:408-420).
- Federal freshness SLAs in corpus-manifest.json (7 and 30 days) are never read; federal sources are checked for presence only (rel:338).
- Freshness trusts the crawler's stamp (round one crawler-03) and uses the clock at audit time.
- Status `error` rows are excluded by the loader, audit and release counts but included by the parser (round one pipeline-release-sources-01). On parse status, answer-ready and index classification the audit's `should_load` agrees with the loader.
- release-validate does not require passed build stages or a graph bound to its manifest (finding 5).
- The manifest's commitSha is whatever RAILWAY_GIT_COMMIT_SHA holds; code identity is still bound by the file-hash fingerprint.

Can fail for reasons unrelated to corpus quality:
- Statute outage; baseline fingerprint mismatch after any commit in four packages; unset catalog variable; judge credential; one infrastructure-error row among 110; verifier withholding in scope acceptance and smoke; the one-day bulletin SLA versus build duration; scope approvals after any change.
- The audit joins graph to registry on the raw source URL and then on the path (audit.py:364-367) while the loader stores the canonical URL (loader.py:452-456). On the workstation registry, which has not been through the crawler's URL migration, 1,715 of 4,575 rows differ from their canonical form and 4 pairs collide into duplicate ids. Production is expected to be canonical; not verified.

Checked and fine: the identity normaliser completed twice on the legacy graph on October 3 (78 seconds, 67,457 sections); the two snapshot-hash implementations (freshness.py and verify-corpus-backup.py) sort differently but agree because no family directory is a prefix of another, and the receipts show equal hashes.

## D. Load and embedding (question 4)

- Sound: each document is written in one managed transaction (corpus_writer.py:75-109); vectors and chunks are invalidated by source epoch (queries.py:48-72); embedding writes re-check plan and epoch (generator.py:66-81); the marker is written only by the last validate stage, and a committed reset removes the previous marker, so an interrupted build leaves an unmarked graph.
- Gaps: the reset is unconfirmed and extras are not gated (finding 5); three other writes are unconsumed auto-commit statements; every retry wipes vectors already paid for; the marker protects only annotated releases from later mutation (queries.py:194); `build-mixed-corpus` defaults to `--reset` with no serving-graph check (cli/build.py:372-376).

## E. One cutover and retention design (question 5)

| Question | Answer |
|---|---|
| Which record marks an unfinished cutover? | The candidate manifest named by the agent's CORPUS_RELEASE_ID while its promotionState is not `promoted`. Before the variable flip, one write stamps the previous manifest's supersededByReleaseId and rollbackWindowEndsAt and appends cutover_started to the candidate. No journal, no new state (the contracts enum stays as is). |
| Who restores it? | The next invocation of promote, cleanup or rollback, through the existing recover_failed_cutover with values derived from the manifests (previousReleaseId, the previous manifest's targetColor, NEO4J_<COLOR>_* variables), then a non-zero exit. `CORPUS_JOB_MODE=recover` runs the same function on demand. Restore success is deployment SUCCESS plus /readyz release id, not a chat answer. A recovery_pending manifest the agent does not name is ignored once the serving manifest passes the check. |
| Which deadline guards a reset? | rollbackWindowEndsAt only. A colour is not reset while a manifest of that colour has a future window, nor when the agent's URI or the graph marker names it. A block is a deferral: its own exit code (not 75), snapshot left unacknowledged, cleanup, mirror and backup still run. The owner sets rollbackWindowHours below the cron interval minus build time (for example 20) or accepts a release every other day. |
| Which implementation? | Bash until the first cutover, because bootstrap is next and should not be refactored first; fix replace:true on that path. After the first cutover delete release-activate-bootstrap and RailwayTarget so one implementation remains. A Python port is optional later. |

Tests each round-one option breaks (from reading):

| Option | test_release.py | test_railway_packaging.py | Elsewhere |
|---|---|---|---|
| ops-deploy-ci-04 (guard, recover mode, late window) | none | none | new fake-CLI tests needed |
| pipeline-release-sources-02 (window before the switch; mark-promoted only flips state) | 386-393 if mark_manifest_promoted stops stamping the previous manifest; 424-449 already models the early-window state and passes | none | none |
| pipeline-release-sources-07 (Python core, delete four bash functions) | 452-466 only if mark_manifest_recovery_pending is removed | 71-135 pass only while wait_for_railway_deployment and redeploy_graph stay in bash | all nine tests in test_bootstrap_activation.py move |
| pipeline-release-sources-03 and -09(c) (delete the seven-day retention) | 391-393 and 449 fail; 434 and 476 become dead setup; 16 and 479 fail if the function is renamed | 54-57 fail if the command is renamed | contracts schemas.ts:252 and schemas.test.ts:74 |
| ops-deploy-ci-09 (keep seven days, deferral code, cleanup first) | none | none | none |
| pipeline-release-sources-09(b) (drop the attempt counter) | 260, 270 | none | none |
| pipeline-release-sources-06 (never replace:true) | none | none | test_bootstrap_activation.py:192 |
| Reconciled design above, names kept | 391-393, 449 | none | contracts schemas.ts:252 and its test |

## F. The 45 highs by what they need (question 6)

- **Code-only deploy (28):** agent-deep-research-01, -02, -05; agent-processors-tools-01, -09; agent-verifier-01; contracts-seams-02; corpus-frames-01, -02, -03, -05; corpus-retrieval-02, -03, -04; crawler-03; e2e-01; mastra-installed-01; neo4j-live-05; perf-cost-reliability-01; prior-findings-02, -03; privacy-compliance-product-01; rag-design-02; security-appsec-01, -02; web-app-lib-02; web-components-ux-01, -03. Twenty-two of these change files under the four fingerprinted packages, so they should merge before the qualification freeze; the four web-only ones and e2e-01 are independent of the release, and crawler-03 must land before the crawl. agent-deep-research-02 is bounded by the #188 rule on verifier limits.
- **Reach users only through a corpus rebuild (8):** pipeline-parse-graph-01 (dates), pipeline-refs-federal-jev-01 and -02 (statute text and subsections), pipeline-release-sources-01 (error rows), crawler-01 (de-listed sources, after a crawl), crawler-02 (bulletins, after a crawl), corpus-retrieval-01 (the family must be in the serving graph), corpus-retrieval-05 (loader half).
- **Need paid evaluation to settle (6):** architecture-01, pipeline-eval-01, pipeline-eval-02, rag-design-03, rag-design-04, rag-design-05.
- **Owner decision or action first (3):** model-strategy-02 (model and effort, then an evaluation), pipeline-release-sources-03 (cadence), ops-deploy-ci-02 (unload the launchd job today).

Rebuilds: one promoted release carries all eight rebuild-dependent highs if their code lands and one crawl runs before the freeze. Plan for two full passes: an unpromoted measurement build to read the gates and regenerate ids, then the qualifying build. At the projected $13.66 that is about $27; it is about $230 if the 696 workbooks are not first re-parsed under the compaction. The $13.66 figure was projected under plan version 2; version 3 is unmeasured. Every failure after the embedding stage adds a pass because each attempt wipes the graph. Evaluation costs more than embedding: by the repo's cost scenario about $34 for one 55-answer run, about $43 for a scoped validate and $232 for the three paired runs #188 asks for.

## G. Shortest ordered path to a first promoted release (question 7)

0. Today, no code: unload the Saturday launchd job (ops-deploy-ci-02). It wipes the serving legacy graph.
1. Owner decisions in one sitting: statute source (finding 2); how #187 is cleared (finding 1 or the agency inquiries); evaluation gates and whether the legacy baseline stays (prior-findings-01, pipeline-eval-08, prior-findings-06); a spend cap on a dedicated evaluation project and a working judge key; rollback window and smoke rule (findings 4 and 6).
2. One pipeline and crawler change set before any crawl: crawler-02, crawler-03, pipeline-release-sources-01, pipeline-parse-graph-01, the statute adapter, the loader half of corpus-retrieval-05, GovInfo-only CFR, the scope binding change, the verified reset and extras gate, the preflight and bootstrap override file. crawler-01 can wait for the second release.
3. One agent and policy-corpus change set before the freeze, since these change answers and the fingerprint: the corpus-retrieval, corpus-frames, agent-processors-tools, agent-verifier and prior-findings items in group one of section F, the effort pin, and the security fixes.
4. In the maintenance container under the lock: crawl every family, strict parse to completion (re-parses the 696 workbooks, no provider cost), recovery-inventory at zero blocking failures.
5. Measurement build on blue, not promotable: build, one retrieval and one answer run, regenerate the identity catalog and the beneficiary-guidance golden ids, read every gate.
6. Set policy and dataset versions from step 5; freeze code, snapshot and models; encrypted backup and restore receipt.
7. If the legacy baseline is kept, run it; run the preflight.
8. Qualifying bootstrap build and validate on blue.
9. Activation with the receipt and the browser check, after replace:true is fixed (pipeline-release-sources-06).
10. Before enabling the cron: deploy green once, acknowledge the snapshot, set the catalog variable, and land the promote guard, the rollback-window reset guard and the deferral code.

The minimum for the first promotion is steps 0, 1, the crawler-02, statute, #187 and freshness parts of 2, the judge key, and steps 4 and 6 to 9. Step 5 is what makes step 8 likely to pass, because no retained measurement meets the current retrieval and answer gates.
