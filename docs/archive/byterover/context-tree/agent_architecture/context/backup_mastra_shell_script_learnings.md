---
title: Backup Mastra Shell Script Learnings
tags: []
related: [agent_architecture/context/curated_operational_knowledge.md, agent_architecture/context/provider_health_checks_and_production_smoke_verification.md, agent_architecture/context/weekly_eval_and_launchd_ops_guardrails.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-10T23:23:21.911Z'
updatedAt: '2026-07-10T23:23:21.911Z'
---
## Raw Concept
**Task:**
Document the live-run operational learnings and backup procedure for the production LibSQL store used by the agent

**Changes:**
- Added a consistent point-in-time snapshot flow using sqlite3 VACUUM INTO inside the Railway container
- Added sentinel-based remote success verification because railway ssh exit status is unreliable
- Added cleanup and retry-idempotence safeguards including rm -f before VACUUM INTO and local overwrite support

**Files:**
- scripts/ops/backup-mastra.sh

**Flow:**
railway ssh into container -> rm old snapshot -> VACUUM INTO remote snapshot -> echo SNAPSHOT_OK -> download snapshot -> sqlite3 integrity_check -> rclone copyto -> cleanup -> prune aged backups

**Timestamp:** 2026-07-10T23:22:49.680Z

**Author:** PR #85

**Patterns:**
- `SNAPSHOT_OK` - Sentinel string confirming the remote snapshot command succeeded
- `SNAPSHOT_FAILED` - Sentinel string indicating the remote snapshot command failed

## Narrative
### Structure
The script backs up the production LibSQL store by first creating a consistent snapshot inside the Railway container, then downloading it locally, verifying SQLite integrity, pushing it to the bucket, and cleaning up both remote and local temp files. Dated backups are pruned after 30 days.

### Dependencies
Depends on railway CLI, sqlite3, rclone, and the bucket_path helper from lib.sh. It also relies on Railway SSH key registration and ssh-keyscan host trust being configured once.

### Highlights
The first live run exposed three important operational hazards: remote command argument handling, unreliable railway ssh exit codes, and VACUUM INTO overwrite refusal. The verified E2E run produced a 42MB snapshot and a successful restore drill.

### Rules
1. Pass ONE argument to railway ssh for the remote command.
2. Never trust railway ssh exit code alone; confirm success via an output sentinel such as SNAPSHOT_OK.
3. Remove the target file before VACUUM INTO because it refuses to overwrite.
4. Use --overwrite when downloading the snapshot.
5. Put -s on the parent railway service files command, not on download.
6. Keep native Railway volume backups enabled as an independent fast-restore path.

### Examples
Example remote success pattern: command executes and prints SNAPSHOT_OK; if not present, treat the run as failed even if the SSH command exits 0.

## Facts
- **railway_ssh_argument_handling**: railway ssh joins command args with spaces and the remote shell re-parses them, so multi-line remote commands break. [project]
- **railway_ssh_exit_behavior**: railway ssh exits 0 even when the remote command fails, so success must be confirmed via an output sentinel. [project]
- **vacuum_into_overwrite_behavior**: VACUUM INTO refuses to overwrite the target, so the target must be removed first for same-day retry idempotence. [project]
- **railway_service_files_cli**: railway service files -s belongs on the parent service files command, not the download subcommand. [project]
- **backup_verification_result**: The backup drill verified a 42MB snapshot, integrity was ok, and restore showed 49 threads plus 2 usage rows. [project]
