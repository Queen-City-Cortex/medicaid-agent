# Source audit and blue release decision — 2026-09-23 UTC

**Release blocked. Production remains on `legacy-20260725-ae8595c`; blue was not
rebuilt or activated, and corpus-job remains in effective maintenance mode.**
The final inventory has **19 required failures, 12 undocumented removals, and
313 optional failures**. The fixed fresh-authentication EPSDT batch passed two
of three attempts; the middle answer was withheld on a 30-second verifier timeout.
Neither source requirements nor verification limits were relaxed.

## Completed source work

The [per-source ledger](source-dispositions.json) covers all 141 selected original
sources and all 16 children discovered from the COVID administrative-letter index.
It retains canonical URLs, original registry state, evidence references, original
hashes where present, and each reviewed disposition. The
[complete inventory](source-inventory.json) includes all active failures, missing
payloads, retirement records and classifications.

- Applied 124 evidence-backed historical retirements, preserving original files
  and history. Together with the four prior records, there are 128 retirements.
  Reapplying reviewed actions returned the existing journal results.
- Classified the COVID page as an index only after recording and registering all
  16 document links. The official index establishes provenance for the exact
  `policies-inactive.ncdhhs.gov` hostname.
- Recovered one linked administrative-letter attachment under its exact source
  identity and imported its normal high-quality parse: 17 sections, no quality
  flags. The seven earlier successful recoveries remain intact. The
  [import record](recovery-import.json) and [parser manifest](recovery-import-manifest.json)
  preserve source/artifact hashes and parser fingerprints. Duplicate import reused
  output without incrementing the attempt count.
- Retained 171 unique SHA-256-checked live captures, official index investigations,
  redirect histories and restored registry history in the uploaded evidence bundle.
  A resumed collector reuses captures without changing availability or download counters.

The [exact blocker ledger](release-blockers.json) identifies every unresolved URL:

| Group | Count | Evidence and remaining requirement |
| --- | ---: | --- |
| Pharmacist standing order, registry 875 | 1 | Original URL redirects to a generic DPH page. No valid original/replacement payload or explicit withdrawal found. |
| Gujarati DHB-5097 form, registry 1905 | 1 | Official wrapper/index exists but supplies no usable attachment. Missing attachment is insufficient retirement evidence. |
| Archived 2025 MAGI wrappers, registry 11805 and 11806 | 2 | No original attachment or explicit supersession established. Similarly titled newer material was not substituted. |
| COVID archive children, registry 12820–12834 | 15 | The officially linked archive hostname fails DNS. Normal retries were exhausted; other URLs on that host are explicitly unvisited. DNS failure is not a 404. |
| Undocumented tombstones, separate release gate | 12 | IDs 665, 686, 786, 818, 824, 860, 868, 869, 889, 909, 5997 and 6560. Current and restored history agree on no downloaded payload, but they lack the required recorded three-404 threshold or explicit withdrawal/supersession. Two fresh audit observations do not satisfy that separate criterion. |

There are 4,415 active sources and 4,212 answer-ready documents. The 313 optional
failures remain reported without expanding recovery scope or changing source-family
requirements. Unknown cases stay unresolved; no source was retired solely for a
redirect, title similarity, timeout, missing file or DNS error.

## Verification and evaluation

The [diagnosis](verification-diagnosis.json) separates the historical missing trace,
private reproductions, deployed repair, HTTP batch, and browser checks. The original
withheld draft was unavailable. Reproduction using the actual legacy agent graph and
`gpt-5.4` / `gpt-5.6-terra` configuration demonstrated broad EPSDT retrieval missing
SSA §1905(r). First-pass findings identified unsupported treatment scope and
nonliteral quotations; the existing correction/recheck repaired them.

PolicyCorpus now routes the narrow EPSDT overview to federal authority and adds a
statute-only search when the initial authority results omit statutory evidence.
The post-fix private reproduction passed in one verification pass (8,375 ms) and
included SSA §1905. Private evidence/candidates are retained with restricted file
permissions and excluded from ordinary logs, streams, history and this publication.

The [unchanged fixed HTTP batch receipt](epsdt-smoke-batch.json) records:

| Attempt | Outcome | Passes | Verification latency |
| --- | --- | ---: | ---: |
| 1 | passed | 1 | 8,536 ms |
| 2 | withheld — unavailable, `TimeoutError` | 1 | 30,008 ms |
| 3 | corrected | 2 | 33,752 ms |

Withholding was **1/3**; mean verification latency was **24,099 ms**. Supplemental
latencies and the withheld reason come from that deployment's server logs, rather
than rewriting the original receipt. All three had fresh authentication. The batch
fails the agreed gate; configuration is **not frozen**, and a successful subsequent
check cannot replace the failed attempt. A later browser generation was also withheld.

The initial browser persistence check selected a stale first sidebar row, which
produced a false comparison failure. The operator check now waits for the active
row and rejects ambiguous titles. With fresh authentication, the already released
answer retained identical rendered prose and its `corrected` outcome after switching
threads and reloading; see [browser receipt](browser-persistence-receipt.json).
This receipt explicitly says `existing_verified_thread` and is not a new-answer smoke.

[Evaluation preflight](evaluation-preflight.json) uses the unchanged 55-question
benchmark and an evaluation-only canonical catalog. It maps 90 of 99 distinct expected
evidence identities with zero ambiguity. Nine identities from two beneficiary-guidance
sources are absent from legacy and remain genuine misses. Mapping uses exact source
URL/family, section identity, and structural/content evidence for duplicate or
unnumbered sections. The legacy graph was not modified.

The full graph mapping, raw/canonical IDs, mapping evidence and catalog are uploaded.
The common catalog hash is
`acfeb98a087ba3875e338f27b194216596e2566237517bed5a3df65e4f3f536e`;
the separate legacy mapping hash is
`ae0070f890dfeb0b652af3aab1431a548ad71a40b4c7b8d3bd8bb779d952c6ff`.
These are preflight artifacts, not a full baseline or blue comparison. No 55-question
baseline/candidate run was started after the required source and smoke gates failed.
Precision, recall, answer scores and regression therefore remain unset.

## Tested backup and operational state

The [restore receipt](backup-restore-receipt.json) confirms the new encrypted object:

- Object: `backups/corpus/corpus-2026-09-23T215205Z.tar.gz.age`
- Archive SHA-256: `c8df7f04f011dad1f1adc91bfff0d46081ab20ded29aab8cc9b4b0efa016e8f7`
- Final source snapshot: `sha256:92676a53380601808df7cc4af52c131e81bb0fb21e274c539d3921dade4f5e75`
- Decryption verified; SQLite integrity `ok`; 8,422 parsed artifact hashes,
  128 retirement records and one classification validated.
- Archive contains 4,556 registry rows, 4,526 source/version files and 12,999 parsed
  files. Restore used temporary storage and the existing macOS Keychain age identity;
  the private key was neither persisted nor exposed.

The snapshot matches the final inventory exactly. A successful restore does not
make this blocked source snapshot eligible for activation. Evidence object names
and hashes are in [the publication manifest](evidence-publication.json).

[Operational state](operational-state.json) confirms healthy graph-backed readiness,
the legacy target, absent `ACTIVE_CORPUS_COLOR`, and configured fresh test-account
credentials/public backup recipient. Effective maintenance is controlled by
`startCommand: sleep infinity`, no cron and restart `NEVER`; the stale
`CORPUS_JOB_MODE=recover-parse` variable does not start a job under that command.

| Service | Deployment | Code / state |
| --- | --- | --- |
| Agent | `03b2dac6-e5ee-4cc4-a1f3-d24fbf3d3c0e` | Successful manual deploy of clean commit `78e00cdf8eef3d99c24e02f76900885f8197b32b`; targets legacy |
| Web | `e42ff2d1-93f0-4ded-945e-adbac85ad4d7` | Successful deployment of main `2e298aa2e256a7e94bf9ad5f9a36cdab536a3ab5` |
| Corpus maintenance | `2abc3fdf-af9d-4eb6-ae0d-0f055b60720b` | Idle maintenance container; no scheduled work |

The normalizer's final parent-structure refinement is commit `43508d2`; it is an
operator/evaluation change and does not change the deployed agent bundle. No agent
target variables, active-color setting, graph data or promotion record were changed.

## Validation and continuation

[Validation results](validation-checks.json): crawler 249, pipeline 501 (four skipped),
PolicyCorpus 238, agent 393 (nine skipped), web 281, contracts four, mocked browser 39,
operational Node 16, operational Linux shell seven, and browser-selection regression
two tests passed. Agent TypeScript and production Docker/Mastra builds, web production
build, contracts build and affected lint passed. The initial sandboxed crawler run
could not bind localhost; the full suite passed with local networking permitted.

The first PR CI run exposed an omitted local Vulture check: it flagged the two
new dynamically registered Click commands. Their CLI registration was verified,
the existing whitelist was updated, and the complete pipeline lint command
(Ruff plus Vulture) passed. CI must be green before merging.

Tests cover guarded/imported recovery, duplicate/interrupted application, tampering,
lock contention, retirement versions, lost originals, index children, tombstone
preservation, private verifier capture and sentinel exclusion, exact identity mapping,
ambiguity/missing evidence, withheld/incomplete smoke streams and fresh authentication.
Existing mocked browser checks cover verified and withheld history across reload.

Continue only after resolving the exact blockers above and obtaining a new complete
three-attempt passing smoke batch after a demonstrated fix. Then freeze the source
snapshot, code, benchmark, catalog and models; run the full legacy baseline, rebuild
only inactive blue and run the policy-v2 evaluations. Produce a newly matching backup
and upload all evidence before invoking guarded initial activation. Keep legacy until
the later promotion/rollback rehearsal succeeds. Scheduling stays disabled until
successful cutover and scheduled fresh-authentication/backup validation.

For an agent-code rollback now, deploy a clean detached worktree at the previous main
commit `2e298aa2e256a7e94bf9ad5f9a36cdab536a3ab5` and require its specific deployment,
legacy graph readiness and fresh-authenticated verified smoke. The URI remains
`bolt://neo4j.railway.internal:7687`; retain its existing password and keep
`ACTIVE_CORPUS_COLOR` absent. Do not alter corpus evidence as a code rollback. For a
future initial-activation failure, rerun the same guarded activation command so its
private checkpoint restores the exact previous configuration before another attempt.

ByteRover's curate daemon timed out. Durable guidance is saved in `AGENTS.md` and the
runbook; restart the brv process if that connection problem persists.
