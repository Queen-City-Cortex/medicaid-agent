# Working artifact from the pipeline-release-sources reviewer

## A. Release state machine as implemented

| # | Step (entry point) | Mutates | Atomic? | Idempotent / on retry | On crash |
|---|---|---|---|---|---|
| 0 | Daily trigger: crawl, `parse --strict-required`, `answer-ready-snapshot --no-acknowledge` (railway-corpus-job.sh:61-76) | registry, payloads, sidecars, snapshot result file | n/a | yes; an unacknowledged snapshot re-triggers every day | flock released by kernel; rerun |
| 1 | Read agent variables; inactive colour = opposite of ACTIVE_CORPUS_COLOR (corpus-release.sh:384-409) | nothing | - | values captured here are reused hours later for restore | - |
| 2 | `release-retention-check` (release.py:928-955) | nothing | - | unreadable manifests are skipped (fail open) | exit 1 aborts the whole daily job |
| 3 | `redeploy_graph` inactive (corpus-release.sh:291-305) | restarts inactive Neo4j | - | yes | - |
| 4 | `release-prepare` (cli/release.py:94-146) | new manifest, state `building`; parse cache | manifest write atomic | new release id each run; same id overwrites | `building` manifest left behind, never collected |
| 5 | `release-build-graph` (release.py:198-265) | target graph: DETACH DELETE all, load, CFR, SSA, references, amendments, embeddings, concepts, schema version | no: hours of separate transactions | not resumable: every run resets, so the stage `attempt` counter and embed resume are moot | partial graph with no marker; stage stays `running` after SIGKILL |
| 6 | `release-validate` (cli/release.py:166-335) | manifest (fingerprint, stages, gates, `validated` or `rejected`), evidence files, graph marker `validated` | each manifest write atomic; marker one transaction | re-runnable (re-runs paid evals; can flip rejected to validated) | manifest may say `validated` with no marker; script stops |
| 7 | `sync-corpus-artifacts.sh` | object storage mirror and `releases/<id>/` | no | yes | - |
| 8 | `set_agent_target` (corpus-release.sh:87-107) | 4 agent variables (one mutation, skip-deploys), then agent redeploy and poll | variables atomic; variables plus deploy not | idempotent but always redeploys | **no intent recorded**: variables say new, manifests say old |
| 9 | `verify_agent_release` (corpus-release.sh:109-122) | nothing | - | readyz loop then one chat smoke | - |
| 10 | `release-mark-promoted` then `release-mark-graph promoted` (corpus-release.sh:492-500; release.py:803-835) | previous manifest (supersededBy, rollback window, retention), new manifest `promoted`, graph marker | two files, not atomic as a pair | second call fails (`Only a validated release can be promoted`); first-command failure is masked | previous may carry deadlines while new is still `validated` |
| 11 | Upload manifests; `acknowledge-answer-ready-snapshot` (railway-corpus-job.sh:79-84) | object storage; acknowledgement file | - | yes | no ack: next day rebuilds the same corpus |
| F | `recover_failed_cutover` (corpus-release.sh:147-226), only on explicit command failure | manifest `recovery_pending` then `rolled_back`; previous restored; marker `rolled_back`; agent variables back | no | errors collected in repair_failed and ignored by callers (`|| true`) | not reached on TERM or KILL |
| R | `rollback` (corpus-release.sh:525-587) | agent variables; both manifests | no | window is re-checked after the switch | set_agent_target failure exits with no compensation; marker and service of the rolled-back release untouched |
| C | `corpus-release-cleanup.sh` | `railway down` on label-derived inactive service; `serviceStoppedAt` | no | yes once marked | down done, mark failed: repeats down next day |
| B | `bootstrap` + `release-activate-bootstrap` (Python) | state.json journal; all agent variables via GraphQL replace; manifest; marker | journal atomic | re-run returns already_promoted or restores | restored on next invocation |

Sequences that lose the fallback or serve the wrong graph: (1) job terminated between steps 8 and 10 (finding 2); (2) masked failure in step 10 (finding 4); (3) label drift before step 5 or C; (4) by design, from day 7 the standby is consumed by the next build and there is no fallback until that build validates.

## B. How the agent decides which corpus is active

- Connection: process env NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD, fixed per deployment (packages/agent/src/neo4j.ts:8-10).
- Identity: /readyz returns 200 only if the graph's `CorpusRelease{id:'current'}.release_id` equals env CORPUS_RELEASE_ID in production (readiness.ts:51-69); /readyz is the Railway healthcheck (packages/agent/railway.json:15).
- ACTIVE_CORPUS_COLOR has no reader in agent code; it is a label only the ops scripts and bootstrap activation trust.
- No request-time check found on the chat path; deep research pins the release id per run (deep-research/service.ts:302-317).

## C. Where release state lives

| Store | Written by | Read by | Compared with |
|---|---|---|---|
| Agent service variables (4 keys) | set_agent_target / RailwayTarget.set_target | promote, rollback, cleanup, weekly audit | nothing (source of truth for scripts) |
| Agent deployment env snapshot | Railway at deploy | the agent | graph marker, via /readyz |
| Graph marker CorpusRelease (per colour) | mark_graph_release | /readyz, /corpus-status, bootstrap preflight | env CORPUS_RELEASE_ID only; hash and state only in bootstrap preflight |
| Local manifest pipeline/releases/<id>.json | every release-* command | retention, cleanup, promote (previous), rollback | preferred over remote when present |
| Object store releases/<id>/manifest.json | upload-release-manifest.sh (overwritten repeatedly) | download_manifest when no local copy; bootstrap preflight hash check | local manifest (bootstrap only) |
| Object store corpus/current/pipeline/releases/ | sync-current-corpus.sh (rclone sync) | restore-corpus-artifacts.sh | nothing |
| pipeline/release-state/answer-ready.json | acknowledge step | daily compare | not mirrored or restored |
| pipeline/private-activation/<id>/state.json | activate() | activate() on re-run | holds previous target including password |
| corpus-release-policy.json (image) | git | gates, deadlines | thresholds copied into gates; policy hash not recorded |
| crawler.db lifecycle tables | retire / classify / availability / scope | snapshot hash, prechecks | sourceSnapshotHash at validate and bootstrap preflight |

## D. Registry status definitions

| Site | Set | Meaning |
|---|---|---|
| parse/converter.py:62 | downloaded, updated, unchanged, error | must have a healthy parse |
| recovery_import.py:88 | downloaded, updated, unchanged, error | may receive an imported parse |
| graph/loader.py:34 | downloaded, updated, unchanged | may be loaded |
| audit.py:43 | downloaded, updated, unchanged | should be loaded |
| release.py:23 | downloaded, updated, unchanged | counted by gates |
| source_lifecycle.py:175 | downloaded, updated, unchanged | hashed as `available` |
| recovery_inventory.py:16 | everything except removed, index | must have a payload |
| source_selection.py:304-313 | ranks downloaded, discovered, (other), removed, error | canonical variant choice |
| crawler registry.ts:242 | downloaded, updated, unchanged, error | re-checked each crawl |

## E. Logic implemented twice

| Concern | Bash | Python |
|---|---|---|
| Switch agent target | corpus-release.sh:87-107 (CLI variable set, 4 keys) | bootstrap_activation.py:73-109 (GraphQL full-map replace) |
| Wait for deployment | corpus-release.sh:253-289 | bootstrap_activation.py:110-137 |
| Readiness + smoke | corpus-release.sh:109-122 | bootstrap_activation.py:139-162 |
| Restore with retries | corpus-release.sh:124-226 | bootstrap_activation.py:212-227 |
| Cutover state | manifest promotionState | state.json status |
| Corpus lock | lib.sh:108-123; reactivate-source.sh:8 | retirement.py:32-40; recovery_import.py:38-41 |
| Data root / releases dir | corpus-release.sh:13-18; corpus-release-cleanup.sh:11-15; sync-corpus-artifacts.sh:9-16; sync-current-corpus.sh:7-14 | config.py:14-36 |
| Agent variable parsing | corpus-release.sh:43-52; railway-corpus-job.sh:45; corpus-release-cleanup.sh:21-22 | RailwayTarget.variables |
| Mark graph validated | corpus-release.sh:366-370 | release-validate graphReleaseMarker stage |

## F. Essential versus removable

Essential: isolated candidate build; fail-closed gates; one atomic pointer switch; /readyz identity check; a rollback pointer; evidence-gated retirement; refusal to release with missing required payloads; atomic manifests.

Removable now: fee-schedule backlog report; graph promotion_state and its two extra states (with the one state comparison in the bootstrap preflight); events and release-event; stage attempt counter; volume retention, service-stopped tracking and cleanup-candidate search (replace with one deadline on the current manifest). Removable after the first cutover: the bootstrap path, or the bash cutover if the Python one is generalised. Shrinks to a one-time migration once the crawler stops auto-tombstoning: availability and classification dispositions.
