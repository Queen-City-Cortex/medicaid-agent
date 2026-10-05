# Working artifact from the round-two triage-ops review

I read all 196 minor notes in the eight scopes and opened code, docs or local logs for 52 that would be medium or higher if true. Two held at medium and one at low; those are the three findings.

The other 49 break down as follows:
- **Covered by round one (9):** verifier evidence truncation, evaluated-versus-shipped configuration, the loggers peer break, agent drain time, the eval-gate baseline ratchet, URL-only citation scoring and the regression-metric scale mix. Rollback's missing compensation and password check are another trigger of the label-trust mechanism in pipeline-release-sources-02.
- **Did not hold (11):** for example, the deployment wait polls by the returned deployment id, the Jev fetch interceptor is a no-op without its ledger variable and throws in production, and the "Lock-in Program" title is absent from the current registry.
- **True but low (27):** legacy laptop paths, one-time bootstrap paths, fail-closed behaviour, or a few dollars a month.
- **Could not be established (2):** both need the Neo4j instance, which this brief may not touch.

What turned out fine: the release smoke question is not systematically withheld (EPSDT rows were corrected in both committed gate runs), stale evidence cannot satisfy a gate when a release id is reused, and mixed timestamp formats in `last_checked_at` affect only same-day ordering.

The advisor tool was rate-limited, so the approach had no second opinion. The repository is unchanged.

## Triage ledger

196 notes read; the 52 below were checked against code, docs or local logs. The rest were style, naming, documentation drift or duplication.

| Scope | Note (abridged) | Outcome | Basis |
|---|---|---|---|
| release-sources | Override file unbound; count gates relative only | **Promoted (finding 2)** | Probe with real gate functions |
| release-sources | Rollback: graph never stopped | **Promoted (finding 3, low)** | Cleanup predicate, release.py:975-979 |
| release-sources | Rollback: no compensation, no password check | Covered | Same label-trust mechanism and fix as pipeline-release-sources-02 and ops-deploy-ci-04 |
| release-sources | `release-mark-graph` stamps any manifest on any graph | Low | Operator-only command |
| release-sources | aggregateRegression mixes scales | Covered | pipeline-eval-08 |
| release-sources | Retention and cleanup scans skip unreadable manifests | Low | Manifests are written atomically (release.py:42-54) |
| release-sources | release-prepare overwrites a manifest when the release id is reused | Did not hold | Gates use the current run's in-memory results (cli/release.py:312-320); the variable is undocumented and unset by default |
| release-sources | One LLM answer decides cutover | Low | Committed gate runs: 2 of 50 withheld; both EPSDT rows corrected |
| release-sources | Bootstrap restore swallows exceptions; unrendered target check | Low | One-time path |
| release-sources | Previous graph password kept in activation state | Low | Only in the encrypted archive; the plaintext mirror list excludes it (sync-current-corpus.sh:44) |
| release-sources | Reactivated retirements still evidence-checked | Low | Fail-closed by design |
| release-sources | ISO timestamp written to `last_checked_at` | Did not hold | Affects same-day ordering only (registry.ts:244, 252) |
| release-sources | Audit stem-fallback match | Low | Loader enforces hash identity |
| release-sources | Audit `graph_error` exits 0 | Low | Confirmed at cli/audit.py:49-58 |
| release-sources | Registry opened without the immutable adapter | Low | The corpus-job volume is read-write |
| release-sources | Per-document classification revalidation | Low | Performance only |
| release-sources | Single-transaction graph delete | Not established | Needs the Neo4j instance |
| release-sources | Restore omits release-state | Low | One extra release after a volume loss |
| release-sources | Validation not bound to the production agent | Covered | rag-design-11, architecture-04, model-strategy-02, model-inventory-09 |
| pipeline-eval | Hard-coded results directory in eval-gate and eval-ab | Did not hold | ops.env sets no CORPUS_DATA_ROOT (names checked) |
| pipeline-eval | Citation level compares URLs only | Covered | prior-findings-02 |
| pipeline-eval | Missing request id treated as empty retrieval | Low | Bridge raises on malformed rows (agent_bridge.py:111-122); fails closed |
| pipeline-eval | `require_complete_results` ignores level | Low | Results come from in-process runs; only the bootstrap baseline could be mis-slotted |
| pipeline-eval | Retries on "database is down" answers | Low | Confirmed (answer.py:30-39); 0 of 2,778 stored rows record an attempt count |
| pipeline-eval | Run lookup by substring | Low | Ids are fixed-length timestamps |
| pipeline-eval | q-052 and q-055 date-bound keys | Low | Both are safety-acceptance keys |
| pipeline-eval | Policy 9 titled "Lock-in Program" | Did not hold | Current registry title is "Outpatient Pharmacy Program" |
| pipeline-eval | Judge sees only `answer.text`; 60 s timeout | Low | |
| ops-deploy-ci | Snapshot left on /data; temp copies | **Promoted (finding 1)** | Laptop logs |
| ops-deploy-ci | Stale lock keeps the dead-man switch green | Low | Legacy laptop tier, currently exiting 1 |
| ops-deploy-ci | Web has no healthcheck | Low | Already in ops-deploy-ci appendix D |
| ops-deploy-ci | Agent has no drain time | Covered | agent-server-08 |
| ops-deploy-ci | Account JSON posted to healthchecks.io | Low | No token-like keys in the payload |
| ops-deploy-ci | Cleartext bolt in deploy-data; proxy hook order | Low | Legacy path slated for removal |
| ops-deploy-ci | Eval-gate baseline ratchet | Covered | pipeline-eval-09 |
| ops-deploy-ci | SLEEPING treated as ready | Did not hold | Poll is by the returned deployment id (corpus-release.sh:275-278) |
| ops-deploy-ci | Daily full archive, 400-day retention | Low | Recorded archive is 2,688,632,782 bytes; about 1.08 TB steady state, about $16 a month at $0.015 per GB-month |
| ops-deploy-ci | Monthly eval with no gate; may use the production key | Low | `eval` never exits non-zero (cli/eval.py:57-60); about $9 per run; the release runbook omits EVAL_OPENAI_API_KEY |
| ops-deploy-ci | JOB_RUN_ID repeats | Did not hold | Used only in log lines |
| ops-deploy-ci | Compose ports on all interfaces | Low | Local development only |
| dependency-health | @mastra/loggers peer break | Covered | mastra-upstream-03; the build output pins exact versions |
| dependency-health | Enterprise gating differs between dev and production | Did not hold | Gates capability reporting, not token checks |
| mastra-upstream | Rename sends cached thread metadata | Low | Release signature lives on message metadata (answer-release.ts:25-31) |
| mastra-upstream | SSN separators | Low | Adjacent to privacy-compliance-product-01 |
| mastra-upstream | System-prompt leak in error responses | Low | Error chunks are rewritten (answer-release.ts:127) |
| model-inventory | Jev fetch interceptor in the env loader | Did not hold | No-op without JEV_VALIDATION_LEDGER; throws in production (validation-budget.ts:19-20) |
| model-inventory | usage_events pruned twice | Did not hold | Both paths use a positive retention |
| model-inventory | Fingerprint records only set model variables | Low | No model variables in local env files (names checked) |
| model-strategy | Float-list embeddings versus page cache | Not established | Needs the Neo4j instance |
| prior-findings | buildSourceText stops at the first over-budget block | Covered | agent-deep-research-02 |
| prior-findings | Re-run has no streaming guard | Low | |
| prior-findings | Source anchors not protocol-checked | Low | Not exercised |
