# Working artifact from the ops-deploy-ci reviewer

### A. Scheduled jobs: state observed on the ops laptop, 2026-10-04

| Job | Host / trigger | Script | Observed state | Last verified success |
|---|---|---|---|---|
| Prod chat-store backup | launchd, daily 06:45 | scripts/ops/backup-mastra.sh | exit 1 on 13 consecutive days (`in-container snapshot failed`; Railway account JSON instead of command output) | 2026-09-21 |
| Daily document check | launchd, daily 07:30 | scripts/ops/daily-check.sh | exit 1 at crawl on 10-04 (better-sqlite3 built for Node 22; launchd PATH resolves Node 26.9.0); same-size logs on 10-02 and 10-03 | unknown (logs before 10-02 are 0 bytes) |
| Weekly refresh + prod push | launchd, Sat 08:00 | scripts/ops/weekly-refresh.sh | 10-03: dies at `[1/7] crawling` (same ABI error) after recreating the local Neo4j container; 09-19: `Docker is not running` (same-size log on 09-12) | none in the retained logs |
| Laptop corpus backup | last step of weekly refresh | scripts/ops/backup-corpus.sh | no `backup-corpus-*.log` exists in the 59-day log window | none in the retained logs |
| Hosted corpus job | Railway cron, 10:00 UTC | scripts/ops/railway-corpus-job.sh | not inspected live; docs say maintenance mode, scheduling disabled, never promoted | n/a |

Gate state for the weekly job: `~/.cache/nc-medicaid/` is empty (no `last-good-eval`, no `last-deploy.manifest`). Four `HC_URL_*` values are populated in ops.env. `launchctl list` shows all three agents loaded with last exit status 1.

### B. Promote failure-point ledger (scripts/ops/corpus-release.sh)

| Where promote stops | State left behind | What the next daily run does |
|---|---|---|
| 411-416 retention check refuses | nothing changed; exit 1 | fails again daily until the 7-day window closes; cleanup, mirror and backup skipped each day |
| 425-450 redeploy / prepare / build / validate | inactive graph partly built; manifest `building` or `rejected` | rebuilds from scratch (paid embeddings again) |
| 455 set_agent_target fails, restore succeeds | agent back on previous target; manifests updated; exit 1 | normal retry |
| 455 or 474 fails and restore fails | agent variables may point at the new colour; manifest `recovery_pending` (no reader); exit 1 | reads the new colour as active, passes the retention check for the old colour, resets the last verified graph |
| killed between 455 and 494 (default drain 0 s) | agent on new colour; manifest `validated`; previous manifest has no rollback window or retention | same as above; `rollback` refuses: window not recorded |
| 492-500 mark-promoted fails, mark-graph succeeds | masked: prints `Promotion verified`; manifest `validated`; graph stamped promoted | rollback unavailable; old colour can be reset immediately; old service never stopped |
| 516-519 sync or upload fails | promoted, snapshot not acknowledged | tries to promote the same content again; blocked by retention for 7 days |

### C. Backup / restore matrix

| Data | Backup mechanism | Encrypted | Off-Railway copy | Restore tooling | Exercised |
|---|---|---|---|---|---|
| mastra.db (chat, feedback, signing key) | backup-mastra.sh over railway ssh; daily; 30-day retention | no | no | RUNBOOK prose (omits -wal/-shm removal) | integrity_check at backup time only; no backup since 2026-09-21 |
| Corpus mirror (registry, documents, parsed, evidence) | sync-current-corpus.sh; rclone sync; no undo directory | no | no | restore-corpus-artifacts.sh (empty volume only; happy-path tests with a fake rclone) | never on a real volume loss |
| Corpus archive | object-storage-backup.sh; tar + age; daily; 400-day retention | yes (identity in one macOS Keychain) | optional SECONDARY_RCLONE_TARGET | none (verify-corpus-backup.py verifies; macOS only) | verifier run manually per docs |
| Neo4j graphs | none by design (rebuilt) | n/a | n/a | rebuild through the release job | legacy deploy-data path breaks readiness |
| Railway variables, volumes, service settings | none | n/a | n/a | none (dashboard state) | n/a |
| Laptop gate state (~/.cache/nc-medicaid) | none | n/a | n/a | none; currently missing | n/a |

### D. What gates what

| Control | Present | Effect |
|---|---|---|
| CI on PRs and main (test, mocked e2e, docker builds) | yes, about 3.5 min | informational on PRs; Railway waits for it on main |
| Required status checks / branch protection | not available (org plan free, private repo; API returns 403) | nothing blocks a push or merge to main |
| Railway deploy healthcheck | agent /readyz only | web deploys are not verified |
| Continuous health monitoring | none in the repo (Railway probes only at deploy) | outages surface through users or dead-man pings |
| Shell / workflow / Dockerfile linters | none | ops shell is reviewed by hand only |
| Third-party action pinning | 5 of 6 actions by verified SHA; claude-code-action by floating `v1` | the one unpinned action is the one holding a write token and the OAuth secret |

### E. Reproductions (all in the scratch directory; nothing in the repo was modified)

- .dockerignore: `FROM scratch` + `COPY . /ctx` with the repo's .dockerignore and dummy files; nested `.env`, `.env.local`, `*.db`, `*.db-wal`, `*.duckdb` appear in the output, root-level ones do not.
- turbo: two-package workspace with the repo's turbo.json; a dependency change yields `cache hit, replaying logs` and a stale PASS, `--force` shows FAIL; adding `"transit": {"dependsOn": ["^transit"]}` and `"dependsOn": ["transit"]` on test turns it into a miss with the correct FAIL. Strict env mode drops `CORPUS_DATA_ROOT` and `RUN_NEO4J_INTEGRATION`.
- errexit: `if ! ( cd /tmp; failing_cmd; succeeding_cmd ); then ...` continues as success under bash 3.2.57 and 5.3.20.
- BusyBox: `sh -c "HOSTNAME=0.0.0.0 readlink /proc/self"` prints `1` on BusyBox 1.37 (the final command replaces the shell), so the web image's CMD delivers signals to node.
- Pinned actions: the SHAs for checkout, setup-node, setup-python, cache and upload-artifact resolve to v7.0.1, v7.0.0, v7.0.0, v6.1.0 and v7.0.1; `anthropics/claude-code-action@v1` resolved to a commit dated 2026-10-03.
