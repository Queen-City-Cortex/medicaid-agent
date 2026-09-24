# Source closure follow-up — 2026-09-23 UTC

**Production remains on `legacy-20260725-ae8595c`. The release is blocked by seven
required sources and the failed fixed EPSDT smoke batch.** Blue was not rebuilt or
activated; corpus-job remains in maintenance with scheduling disabled. PR #137
merged as `e9e71ea70039560d865fc8462f1c59510e885eb8` with all required checks green.

## Completed dispositions

The [complete ledger](source-dispositions.json) retains all 141 originally selected
sources and 16 discovered children. This follow-up resolves 24 additional sources:

- Twelve historical tombstones now have three distinct captured HTTP 404 checks,
  applied through reviewed availability actions. The operator validates immutable
  manifests and response hashes, holds the writer lock, rejects stale registry
  state, and commits counters together with its journal. Removed states and zero
  download attempts are preserved. Replaying all actions reused the journal.
  A review of all 36 applied observations confirms each 404 came directly from
  its original source URL. Subsequent operator code treats a redirect destination's
  404 as a check that resets the original URL's confirmed-404 streak.
- Twelve archive links are explicitly labeled “Obsolete” on the official COVID
  index. Their individual anchor/immediate-sibling markup supplies withdrawal
  evidence. Labels were not extended to three neighboring unmarked links.
- All 24 retirements use version-2 `never_downloaded` evidence, checked against
  current registry history and a restored retained snapshot. Original artifacts,
  earlier retirements, classifications and parse recoveries remain intact.

The [full inventory](source-inventory.json) contains **7 required failures, zero
undocumented removals, 313 optional failures, 152 retirements, one classification,
4,403 active sources and 4,212 answer-ready documents**. Optional failures remain
reported without changing family requirements. No new parsing fallback was used.

The [blocker ledger](release-blockers.json) lists exact URLs and evidence:

| Registry IDs | Remaining requirement |
| --- | --- |
| 875 | Recover the pharmacist standing order or establish explicit official withdrawal; its generic redirect is insufficient. |
| 1905 | Recover the Gujarati DHB-5097 attachment or establish withdrawal. The official wrapper/index has no usable attachment. |
| 11805, 11806 | Find the original MAGI attachments or explicit supersession. Similar titles do not establish replacement identity. |
| 12820, 12821, 12822 | Recover the archive's ZixMail instructions, self-attestation attachment and MAGI deduction letter, or find source-specific withdrawal evidence. The exact links have no “Obsolete” label. |

Supplemental investigation of the three official WordPress document APIs and their
attachment listings returned HTTP 403, with no recoverable payload. Access controls
were not bypassed. The archive host still fails DNS. The earlier audit exhausted
normal retries; this follow-up's redundant retry was interrupted after preserving
completed observations. Its interruption receipt is explicit, and it is not counted
as a 404 or a completed retry cycle.

## Verification and release gates

The [safe diagnostic metadata](verification-followup.json) records a further private
EPSDT reproduction on the same legacy graph/models: `passed`, one pass, 3,411 ms.
This demonstrates availability for that request, not the cause or resolution of the
intermittent 30-second timeout. No verifier model, timeout, two-pass limit or release
behavior was changed. Private drafts/evidence are excluded from this publication.

The original [three-attempt fresh-authentication batch](../source-audit-2026-09-23/epsdt-smoke-batch.json)
remains failed: passed, withheld on timeout, corrected. It has not been replaced by a
successful isolated retry. The earlier [thread-switch/reload receipt](../source-audit-2026-09-23/browser-persistence-receipt.json)
continues to establish persistence of an already verified answer; it is not a fresh
all-passing smoke batch.

The [55-question normalization preflight](../source-audit-2026-09-23/evaluation-preflight.json)
is unchanged. Full baseline/candidate evaluations and release configuration freeze
remain blocked. No policy-v2 threshold, source gate or graph identity rule was relaxed.

## Backup, validation and continuation

The [restore receipt](backup-restore-receipt.json) confirms successful decryption,
SQLite integrity `ok`, 8,422 parsed artifact hashes, 152 retirements, one classification
and 36 applied availability observations. The archive is
`backups/corpus/corpus-2026-09-23T224334Z.tar.gz.age`, SHA-256
`1a27a437014ecbe7f49b3a8963d23ca5dc9e575fd09be559bf05e588089b07f0`. Its snapshot
`sha256:9fd132e8ae0a9f203ca93a61b384f0443b26bcc83ce017b1e68030e0d3d61768`
matches the full inventory exactly. Restoration used temporary storage and the
existing Keychain recovery key. The interrupted encrypted download was resumed in
checked byte ranges; the full restored archive passed integrity validation.

The [publication manifest](evidence-publication.json) records the uploaded audit
bundle and restore receipt. A restored backup does not make this blocked source
snapshot eligible for activation.

[Validation](validation-checks.json): the full pipeline suite passed 518 tests
(four skipped), affected lint passed Ruff/Vulture, the final backup/availability
checks passed 15 tests, and all 16 operational Node tests passed. Regression coverage
includes interrupted counter/journal updates, altered captures, stale observations,
duplicate cache/application, preserved tombstones and backup evidence integrity.
PR #137's full agent/build, web/browser, crawler and deployment checks were green;
this follow-up changes operator code and evidence only.

[Operational state](operational-state.json) confirms graph-backed legacy readiness,
`ACTIVE_CORPUS_COLOR` absent, configured fresh test-account authentication and public
age recipient, and effective `sleep infinity` maintenance. The agent deployment is
`03b2dac6-e5ee-4cc4-a1f3-d24fbf3d3c0e`; web is
`e42ff2d1-93f0-4ded-945e-adbac85ad4d7`; maintenance is
`2abc3fdf-af9d-4eb6-ae0d-0f055b60720b`. No graph target or promotion record changed.

Continue by resolving the seven exact sources and demonstrating the timeout repair
with a new complete three-attempt fresh-auth batch. Then freeze the final source/code/
benchmark/normalization/model configuration, run the full legacy/blue comparison,
create its matching restored backup, and invoke guarded activation. Retain legacy
until the later promotion/rollback rehearsal. Scheduling must stay disabled until
cutover and scheduled authentication/backup validation pass. If future activation
fails, resume its guarded command to restore the exact previous legacy configuration,
including the absent active-color variable. The current work requires no graph rollback.
