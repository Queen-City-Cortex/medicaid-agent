---
title: Ops Backup Workflow and Storage
summary: Backup workflow for corpus and Mastra data using Railway bucket, rclone, sqlite3 VACUUM INTO snapshots, and healthchecks notifications
tags: []
related: []
keywords: []
createdAt: '2026-07-10T18:50:24.520Z'
updatedAt: '2026-07-10T18:50:24.520Z'
---
## Reason
Document backup scripts, storage bucket details, and operational constraints from the curated context

## Raw Concept
**Task:**
Document the operational backup workflow for corpus data and the Mastra production database.

**Changes:**
- Captured shared ops helpers for logging, locking, healthchecks, and Railway CLI wrapping
- Captured weekly corpus backup flow and retention rules
- Captured daily Mastra backup flow, integrity verification, and retention rules

**Files:**
- scripts/ops/lib.sh
- scripts/ops/backup-corpus.sh
- scripts/ops/backup-mastra.sh

**Flow:**
load ops.env -> start healthcheck -> snapshot data -> copy to Railway bucket -> prune retention -> send healthcheck ok/fail

**Timestamp:** 2026-07-10

**Author:** ByteRover context engineering instructions

## Narrative
### Structure
lib.sh centralizes logging, healthchecks, locks, Railway CLI wrapping, and bucket path construction; backup-corpus.sh handles weekly corpus state; backup-mastra.sh handles the daily production database copy.

### Dependencies
Requires rclone, sqlite3, Railway SSH access, bucket-scoped credentials, and optionally jq for the final retained-copy count in backup-mastra.sh.

### Highlights
Corpus backups retain deleted or overwritten files using --backup-dir and prune deleted history after 120 days. Mastra backups validate the downloaded SQLite snapshot with PRAGMA integrity_check and prune bucket copies after 30 days.

### Rules
Shared helpers: "Every railway CLI call must strip the stale shell RAILWAY_API_TOKEN: use the `railway_cli` wrapper below." Backup-corpus: "rclone `sync` mirrors deletions, but --backup-dir retains every deleted or overwritten file under deleted/<date>/ — so a crawler bug that wipes documents can't silently propagate into the only copy." Backup-mastra: "Railway's native volume backups (dashboard → agent service → volume → Backups) should ALSO be enabled — they restore fastest but live in the same project; this script is the independent copy."

### Examples
backup-corpus.sh backs up crawler/documents, pipeline/parsed, and pipeline/{golden,audits,references,ecfr-cache,eval-results}. backup-mastra.sh uses railway ssh to run VACUUM INTO inside the container, downloads the snapshot, verifies it with sqlite3 PRAGMA integrity_check, and uploads it to the bucket.

## Facts
- **railway_backup_bucket**: A Railway bucket named 'backups' was created in region iad with name backups-opc52lfuqxshx6vyl. [project]
- **backup_bucket_endpoint**: The bucket endpoint is https://t3.storageapi.dev and it uses virtual-host URL style with region auto. [project]
- **bucket_scoped_credentials_behavior**: Bucket-scoped credentials cannot ListBuckets and require operating on ncmedicaid:<bucketName>/ paths. [project]
- **ops_env_location**: The scripts use ~/.config/nc-medicaid/ops.env for secrets and configuration, including BACKUP_REMOTE, BACKUP_BUCKET, HC_URL_* and optional RAILWAY_TOKEN. [convention]
- **railway_cli_wrapper**: Every railway CLI call must strip the stale shell RAILWAY_API_TOKEN via the railway_cli wrapper. [convention]
- **corpus_backup_scope**: backup-corpus.sh runs weekly and backs up crawler registry, downloaded documents, parsed artifacts, and small durable pipeline data. [project]
- **corpus_backup_mechanism**: backup-corpus.sh uses sqlite3 VACUUM INTO for a consistent crawler registry snapshot and rclone sync with --backup-dir undo retention. [project]
- **mastra_backup_schedule**: backup-mastra.sh runs daily and snapshots the production LibSQL store from the agent Railway volume. [project]
- **mastra_backup_mechanism**: backup-mastra.sh creates a consistent snapshot inside the container with SQLite VACUUM INTO or @libsql/client fallback, then downloads, integrity-checks, and uploads it. [project]
- **railway_ssh_prereqs**: Railway SSH setup requires railway ssh keys add and ssh-keyscan ssh.railway.com into known_hosts. [project]
- **healthchecks_dead_man_switch**: The backup scripts ping healthchecks.io with hc_start, hc_ok, and hc_fail and never let healthchecks outages fail the backup. [project]
