# Corpus releases, deployment, backups and CI: all issues

Two generations of data operations coexist. The laptop tier is still installed: its Saturday job would wipe the production graph if its incidental failures cleared, and the chat-store backup has produced nothing since 21 September. The hosted blue-green tier has fail-closed gates, a tested job wrapper and atomic manifests, but it has never promoted. On current evidence it cannot: the retrieval floors are arithmetically out of reach, no stored golden-set run meets the answer floor, the statute source is offline, and release inputs are checked only after a paid rebuild. Its scheduled path would then stop daily on scope approvals and retention locks. The main risk is a stale or destroyed serving graph with no rehearsed way back. First unload the Saturday job, then make one release attainable by removing bindings and recalibrating gates, repair the backup, and migrate Railway configuration before 1 December 2026.

## What is working

- `scripts/ops/backup-mastra.sh:55-68` fails closed: a `VACUUM INTO` snapshot, a sentinel instead of trusting the `railway ssh` exit code, and a local integrity check before upload. That is why the 13-day failure is visible.
- `scripts/ops/lib.sh:104-129` and `scripts/ops/railway-corpus-job.sh:254-293` provide a kernel-released lock on the volume, process-group supervision and an interruption marker; `scripts/ops/tests/railway-corpus-job.sh` exercises them with real processes in the build workflow.
- `packages/agent/src/readiness.ts:51-69` makes graph release identity the Railway deploy gate, while paid provider probes sit on `/dependencyz` behind a 60-second cache, so a provider outage cannot block a deploy and health probes cannot drain quota.
- `packages/pipeline/src/pipeline/release.py:546-553` treats a missing or non-finite gate metric as failed, mandatory gates cannot be overridden, and manifests are written atomically (`:42-54`).
- `bootstrap()` in `scripts/ops/corpus-release.sh:319-335` needs a typed confirmation and refuses to target the serving graph; `packages/pipeline/tests/test_bootstrap_activation.py:100-127` tests the journaled first activation against interruption.
- `packages/pipeline/Dockerfile` pins the base image, uv and the Railway command-line tool by digest or checksum and runs build-time smoke checks; `.github/workflows/ci.yml` pins third-party actions by commit, uses no secrets and builds all three production images.

## High severity

### OPS-1 · Installed Saturday laptop job ends in an unattended wipe of the production graph

**high** · effort S · reliability, wrong-answer risk, documentation

`scripts/ops/weekly-refresh.sh:77` runs `npm run deploy-data -- --yes`, whose `load --reset` deletes every node in the Neo4j service recorded as serving production. Both gates pass vacuously when the cache directory is empty (`scripts/ops/eval-gate.sh:34-37`; the change gate compares against `none`). The launchd job was still loaded on 2026-10-05; recent runs stopped only because Docker was not running and because of a `better-sqlite3` Node version mismatch. `RUNBOOK.md:145` and `:424` still document this path as current.

**Impact.** Users would query an empty or partial graph during the reload, the tagged legacy graph that every validation record uses as its baseline would be gone, and `/readyz` would return 503.

**Fix.** Unload the job today with `launchctl bootout gui/$(id -u)/com.ncmedicaid.weekly-refresh` and delete its plist; do not run `scripts/ops/install-launchd.sh --uninstall`, which also removes the backup job. Pause the `HC_URL_WEEKLY` check. Then choose: delete `scripts/ops/weekly-refresh.sh`, `scripts/ops/eval-gate.sh`, `scripts/ops/railway-tcp-proxy.sh` and `scripts/deploy-data.sh` and rewrite the RUNBOOK sections now (two verifiers), or keep `deploy-data` until blue-green activation, documented as leaving `/readyz` failing (one verifier). Give `scripts/ops/backup-corpus.sh` another caller.

*What is and is not established: The wipe has not happened. The local crawl, pipeline, audit, evaluation and Railway login must all succeed first, but none of them is a designed safeguard.*

Where: `scripts/ops/weekly-refresh.sh:77`, `scripts/deploy-data.sh:74`, `scripts/ops/eval-gate.sh:34`, `RUNBOOK.md:424`

## Medium severity

### OPS-2 · Neither retrieval floor in the release gate can be met on the 55-question benchmark

**medium** · effort M · release gate, evaluation validity, cost

`corpus-release-policy.json:17-18` sets non-overridable floors of 0.9 exact-section recall and 0.95 primary-section hit rate. The retrieval evaluation sends no document types and no default type group contains `beneficiary_guidance`, so questions q-051 to q-055 cannot hit and primary hit rate is capped at 50 of 55 (0.909). The one stored golden-set run scored recall 0.36 and primary hit 0.58. The floors are checked only after the answer evaluation has run. Separately, the 0.15 aggregate regression limit compares all 55 questions although the legacy baseline lacks the evidence for those five.

**Impact.** The owner pays for a rebuild and a 55-question answer run that must end in rejection, and every corpus fix in this review ships only through this gate.

**Fix.** Run `eval --level retrieval` alone on the candidate graph after the type-group fix. In `release_validate`, compare the retrieval result with the floors before the answer stage and stop on a breach. Set both floors from the measured values minus 0.02 to 0.04, keep them non-overridable, split the regression limit by metric, and fail when no baseline exists. Compute baseline comparisons on the 50 shared questions only. Remove the policy file from the evaluation fingerprint and amend issue #188.

*What is and is not established: The 0.909 ceiling follows from current code. Measured scores come from stored June runs on the legacy graph; nothing has been measured on the candidate graph or the 55-question set.*

Where: `corpus-release-policy.json:17`, `packages/pipeline/src/pipeline/eval/levels/retrieval.py:27`, `packages/policy-corpus/src/internal/scoring-constants.ts:20`, `packages/pipeline/src/pipeline/release.py:529`

### OPS-3 · No stored golden-set run reaches the 2.75 answer floor, and one run decides

**medium** · effort M · release gate, evaluation validity, cost

`packages/pipeline/src/pipeline/release.py:515` gates on the all-rows mean of one answer run, non-overridable at 2.75. No stored 50-question golden-set run reaches it; the three September runs scored 2.70, 1.92 (15 answers withheld) and 2.60 (2 withheld). `release-validate` rejects on the first run (`packages/pipeline/src/pipeline/cli/release.py:283`), and issue #188 collects three candidate runs with no rule for the other two. Among the July runs, 7 of 20 same-configuration runs failed a floor, and a run's verdict differed from its three-run mean in 5 of 18 cases.

**Impact.** A candidate near the floor is accepted or rejected by chance after six paid runs ($183 to $206 by the repo's scenario), on a gate that accepts no override.

**Fix.** Record in issue #188 before any paid run whether 2.75 applies to released answers or to all rows, and whether to keep 2.75 although no stored golden run meets it; the owner must choose. The verified design skips the judge for withheld rows, applies the floors to released rows, adds a withheld-answer count cap, keeps the baseline comparison on all rows, and gates on the mean of the three planned candidate runs. Re-run runs voided by infrastructure errors.

*What is and is not established: All figures come from stored runs on the legacy graph and 50 historical questions; the July runs predate withholding. Variance on the 55-question set is unmeasured.*

Where: `packages/pipeline/src/pipeline/release.py:515`, `packages/pipeline/src/pipeline/cli/release.py:283`, `corpus-release-policy.json:19`, `docs/operations/qualification-preparation.md:59`

### OPS-4 · A release-gate override file stays in force for every later unattended release

**medium** · effort S · release gate, wrong-answer risk, data quality

`scripts/ops/corpus-release.sh:436-438` passes `RELEASE_OVERRIDE_FILE` on every promote, including the unattended daily one. `apply_overrides` (`packages/pipeline/src/pipeline/release.py:692-715`) checks only the gate name, overridability and a 10-character reason; it never sees the release id, snapshot hash or the gate's value. If the variable stays set after one accepted drop, the family-document, answer-ready and freshness gates are waived for every later release. Both count gates compare only with the previous release, so drops under 5% and 2% compound: 43% of a family over twelve releases in the reviewer's probe.

**Impact.** A crawl regression that drops many policies could be promoted unattended, and users would get verified answers drawn from whichever sibling policies remain.

**Fix.** Require each override entry to carry the candidate's `sourceSnapshotHash` and reject a mismatch in `apply_overrides`. Pass `--override-file` only in operator-invoked `release` mode, or fail a scheduled run when the variable is set. Add an absolute per-family minimum document count to `corpus-release-policy.json` as a mandatory gate. Document the file format in `docs/operations/blue-green-corpus-releases.md`. Add two tests beside `packages/pipeline/tests/test_release.py:208-223`: a stale-hash override is rejected, and a below-floor family count fails.

*What is and is not established: Prospective: no blue-green promotion has occurred. The behaviour was confirmed by reading the code; the reviewer's probe scripts were not re-run.*

Where: `packages/pipeline/src/pipeline/release.py:692`, `scripts/ops/corpus-release.sh:436`, `packages/pipeline/src/pipeline/cli/release.py:311`, `corpus-release-policy.json:11`

### OPS-5 · Interrupted cutover is unfenced, and the seven-day lock makes deferral a daily failure

**medium** · effort M · reliability, release gate, test gap, needless complexity

`promote()` switches the agent at `scripts/ops/corpus-release.sh:455` but records the rollback window and `promoted` state only at `:494`; if the job dies in between, the next run trusts `ACTIVE_CORPUS_COLOR` and resets the previous graph. Separately, `packages/pipeline/src/pipeline/release.py:823` stamps a seven-day `volumeRetainUntil`, and the refused reset exits 1 inside the fail-fast chain at `scripts/ops/railway-corpus-job.sh:156-163`, skipping cleanup, mirror and backup on every changed-corpus day. `promote`, `rollback` and `recover_failed_cutover` have no behavioural tests. Round one proposed three incompatible repairs; a round-two walkthrough reduced them to one design.

**Impact.** Production could be left on a release that never passed its smoke check with no fast way back, and a bulletin published the day after a release would wait about a week.

**Fix.** Before the switch, stamp the previous manifest's `supersededByReleaseId` and `rollbackWindowEndsAt` and upload both manifests. Make `promote`, cleanup and `rollback` first require a `promoted` serving manifest that matches the active colour, and otherwise run `recover_failed_cutover`, also exposed as `CORPUS_JOB_MODE=recover`. Delete `volumeRetainUntil` and `volumeRetentionDays`. Treat a blocked reset as a deferral, with an exit code other than 75, so cleanup, mirror and backup still run. Judge a restore by deployment status and `/readyz`. Add fake-Railway behavioural tests in the same change.

*What is and is not established: Latent: the hosted job is parked and no promotion has occurred. One reviewer rated the retention lock high; it is medium here because nothing has failed yet.*

Where: `scripts/ops/corpus-release.sh:455`, `scripts/ops/corpus-release.sh:494`, `packages/pipeline/src/pipeline/release.py:823`, `scripts/ops/railway-corpus-job.sh:156`

### OPS-6 · Cutover, rollback and scope acceptance each hinge on single unrepeated verifier outcomes

**medium** · effort M · reliability, release gate, cost

Cutover (`scripts/ops/corpus-release.sh:474`), emergency rollback (`:563`) and bootstrap activation each decide on one run of the authenticated chat smoke, which fails on any withheld answer. The non-overridable scope gate needs 16 of 16 live runs to pass, 8 of which need a verified answer. Retained production batches of the smoke question show 2 answers withheld in 12. No cutover-only entry exists, so a missed smoke leads to another wipe, re-embed and evaluation. A rollback whose smoke is withheld re-points the agent at the release the operator was leaving.

**Impact.** No wrong answer is released, but the owner pays for avoidable rebuilds, releases stall, and an emergency rollback can undo itself by chance.

**Fix.** Leave the verifier's deadline, pass ceiling and retries unchanged (issue #188) and keep the forward smoke fail-closed. In `rollback()`, leave the agent on the rolled-back-to release when only the smoke is withheld, and exit non-zero. Add a cutover-only entry such as `promote --release <id>` for a validated manifest whose snapshot hash and fingerprint are unchanged. The owner must choose the smoke pass rule: a fixed, recorded batch is consistent with #188; retry-until-pass is not. Record per-case scope pass counts.

*What is and is not established: The withhold rate is 12 attempts on one question against the legacy graph; applying it to the scope cases is extrapolation. Latent until a cutover is attempted.*

Where: `scripts/ops/corpus-release.sh:121`, `scripts/ops/corpus-release.sh:474`, `packages/pipeline/src/pipeline/bootstrap_activation.py:217`, `scripts/ops/release-smoke.mjs:21`

### OPS-7 · Release inputs are checked only after a full-cost wipe and rebuild, retried daily

**medium** · effort M · cost, release gate, reliability, data quality

`bootstrap()` and `promote()` restart the inactive Neo4j, wipe it and re-embed the corpus with no vector cache (`packages/pipeline/src/pipeline/release.py:221-253`) before `release-validate` checks inputs that need no graph: the baseline fingerprint, `EVAL_IDENTITY_CATALOG` (required by code, absent from the runbook's variable block and every release script) and freshness. A gate-rejected snapshot is never acknowledged, so it is rebuilt daily. The trigger hash covers every registry row's status, so a transient download error starts an attempt. A failed attempt leaves the inactive Neo4j running. Nothing alerts on the active release's age.

**Impact.** The owner pays for an embedding pass (repo estimates run from $13.66 projected to $115 at list price) plus evaluations per failed attempt, while users keep the graph tagged 25 July.

**Fix.** Add a `release-preflight` command before `redeploy_graph` that checks the evaluation fingerprint and catalog, the baseline, the override file and per-family freshness. Skip the rebuild when a manifest with the same `sourceSnapshotHash` and `evaluationFingerprint` already failed a gate. Keep a document's last good status on transient crawl errors. Stop the target Neo4j when promote ends before the switch. Fetch regulations from GovInfo: the eCFR endpoint returns a root the validator rejects even with compression. Show release age in corpus-status.

*What is and is not established: Latent: the job is parked and nothing was executed. Five required families were last discovered on 2026-09-22. Nobody has run the regulations stage end to end.*

Where: `packages/pipeline/src/pipeline/cli/release.py:208`, `packages/pipeline/src/pipeline/release.py:221`, `scripts/ops/corpus-release.sh:425`, `packages/pipeline/src/pipeline/source_lifecycle.py:158`

### OPS-8 · Answer-scope approvals are voided by any crawl change, stopping the scheduled job daily

**medium** · effort M · reliability, release gate, needless complexity

`approved_scope_map` (`packages/pipeline/src/pipeline/answer_scope.py:272-279`) raises when the whole-corpus snapshot differs from the one recorded at approval: a new registry row, a status flip to `error`, or a changed source file. A change to any of 25 implementation-hashed files raises a separate error at `:177-185`. The raise is reached unguarded from `parse --strict-required` (`scripts/ops/railway-corpus-job.sh:69`), the weekly audit and the inventory command. An approval cannot be superseded, because `source_url` is unique and differing evidence is refused.

**Impact.** After bootstrap, the first new bulletin or transient download error would stop the daily job before snapshot, promotion, mirror and backup, and the operator's diagnostics would fail with it.

**Fix.** Delete the whole-corpus snapshot comparison in `approved_scope_map`, its twin at `scripts/ops/verify-corpus-backup.py:335-338` and the implementation-hash comparison; keep the per-row hash guards and the non-overridable scope acceptance gate. Have callers catch an invalid approval, treat the approved set as empty and record the reason. Add `source-scope --apply --supersede <action id>`. Remove the baseline-archive recheck and receipt requirement together. Replace `test_unrelated_answer_ready_change_invalidates_complete_approval` and correct `docs/development/gotchas.md:34`.

*What is and is not established: Latent: no scope rows exist in production. Today the four open issue #187 sources fail the strict parse and release-prepare instead. The reviewer's probe was not rerun.*

Where: `packages/pipeline/src/pipeline/answer_scope.py:272`, `packages/pipeline/src/pipeline/answer_scope.py:177`, `packages/pipeline/src/pipeline/parse/converter.py:1816`, `scripts/ops/railway-corpus-job.sh:69`

### OPS-9 · First-release prerequisites invalidate one another, and bootstrap cannot override the freshness gate

**medium** · effort M · needless complexity, release gate, cost

Bootstrap requires a fresh legacy baseline (`scripts/ops/corpus-release.sh:310`), an evaluation fingerprint over four packages' source (`packages/pipeline/src/pipeline/evaluation_evidence.py:30`), scope approvals bound to the registry snapshot and 25 hashed files, and bulletin discovery under 24 hours old. Unlike `promote` (`:437`) it never passes `RELEASE_OVERRIDE_FILE`, which makes the overridable freshness gate mandatory. A crawl that changes a registry row voids approvals and backup receipts; a redeploy touching a hashed file voids the baseline. Twenty-eight commits touched the scope-hashed files on 3 and 4 October.

**Impact.** The owner must finish crawl, backups, scope approval, baseline, build and validation inside one day with no intervening change.

**Fix.** Pass `RELEASE_OVERRIDE_FILE` to `release-validate` in bootstrap as `promote` does, with the override bound to one snapshot. Replace the four-package file walk with the manifest `commitSha` plus a clean-tree check. Decide one question: removing the legacy baseline from bootstrap (`:310`, `:364-365`) shortens the path but contradicts issue #188's paired baseline-and-candidate acceptance wording, so either amend #188 or keep the baseline. Replace the $5 sample gateway with provider-enforced limits on a dedicated evaluation key.

*What is and is not established: The 3 October rehearsal ended NO_GO with five source families stale, and no candidate graph has passed validation. The interaction between prerequisites is derived from code and commit history.*

Where: `scripts/ops/corpus-release.sh:310`, `scripts/ops/corpus-release.sh:364`, `packages/pipeline/src/pipeline/evaluation_evidence.py:30`, `packages/pipeline/src/pipeline/answer_scope.py:67`

### OPS-10 · The first corpus release cannot build while uscode.house.gov is under maintenance

**medium** · effort S · release gate, reliability, data quality

Both release paths call `release-build-graph` without `--use-federal-cache` (`scripts/ops/corpus-release.sh:360` and `:446`), so every build refetches the Social Security Act and aborts when the statute fails validation (`packages/pipeline/src/pipeline/release.py:237`). uscode.house.gov was still serving an HTTP 200 maintenance page with no statutory text on 2026-10-05. The cache flag would not help: the hash-recorded statute copies from 2026-06-13 are about 113 days old against the 30-day limit at `packages/pipeline/src/pipeline/config.py:77`. The statute step is a build stage, so the override file cannot waive it.

**Impact.** While the site is down no release can be built, so users keep getting answers from the corpus released on 2026-07-25.

**Fix.** Choose one of two proposed designs: a checked-in pin of the validated subchapter 19 and 21 copies, or a stale-cache fallback behind an overridable source-age gate. The pin is narrower: record sha256, size and `retrievedAt`, add an opt-in `--pinned-statute-cache` flag to `release-build-graph` that skips the network, requires the cache to match the pin and pass `validate_usc_subchapter`, stamps `source_checked_at` with the pinned date, and enforces a hard maximum age.

*What is and is not established: The maintenance page was observed on 2026-10-05. Whether a build gets past the earlier regulations stage is unknown; nobody ran it end to end.*

Where: `scripts/ops/corpus-release.sh:360`, `packages/pipeline/src/pipeline/release.py:237`, `packages/pipeline/src/pipeline/federal/ssa_client.py:158`, `packages/pipeline/src/pipeline/config.py:77`

### OPS-11 · Production chat-store backup has failed every day since 22 September 2026

**medium** · effort M · reliability

`scripts/ops/backup-mastra.sh` (launchd, 06:45 daily) failed on all 13 runs from 2026-09-22 to 2026-10-04: `railway ssh` returned Railway account JSON instead of command output, the `SNAPSHOT_OK` sentinel was missing and the script exited at `:59`. The last good copy is from 2026-09-21. The streak began the day after `sleepApplication` was enabled, and the script neither wakes the service nor selects the running instance. About 13 failure pings went out without a repair.

**Impact.** If the agent volume is lost today, every chat thread, feedback row and usage record since 21 September is gone, and the gap grows daily. The store holds only test data so far.

**Fix.** Take one manual backup now: poll `/healthz` until it returns 200, then snapshot the running instance. In the script, add that wake loop, resolve the running instance id and pass it to both `railway ssh` calls, and retry once when the sentinel is missing. If instance selection stays unreliable, replace SSH with a secret-guarded agent route that streams a `VACUUM INTO` copy. Check that the healthchecks.io failure alerts reach a channel that is read.

*What is and is not established: The failures were observed in the job's logs. The cause is inferred from timing; an outdated Railway command-line tool or a credential problem is not excluded.*

Where: `scripts/ops/backup-mastra.sh:55`, `packages/agent/railway.json:19`, `docs/development/gotchas.md:201`, `RUNBOOK.md:399`

### OPS-12 · Chat-store backups are plaintext in the same Railway account; no restore is rehearsed

**medium** · effort M · privacy, security, reliability

`scripts/ops/backup-mastra.sh:70` uploads the chat-store snapshot unencrypted, although `RUNBOOK.md:71` says it may contain client personal information and each copy carries the answer-release signing key. Only the public-document corpus archive is encrypted with `age` (`scripts/ops/object-storage-backup.sh:35`); the runbook keeps that identity in one macOS Keychain and records no offline copy. Every backup sits in the same Railway account; a second target is optional and covers only the corpus archive. No committed tool restores an archive onto a volume, and the chat-store restore and quarterly drill exist only as prose.

**Impact.** Anyone with bucket credentials can read every retained chat copy. Losing the laptop could make up to 400 days of corpus archives unreadable, and a Railway lockout takes primary data and all backups together.

**Fix.** Put a second copy of the `age` identity offline and record its location in the RUNBOOK. Then encrypt the chat snapshot with `age -r "$BACKUP_AGE_RECIPIENT"` after the integrity check, upload only the encrypted file and delete the existing plaintext copies. Set `SECONDARY_RCLONE_TARGET` so one copy of each archive lives outside Railway. Rewrite the chat-store restore procedure, rehearse it once by hand before the first real users and record the date in the RUNBOOK.

*What is and is not established: Bucket layout and key custody are taken from the scripts and documentation; the bucket and the Keychain were not inspected. The store holds no customer data yet.*

Where: `scripts/ops/backup-mastra.sh:70`, `scripts/ops/object-storage-backup.sh:35`, `RUNBOOK.md:426`, `docs/operations/blue-green-corpus-releases.md:307`

### OPS-13 · Railway stops reading the checked-in `railway.json` files on 1 December 2026

**medium** · effort M · deadline 2026-12-01 · dependency, cost, reliability

The agent's `/readyz` deploy gate and 300-second timeout, serverless sleep, the 4 GiB memory cap, watch patterns, the corpus job's cron schedule and start command, and the Dockerfile paths are all set in `railway.json` files (`packages/agent/railway.json:15-22`, `packages/pipeline/railway.json:19-23`). Railway's documentation, fetched 2026-10-04, says Config as Code files stop being read on 2026-12-01. The maintenance-mode procedure, which swaps the config file path, stops working regardless. Nothing in the repo tracks the cutoff.

**Impact.** On the first deploy after the cutoff the owner may lose the readiness gate, the sleep and memory limits behind the September cost fix, and the corpus job's schedule.

**Fix.** Run a zero-diff migration before the deadline, with no corpus maintenance session in flight: upgrade the workstation Railway command-line tool, record each service's effective settings, run `railway config migrate`, check the generated `.railway/railway.ts`, and require `railway config plan --verbose` to show zero destroys before `railway config apply`. Compare settings after one deploy, then delete the JSON files. Re-implement maintenance mode as a conditional in that file and update the RUNBOOK, the blue-green runbook and `docs/development/gotchas.md:122`.

*What is and is not established: Dashboard state was not inspected; each setting is lost only if the dashboard does not already hold the same value.*

Where: `packages/agent/railway.json:15`, `packages/pipeline/railway.json:21`, `deploy/railway/corpus-maintenance.json:1`, `RUNBOOK.md:311`

### OPS-14 · Runbook emergency commands are wrong: rollback does not roll back, chat-store restore is unsafe

**medium** · effort M · documentation, reliability

`docs/operations/blue-green-corpus-releases.md:235` and `:284` prefix `CORPUS_JOB_MODE=...` to a local `railway redeploy`, which cannot pass it to the container; the job runs in the service's stored mode, documented as `scheduled`. The stage-retry claim at `:336-338` is misleading, because every restart is a full rebuild. `RUNBOOK.md:423` restores the chat store by overwriting `/data/mastra.db` without removing the write-ahead log files. `RUNBOOK.md:424` recovers the graph with `npm run deploy-data`, which leaves `/readyz` failing. The RUNBOOK never mentions `/readyz` or `/dependencyz`.

**Impact.** During an outage the documented rollback would start a crawl and possibly a new promotion while the 24-hour rollback window runs out, and a chat-store restore could be silently undone.

**Fix.** Add a one-screen Incidents section at the top of `RUNBOOK.md` (symptom, first check, action), opening with which graph path and scheduler are live. Replace both one-liners with explicit steps: set the mode with `railway variable set --skip-deploys`, redeploy, confirm `"mode":"rollback"` in `CORPUS_RUN_SUMMARY`, then restore `scheduled`. Restore the chat store to a new file name and repoint `DATABASE_URL`. Correct the stage-retry sentence. Use the required rehearsal to settle whether redeploying a cron service runs immediately.

*What is and is not established: Verification reproduced a stale write-ahead log silently undoing a restore. The rollback one-liner's behaviour is derived from the scripts and was not run against Railway.*

Where: `docs/operations/blue-green-corpus-releases.md:284`, `RUNBOOK.md:423`, `RUNBOOK.md:446`, `scripts/ops/railway-corpus-job.sh:16`

### OPS-15 · Volume restore treats a failed bucket listing as absent and restores the legacy layout

**medium** · effort S · reliability, test gap, data quality

`remote_has_entries` (`scripts/ops/restore-corpus-artifacts.sh:19-25`) discards rclone's error output and exit status, so a transient listing failure on `corpus/current/crawler` makes the script report the prefix absent, restore the newest dated registry from the legacy layout and exit 0. It always creates an empty `recovery-journal` directory, which satisfies the job's startup guard. `scripts/ops/sync-current-corpus.sh:44` mirrors `section-labels` but the restore lists omit it, so the encrypted backup fails after a restore when a retained release carries Jev annotations. The tests use a fake rclone that always exits 0.

**Impact.** After a volume loss the operator could unknowingly resume on a months-old registry without retirement or scope-approval history, and a later sync of empty local directories could delete remote release manifests.

**Fix.** Replace the per-directory probes with wholesale `rclone copy` calls for `corpus/current/pipeline` and `corpus/current/crawler`, copying `crawler.db` last so an aborted restore leaves no completion marker. First confirm `crawler.db` exists under `corpus/current`; otherwise keep the legacy path behind `ALLOW_LEGACY_RESTORE=1`. Replace the legacy-fallback test with one where the fake rclone fails its first call, and add a `section-labels` round trip to `packages/pipeline/tests/test_corpus_sync.py`. Update `docs/development/gotchas.md:120`.

*What is and is not established: Derived from the script and its tests; no restore was run against a failing bucket.*

Where: `scripts/ops/restore-corpus-artifacts.sh:22`, `scripts/ops/sync-current-corpus.sh:44`, `packages/pipeline/tests/test_railway_packaging.py:148`, `docs/development/gotchas.md:120`

### OPS-16 · Corpus job has no drain time and parses downloads as root with every credential

**medium** · effort S · reliability, security, dependency

`packages/pipeline/railway.json:19-23` sets no draining time, and Railway documents a default of 0 seconds between SIGTERM and SIGKILL, so the job's tested 30-second stop path (interruption marker, alert ping) is probably never reached when a merge redeploys the service. The image has no `USER` line, and `packages/pipeline/src/pipeline/parse/converter.py:724` runs LibreOffice on downloaded documents with the job's full environment, which per the runbook includes Neo4j release passwords, `WORKOS_API_KEY` and `RAILWAY_TOKEN`. Downloads are limited to allowlisted government hosts. Nothing audits Python dependencies for vulnerabilities.

**Impact.** A merge during a multi-hour parse or release could kill the job with no marker or alert context, which is the trigger for the unfenced cutover. A parser exploit would run with production credentials.

**Fix.** Set the service variable `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=60` on corpus-job and record it in the runbook's variable list. Pass an explicit `env=` allowlist (PATH, HOME, TMPDIR, LANG) to the LibreOffice `subprocess.run`. Add `uv audit` or pip-audit against `packages/pipeline/uv.lock` to the build workflow. Do not add a `USER` line, because Railway volumes are root-owned.

*What is and is not established: Neither the dashboard's draining value nor a real teardown was observed. The credential exposure needs a parser exploit delivered through an allowlisted government host.*

Where: `packages/pipeline/railway.json:19`, `scripts/ops/railway-corpus-job.sh:261`, `packages/pipeline/src/pipeline/parse/converter.py:724`, `packages/pipeline/Dockerfile:57`

### OPS-17 · Local graphs never pass readiness, so real-agent smoke suites skip as 'Agent not reachable'

**medium** · effort S · test gap, reliability

`handleReadiness` (`packages/agent/src/readiness.ts:60-68`) requires a non-null `CorpusRelease.release_id` from the graph in every environment, and only the release path writes that node; `run-all` and `build-mixed-corpus` never do. A graph built that way makes `/readyz` and `/healthz` return 503 with Neo4j healthy, and the three smoke specs turn any non-OK `/healthz` into a skip labelled 'Agent not reachable' (`e2e/tests/smoke/chat-roundtrip.spec.ts:11-14`). The local graph has no `CorpusRelease` node.

**Impact.** A developer running `npm run test:e2e:smoke` sees three skipped suites and no failure, so the real chat path goes unexercised locally before production smoke.

**Fix.** Require a graph release id in `packages/agent/src/readiness.ts` only when `NODE_ENV` is `production` or `CORPUS_RELEASE_ID` is set, and retarget the unit test. Move the three `beforeAll` blocks into one helper that skips only when `/livez` is unreachable and fails with the readiness body when `/healthz` is not 200. Do not stamp development graphs: `write_section_roles` refuses a stamped graph (`packages/pipeline/src/pipeline/graph/corpus_writer.py:115`). Record the remaining stamped-graph requirements in `docs/development/gotchas.md`.

*What is and is not established: The 503 is derived from the handler and its unit test; no server was started.*

Where: `packages/agent/src/readiness.ts:64`, `e2e/tests/smoke/chat-roundtrip.spec.ts:11`, `packages/pipeline/src/pipeline/cli/build.py:342`, `packages/pipeline/src/pipeline/graph/corpus_writer.py:115`

### OPS-18 · Corpus-job image ships unused CUDA libraries and downloads parser models at run time

**medium** · effort M · dependency, cost, reliability

`packages/pipeline/uv.lock` resolves torch 2.11.0 from PyPI, whose Linux wheel pulls 19 NVIDIA, CUDA and triton packages: 2,076 of 2,815 MiB of Python downloads in one measured build, for a container with no graphics processor. No model weights are baked in: Docling's layout and table models come from Hugging Face and RapidOCR's weights from modelscope.cn on first use in each fresh container, inside the per-PDF deadline. A draft pull request records one model-fetch stall.

**Impact.** An outage or block at either model host would surface as per-file parse timeouts that fail the corpus run and delay a refresh. The unused libraries enlarge every image build and pull.

**Fix.** Declare torch and torchvision as direct dependencies in `packages/pipeline/pyproject.toml`, pinned to the locked versions, and point them at the PyTorch CPU index through `[tool.uv.sources]`; run `uv lock` and confirm no `nvidia-`, `cuda-` or `triton` packages remain. In the Dockerfile, run `docling-tools models download layout tableformer rapidocr`, set `DOCLING_ARTIFACTS_PATH` and `HF_HUB_OFFLINE=1`, and add a build-time one-page conversion with and without text recognition. Compare a few representative parses with current output.

*What is and is not established: Sizes were measured in one build. That models are fetched on every production run is inferred from code; no container was inspected.*

Where: `packages/pipeline/Dockerfile:46`, `packages/pipeline/uv.lock:2461`, `packages/pipeline/pyproject.toml:1`, `packages/pipeline/src/pipeline/parse/converter.py:67`

## Low severity

### OPS-19 · The graph reset is never confirmed before a release build proceeds

**low** · effort S · data quality, reliability

`reset_database` (`packages/pipeline/src/pipeline/graph/schema.py:40`) runs one auto-commit delete and discards the result; the installed Neo4j driver logs, and does not raise, a failed commit when the session closes. No emptiness check follows, so a build could proceed on the old graph.

**Impact.** A release could carry leftover change notices, stale reference edges and documents that should have been removed, while its manifest records a clean reset.

**Fix.** Call `.consume()` on the delete, then count nodes and raise unless the count is 0; return the counts into the load stage result. Add `.consume()` to the trailing writes in `graph/schema_version.py:66`, `concepts/seed.py:68` and `references/amendments.py:294`. Report `ineligible_graph_load` in the release counts.

*What is and is not established: No failure of this delete has been observed, and the graph is modest for the configured heap. The swallowed-commit path comes from the driver's source and documentation.*

Where: `packages/pipeline/src/pipeline/graph/schema.py:40`, `packages/pipeline/src/pipeline/graph/loader.py:650`, `packages/pipeline/src/pipeline/references/amendments.py:294`

### OPS-20 · After bootstrap, the first scheduled run always starts a new release

**low** · effort S · cost, reliability

Neither `bootstrap()` nor `release-activate-bootstrap` acknowledges the activated snapshot, so `scripts/ops/railway-corpus-job.sh:76` sees a change and promotes to the other colour. A 2026-10-02 receipt records that colour with no deployment, which makes `railway redeploy` fail.

**Impact.** The first scheduled day either stops before cleanup, mirror and backup, or rebuilds and re-evaluates a corpus identical to the one just activated at the owner's expense.

**Fix.** Acknowledge the snapshot at the end of a successful `release-activate-bootstrap` in `packages/pipeline/src/pipeline/bootstrap_activation.py`. Deploy `neo4j-green` once when the service is created, and have `promote()` fail with a clear message when the target colour has no deployment. Record both in step 8 of `docs/operations/blue-green-corpus-releases.md`.

*What is and is not established: Latent until bootstrap completes. The missing green deployment rests on the 2026-10-02 receipt and was not re-checked against Railway.*

Where: `scripts/ops/railway-corpus-job.sh:76`, `packages/pipeline/src/pipeline/freshness.py:87`, `scripts/ops/corpus-release.sh:297`, `packages/pipeline/src/pipeline/bootstrap_activation.py:132`

### OPS-21 · Bootstrap activation rewrites the agent's entire variable set with `replace: True`

**low** · effort S · reliability

`RailwayTarget.set_target` (`packages/pipeline/src/pipeline/bootstrap_activation.py:76-91`) reads every agent variable, edits four keys and writes the whole map back with `replace: True`; `restore()` does the same.

**Impact.** At the first production cutover a sealed secret could disappear, leaving the agent down until the owner re-enters it by hand.

**Fix.** Send only the four target keys with `replace: false` and `skipDeploys: true`, and delete `ACTIVE_CORPUS_COLOR` explicitly on restore before the redeploy. Update `packages/pipeline/tests/test_bootstrap_activation.py` to assert that no other key is sent. Before cutover, confirm in the dashboard that `NEO4J_URI`, `NEO4J_PASSWORD` and `CORPUS_RELEASE_ID` are not sealed.

*What is and is not established: Not verified: whether any agent variable is sealed, or whether Railway drops a sealed variable on a replacing write.*

Where: `packages/pipeline/src/pipeline/bootstrap_activation.py:90`, `packages/pipeline/tests/test_bootstrap_activation.py:192`

### OPS-22 · `parse-import` reads manifest and sidecar fields only after replacing the first artifact

**low** · effort S · data quality, test gap

`packages/pipeline/src/pipeline/recovery_import.py:194-195` first reads `manifest["code_commit"]` and `meta["parsed_at"]` after `save_parsed` has replaced a document's files. A hand-assembled manifest missing `code_commit` passes the dry run, then fails mid-apply. The runbook promises rejection before any write.

**Impact.** An operator importing recovered parses is left with a partly applied batch and one document without its provenance record. Originals are journaled, so recovery by hand is possible.

**Fix.** Check `code_commit`, `parsed_at` and the fields `save_parsed` indexes in the validation loop, using one shared check exported from `packages/pipeline/src/pipeline/parse/converter.py`. Give `next()` a default that raises the existing `ValueError`. Extend `test_rejects_tampering_before_writing` with cases that remove `code_commit` and one sidecar field.

*What is and is not established: Derived from the code; the failing import was not reproduced, and it needs a hand-assembled manifest.*

Where: `packages/pipeline/src/pipeline/recovery_import.py:190`, `packages/pipeline/src/pipeline/parse/converter.py:982`, `docs/operations/blue-green-corpus-releases.md:107`

### OPS-23 · Release code carries a dead fee-schedule report and write-only marker state

**low** · effort M · needless complexity

`build_fee_schedule_backlog_report` (`packages/pipeline/src/pipeline/source_selection.py:476`) counts only transient statuses and returned zeros for all 1,998 fee rows in the workstation registry. The graph marker's `promoted` and `rolled_back` values are written but never read.

**Impact.** The solo operator carries about 240 lines, a command and extra states that do nothing, in code that must be reasoned about during an incident.

**Fix.** Delete the backlog report, its command, the re-export at `packages/pipeline/src/pipeline/cli/__init__.py:18` and its tests, then run Ruff and Vulture. Remove the graph `promotion_state` property, the `promoted` and `rolled_back` calls to `release-mark-graph` and the comparison at `packages/pipeline/src/pipeline/cli/release.py:742`. Keep the manifest `events` list as audit evidence. Decide the fate of the one-shot bootstrap path only after the first cutover.

*What is and is not established: The zero counts come from the workstation registry. Volume retention is in use today; its removal belongs to the cutover redesign, not to this cleanup.*

Where: `packages/pipeline/src/pipeline/source_selection.py:476`, `packages/pipeline/src/pipeline/cli/audit.py:25`, `packages/pipeline/src/pipeline/release.py:148`, `packages/pipeline/src/pipeline/cli/release.py:742`
