# Production readiness on October 2 2026

**NO-GO for full qualification.** Production chat fails in observational memory before answer verification, logout navigates to localhost, and seven required corpus sources remain unresolved. Full benchmarks were deliberately deferred; answer quality and pilot readiness are not assessed.

This report is for the project developer. It records current observations against the [later September source closure](../source-closure-2026-09-23/README.md), rather than repeating the earlier, already completed removal audit. [State](state.json), the [fixed HTTP batch](epsdt-smoke-batch.json), [identity preflight](identity-preflight.json), [source checks](source-checks.json), and [runtime diagnosis](runtime-diagnosis.json) retain safe machine-readable evidence. The [durable evidence receipt](evidence-publication.json) records the object key and verified SHA-256 of the archived source captures, snapshot manifests, and audit receipts. Private credentials, browser screenshots, provider logs, and drafts are excluded.

## Deployment and corpus state

Agent deployment `78274367-bd58-452b-be73-caf0265fe784` and web deployment `24c1f10c-d0d4-49d7-9927-abe1e7d6fb4a` run main `bc35e5858d0e5eddb6eb3ec82f1d14997e5ebd39`. Both allow application sleeping. The authenticated readiness, corpus-status, and dependency checks passed. The agent targets graph-backed `legacy-20260725-ae8595c`, with 6,725 graph documents. Agent configuration selects `gpt-5.4`; verification defaults to `gpt-5.6-terra`, but verification was not reached. Provider-resolved model snapshot IDs were not observed.

Corpus-job remains on maintenance deployment `2abc3fdf-af9d-4eb6-ae0d-0f055b60720b`, with effective `sleep infinity`, no cron, and restart policy NEVER. Its old `CORPUS_JOB_MODE=recover-parse` variable does not start a job. Deployment IDs were unchanged during the checks. No deployment, graph load, source disposition, scheduling change, or agency contact was performed.

The fresh source inventory records:

| Measure | October 2 | Later September closure |
| --- | ---: | ---: |
| Active sources | 4,403 | 4,403 |
| Answer-ready parsed documents | 4,212 | 4,212 |
| Required failures | 7 | 7 |
| Undocumented removals | 0 | 0 |
| Optional failures | 313 | 313 |
| Retirements | 152 | 152 |

The source snapshot remains `9fd132e8ae0a9f203ca93a61b384f0443b26bcc83ce017b1e68030e0d3d61768`. These parsed-source counts describe the candidate input inventory, not the active graph's document count. Optional exceptions remain visible under existing family policy.

## Snapshot and identity validation

The accepted snapshot validation compared 18,064 copied files totaling 13,293,135,717 bytes, checked identical registry logical contents and SQLite integrity, and held the existing writer lock for 385.05 seconds. A final production check verified every artifact hash, set membership, and registry logical hash remained unchanged. The initial raw-file snapshot attempt was rejected because its before/after manifests differed; it is not counted as a passing attempt. The initial mismatch cause is unknown; its full diff was not retained. Logical registry comparison and full artifact validation establish the later accepted copy independently. The lock could delay another writer; maintenance was idle and no contention was observed.

Inventory helpers ran on a disposable copy using current-main operator source and the maintenance image's existing Python environment, with production credentials removed. Helpers may migrate copied sidecars. Their absolute `/data/crawler/documents/...` paths initially prevented catalog joins at the audit's new root. Only the copy was rebased, after verifying exact source membership and hashes; its 4,500 metadata transformations have a retained receipt. That count includes historical sidecars, whereas 4,403 counts active registry rows. Production metadata was not rewritten.

The unchanged 55-question benchmark has 99 distinct expected evidence identities. **90 map without ambiguity; nine beneficiary-guidance identities remain genuine legacy misses.** The fresh catalog hash `acfeb98a087ba3875e338f27b194216596e2566237517bed5a3df65e4f3f536e` and mapping hash `ae0070f890dfeb0b652af3aab1431a548ad71a40b4c7b8d3bd8bb779d952c6ff` match the previous preflight. No titles, substitute sections, or historical 50-question dataset were used to erase misses. This is preflight evidence, not a benchmark score or activation receipt.

## Live smoke and failure diagnosis

The fixed batch asked “What does EPSDT require?” exactly three times with independent fresh authentication. All three failed, in 20.871, 13.442, and 13.082 seconds respectively. HTTP chat responses started successfully, then the smoke rejected their failed streams. No verifier outcome or verifier latency was available. These timings are complete smoke durations, not verification latency or a representative withholding-rate estimate. Wake and network time were not separately instrumented.

Error timestamps fall within each of the three attempt windows; tracing was off. Server logs identify `Encountered error during memory observation: this.storage.patchThread is not a function`. Direct inspection confirmed deployed Mastra core 1.45.0, memory 1.26.1, and libSQL 1.14.0. A real disposable local libSQL store exposes `updateThread` and `saveThread`, but no `patchThread`; memory 1.26.1 calls that missing method. The CLI skips conversational Memory, so CLI success does not exercise this failing HTTP input processor.

The historical 30-second verifier timeout is still unresolved. Today's earlier memory failure prevents testing whether it recurs; the old failed batch and subsequent isolated passes do not establish a repair. Follow-up qualification must retain that uncertainty and diagnose any recurrence without increasing the deadline or retry limit.

Browser login passed. Fresh answer generation failed before a verification badge appeared, leaving persistence and feedback **blocked**, not passed. Separate auth-only diagnosis observed logout navigating through WorkOS to `http://localhost:3000`, which refused the connection. One subsequent protected-chat probe in the same browser context required authentication again. This does not establish that the WorkOS session was terminated; logout navigation failed. The provider's default sign-out destination is a configuration lead, not a verified dashboard finding.

All four chat threads created by this run are absent after owned-endpoint cleanup. Account-scoped observational-memory and usage rows were not baselined, so complete removal of synthetic state is not established; existing account data was not wiped. Synthetic traffic is excluded from the readiness usage assessment; no real-user metrics or benchmark scores are claimed. The project has no real users; demonstrated impact is on the synthetic account, and incident onset is unknown. Passing health checks do not exercise conversational observational memory. No interim runtime mitigation was applied during this diagnosis-only cycle. Failed HTTP/browser receipts remain retained and are not replaced by a successful isolated retry.

## Follow-up work and acceptance

All follow-ups are owned by the project developer:

1. [Restore live conversational memory](https://github.com/Queen-City-Cortex/medicaid-agent/issues/185). Qualify a compatible memory/storage set with real disposable storage and fresh HTTP execution, preserving verified release, signed memory, and bounded recovery. Exercise multiple fresh conversational turns with real storage, then obtain a new 3/3 passing EPSDT batch after a demonstrated fix. That narrow smoke cannot replace full qualification.
2. [Correct logout navigation](https://github.com/Queen-City-Cortex/medicaid-agent/issues/186). Verify the WorkOS default or explicit production return destination, successful live navigation, and protected chat requiring login afterward.
3. [Close seven required sources](https://github.com/Queen-City-Cortex/medicaid-agent/issues/187). Registry 875 needs the standing-order payload or explicit withdrawal; 1905 needs the Gujarati attachment; 11805/11806 need original MAGI attachments or explicit supersession; 12820–12822 need exact archive attachments or source-specific withdrawal. Fresh generic redirects, empty wrappers, DNS failures, and unvisited URLs cannot authorize retirement. Withdrawal or supersession requires source-specific evidence from NC DHHS/DPH, not developer inference. Apply reviewed actions only in the subsequent recovery cycle.
4. [Run full qualification](https://github.com/Queen-City-Cortex/medicaid-agent/issues/188) after the preceding gates clear. Freeze source/code/model/catalog fingerprints; run repeated complete 55-question baseline/candidate evaluations, preserve missing evidence as misses, and satisfy existing policy-v2 gates. Matching backup/restore evidence and guarded activation belong to that later cycle.

The added smoke diagnostic mode tracks synthetic thread IDs and writes private, exclusive receipts. It tests feedback persistence/removal and logout, rejects mixed diagnostic/activation modes, and cannot issue a promotion receipt. The relevant operational/browser-helper suite passed 24 tests. The helper changes require final exact-head CI and completed review before merge. The full answer benchmark is **NOT_RUN**; corpus activation and pilot readiness remain unestablished.
