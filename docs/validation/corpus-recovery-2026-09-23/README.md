# Corpus recovery and guarded activation — 2026-09-23 UTC

Production remains on `legacy-20260725-ae8595c`. No blue reset, graph cutover,
promotion, or scheduled release has been performed. The release is blocked by
five required source failures, undocumented historical crawler removals, and a
failed verified-answer smoke. Corpus-job remains in maintenance mode.

## Implementation

Implementation starts at `59eddef7766205fcd2c764b1b0f5330b88f9aafd`, based on
`origin/main` `e62c1b06a967c490eac02f53d8846b8da65f3914`, in the isolated
`codex/corpus-release-completion` worktree. The original dirty workspace is
preserved. [PR #136](https://github.com/Queen-City-Cortex/medicaid-agent/pull/136)
contains the operator commands, release safeguards, tests and runbook.

The new SSE smoke requires a terminal passed/corrected outcome before released
text, a complete stream and citations. It rejects source-only, withheld,
unverified and interrupted output. Release operations require freshly obtained
WorkOS test-account authentication, wait for their own deployment ID, and poll
for the expected graph-backed release ID. The initial-activation checkpoint
restores the exact previous URI/password/release/color settings after failure,
including a previously absent active-color setting.

Initial baseline evidence is independent of a blue/green manifest and must use
the same complete benchmark and implementation/model fingerprint as the candidate.
Verification telemetry is mandatory, with withholding and latency summaries.
Policy v2 thresholds and mandatory source/graph checks remain unchanged.

## Recovery and retirement evidence

The four previously successful local recoveries were imported at 00:36:31 UTC,
batch `8a7785f4fdb7418fae35ed590350a66f`: `nc-resource-directory.pdf`,
`spanish_6.pdf`, `english_5.pdf`, and the full state plan. The state plan has 1,717
pages, 2,620 sections and 273 tables. Guarded import validated the parser
fingerprints/cache version, source hashes, metadata and artifact hashes, and
retained previous artifacts and attempt records.

Each of the final three timed-out PDFs received one additional isolated Docker
attempt, sequentially, with a two-hour per-file cap. The image was
`nc-medicaid-corpus-bootstrap-fixed` at parser revision `358237d8a9c405326effe3de78320c423ff33058`,
cache version 6. No lower-quality parser or acceptance fallback was introduced.
All three succeeded: `full-report.pdf` in 983.7 seconds, `here.pdf` in
2,110.2 seconds, and `report.pdf` in 1,905.0 seconds. The first two were imported
in batch `f1cd2e40072e46e68d9302a664f7c147` at 01:37:23 UTC. The last was imported
in batch `6c530c6df365425596ba5d74182f1af4` at 01:59:19 UTC with 310 pages,
276 sections and 169 tables. Duplicate imports reused all three valid outputs
with hosted attempt totals unchanged at two. See [retry results](final-pdf-retries.json),
[final import results](final-import-results.json), and the validated manifests
([four earlier recoveries](import-manifest-2.json), [first two retries](import-manifest-3.json),
[final retry](import-manifest-4.json)).

[Official-source investigation](official-source-investigation.json) records the
six source URLs, current responses, official index/replacement findings and
capture hashes. The four old form wrappers (registry IDs 2251, 2260, 2290, 2306)
returned a third consecutive 404 at 01:01:46 UTC and are absent from the current
[DHB forms index](https://policies.ncdhhs.gov/divisional-a-m/health-benefits-nc-medicaid/dhb-forms/).
Related instructions and newer Spanish forms were investigated; they are not
silently substituted for the original sources. All four versioned retirement records have been applied and retain the original artifact hashes and captured official evidence.

Two sources cannot currently be retired:

- `bulletins/state-standing-order.pdf`: the official COVID URL redirects to a
  generic page. The [current standing-orders index](https://www.dph.ncdhhs.gov/about-us/nc-state-health-director-standing-orders)
  supplies neither that order nor explicit evidence withdrawing it. Unrelated
  order rescissions do not establish withdrawal of this one.
- `dhhs-policies/dhb-5097-gu.pdf`: the Gujarati form is still listed in the
  official DHB index, but its wrapper has no usable attachment. It has not met
  either the confirmed-404 or explicit-withdrawal criterion.

The [historical removal audit](historical-removals.json) found **140** rows marked
removed: 117 DHHS policies/forms, 11 bulletin attachments, nine state-plan
amendments, one waiver attachment, one managed-care guidance attachment, and one
contract attachment. Four are the newly investigated forms above. **136 older
exclusions have no durable retirement record**, including 12 rows with no
original local payload. They require investigation/recovery; a historical
crawler tombstone is not sufficient evidence. The first complete file inventory checked 4,367 active local files. Registry
reconciliation then found another 33 active rows with no downloaded payload:
28 optional fee schedules (HTTP 403), two optional managed-care guidance files
(246/250 MB exceeding the existing 50 MB limit), and three **required** DHHS
sources (an unapproved archive-domain redirect and two empty MAGI wrappers).
The guarded inventory now accounts for all 4,400 active source rows. Supporting
optional failures remain visible under the existing source-family policy; the
three required missing payloads are additional release blockers. See
[source reconciliation](source-inventory-reconciliation.json) and the
[additional official-source checks](additional-source-investigation.json).

The [final inventory](recovery-inventory-final.json), after all seven imports and
four retirements, records **4,400 active sources**, **five required failures**,
**313 optional failures**, and **136 undocumented removals**. The optional total
comprises 283 existing parse exceptions (269 fee schedules, six contracts, six
managed-care guidance files, one billing guide and one provider manual), plus
the 30 missing optional downloads above. Their existing policy classification
is preserved; they remain visible in the evidence. The required failures are
the standing order, Gujarati form, COVID administrative-letter index and both
2025 MAGI wrappers. Inventory SHA-256:
`95530b09746216b8c240b3542dc81b6343819e7d00d4103164fa0cfb3d28bd64`.

## Production and backup validation

Web deployment `3e8310e2-b154-4aad-a928-d5b92c5588fa` contains #135. Authenticated
production browser tests confirmed exact released answer text and its corrected
verification outcome after thread switching and full reload. One successful
persistence run had 877 answer characters, three research steps, four cited and
two consulted sources. A production API diagnostic released a corrected answer
in two verification passes (3,859 characters). An earlier withheld response was
correctly rejected by the strengthened checker; it is not counted as a passing
release smoke.

The agent continues on deployment `aea38eb8-4255-4302-a689-d74ad62b47e1` with the
legacy graph. Final maintenance deployment `2abc3fdf-af9d-4eb6-ae0d-0f055b60720b`
is SUCCESS and its running environment confirms code revision
`4ce82c53ef7a5a3d9444b28d439e35c5a05e693e`. It replaces maintenance deployment
`9fde4ea9-f479-401b-962d-05d322a43353` (`59eddef`). Fresh account credentials and
the public backup recipient are present. The hosted fresh-authentication smoke
reached the legacy agent successfully, but its answer was withheld for
unsupported claims after two verification passes (32,303 ms verification latency). The
checker failed closed. The [saved server outcome](hosted-smoke-outcome.json)
records that failure; it is not represented as a passing production release.
The isolated browser/API samples are not a full benchmark withholding-rate
estimate. Full baseline/candidate withholding and latency comparisons remain
pending with the blocked evaluations. Corpus-job remains in maintenance mode
with `sleep infinity`, no cron, and restart policy NEVER.

A dedicated age identity was created in macOS Keychain, service
`Queen-City-Cortex.medicaid-agent.corpus-backup.age`, account `production`.
Only public recipient `age1fq5rhp3469yn40hzt5tm9wjrj08k6lttn9a98zd476ff0aw93smqdvx6yf`
is configured on Railway. The existing production test-account email/password
are configured for fresh scheduled smoke authentication; no permanent access
token is used.

The [initial restore receipt](backup-restore-initial.json) verifies encrypted
object `backups/corpus/corpus-2026-09-23T004015Z.tar.gz.age`, SHA-256
`c71821201c236831016fc29ab37a7f62ae973d57874fd11fa5c3e511391e17fc`.
Decryption succeeded, SQLite integrity was `ok`, and 8,414 artifact hashes were
checked across 4,525 source files, 12,996 parsed files and 4,540 registry rows.
The archive predates later recovery/retirement mutations and therefore cannot
satisfy a future cutover receipt for a changed snapshot. The [final restore receipt](backup-restore-final.json) covers the completed
recovery state: encrypted object `backups/corpus/corpus-2026-09-23T021521Z.tar.gz.age`
(2,645,273,808 bytes), SHA-256
`beccc6a69f45e01fdd52dcebd7912f1eae3fa4c9ececb7fbdb6a09f63264c38c`.
Decryption and SQLite integrity passed at 02:23:45 UTC; 8,420 artifact hashes and
all four retirement records/captured evidence verified. The archive contains
4,525 source files, 12,996 parsed files and 4,540 registry rows. Its restored
snapshot hash exactly matches the [locked service snapshot](final-state.json):
`sha256:d1dbcf86d4bfa59622b9f01b492df03562d3d48abc49d0adb686a63e149d8a21`.
That service check also verified all four original retired-file hashes and
collected all seven successful import results plus duplicate-import results.
The corpus mirror was synced before this backup. This snapshot still fails
release eligibility; subsequent source recovery requires a new matching backup.

The final report/evidence are also uploaded at object prefix
`recovery-evidence/2026-09-23`. The restore receipt is stored at
`backups/corpus/receipts/corpus-2026-09-23T021521Z.tar.gz.age.json`; downloading
it from storage reproduced the local receipt exactly. See the
[publication record](evidence-publication.json).

## Validation and remaining release work

Local checks passed for agent (391 tests, nine skips), web (281), contracts (four),
crawler (242), mocked browser (39), SSE smoke (13), and Linux operational
lock/interruption checks (seven). The final pipeline suite passed 480 tests
with four skips; guarded crawler reactivation also passed its two targeted tests. Agent TypeScript and actual production Docker
builds passed, as did affected crawler/web lint and crawler test type checks.
GitHub CI for final implementation revision `4ce82c5` passed JS/Python tests,
lint/builds, real-Neo4j integration, mocked browser testing and all three
production Docker builds ([run](https://github.com/Queen-City-Cortex/medicaid-agent/actions/runs/35807770879)).

No fresh full legacy/candidate comparison or candidate promotion is claimed.
Those stages require a complete, frozen source inventory first. The legacy graph
also predates the current immutable evidence IDs; the current 55-question
benchmark must be handled consistently, without substituting a historical
50-question baseline or fabricating a legacy manifest.

After resolving all inventory failures, follow the
[runbook](../../operations/blue-green-corpus-releases.md): freeze sources/code/models,
run the matched full baseline and candidate evaluations, restore-check the exact
frozen backup, upload evidence, then use guarded initial activation and its
nonce-bound browser receipt. Any activation failure restores legacy automatically;
rerunning the same command resumes interrupted restoration. Retain the legacy
service until the later blue/green promotion and rollback rehearsal pass.
