#!/usr/bin/env bash
# Weekly corpus backup to the Railway bucket.
#
# What gets backed up (the laptop-only assets production is derived from —
# with these, the prod Neo4j graph is fully rebuildable via deploy-data):
#   crawler/crawler-YYYY-MM-DD.db      consistent snapshot of the crawl registry
#   crawler/documents/                 downloaded PDFs (~3 GB, incremental sync)
#   pipeline/parsed/                   Docling outputs (~3 GB, incremental sync)
#   pipeline/{golden,audits,references,ecfr-cache}/   small durable data
#
# rclone `sync` mirrors deletions, but --backup-dir retains every deleted or
# overwritten file under deleted/<date>/ — so a crawler bug that wipes
# documents can't silently propagate into the only copy.
#
# Usage: scripts/ops/backup-corpus.sh    (also called from weekly-refresh.sh)

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

HC_URL="${HC_URL_BACKUP:-}"
LOG_FILE="$LOG_DIR/backup-corpus-$(date +%F).log"
exec > >(tee -a "$LOG_FILE") 2>&1
hc_trap
hc_start

require_tool rclone
require_tool sqlite3

STAMP="$(date +%F)"
CRAWLER_DATA="$REPO_ROOT/packages/crawler/data"
PIPELINE_DATA="$REPO_ROOT/packages/pipeline/data"

# A missing OR empty source on a fresh/partially-restored machine must abort
# loudly: rclone sync would treat it as "everything was deleted" and move the
# entire remote mirror into the undo directory.
[[ -f "$CRAWLER_DATA/crawler.db" ]] || { log "missing $CRAWLER_DATA/crawler.db — refusing to back up"; exit 1; }
for required in "$CRAWLER_DATA/documents" "$PIPELINE_DATA/parsed"; do
  [[ -d "$required" && -n "$(ls -A "$required" 2>/dev/null)" ]] \
    || { log "$required is missing or empty — refusing to sync an empty source over the backup"; exit 1; }
done

log "corpus backup starting (stamp $STAMP)"

# 1. Crawler registry — VACUUM INTO gives a consistent point-in-time snapshot
#    even mid-WAL; never copy the live file. Dated copies, pruned after 90d.
SNAP="$(mktemp -d)/crawler-$STAMP.db"
sqlite3 "$CRAWLER_DATA/crawler.db" "VACUUM INTO '$SNAP'"
rclone copyto "$SNAP" "$(bucket_path "crawler/registry/crawler-$STAMP.db")"
rm -f "$SNAP"
rclone delete --min-age 90d "$(bucket_path 'crawler/registry')" || true

# 2. Downloaded documents (~3 GB first run, deltas after).
rclone sync "$CRAWLER_DATA/documents" "$(bucket_path 'crawler/documents')" \
  --backup-dir "$(bucket_path "crawler/deleted/$STAMP")" \
  --transfers 8 --stats-one-line --stats 60s

# 3. Parsed artifacts (~3 GB first run, deltas after).
rclone sync "$PIPELINE_DATA/parsed" "$(bucket_path 'pipeline/parsed')" \
  --backup-dir "$(bucket_path "pipeline/deleted/$STAMP")" \
  --transfers 8 --stats-one-line --stats 60s

# 4. Small durable pipeline data. eval-results included: it's cheap and holds
#    the benchmark history the stability tooling reads.
for dir in golden audits references ecfr-cache eval-results source-retirement-evidence; do
  [[ -d "$PIPELINE_DATA/$dir" ]] || continue
  rclone sync "$PIPELINE_DATA/$dir" "$(bucket_path "pipeline/$dir")" \
    --backup-dir "$(bucket_path "pipeline/deleted/$STAMP")" --stats-one-line
done

# Prune deleted-file retention after 120d (four months of undo).
rclone delete --min-age 120d "$(bucket_path 'crawler/deleted')" 2>/dev/null || true
rclone delete --min-age 120d "$(bucket_path 'pipeline/deleted')" 2>/dev/null || true
rclone rmdirs --leave-root "$(bucket_path 'crawler/deleted')" 2>/dev/null || true
rclone rmdirs --leave-root "$(bucket_path 'pipeline/deleted')" 2>/dev/null || true

log "corpus backup complete"
hc_ok
