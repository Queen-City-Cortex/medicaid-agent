#!/usr/bin/env bash
# Daily off-platform backup of the production LibSQL store (chat history,
# feedback, rate-limit audit log) from the agent's Railway volume to the
# Railway bucket.
#
# Approach: take a consistent point-in-time snapshot INSIDE the container
# with SQLite's VACUUM INTO (copying the live WAL-mode file directly risks a
# torn read), download it, push it to the bucket, clean up. Dated copies are
# pruned after 30 days.
#
# Prereqs (one-time):
#   railway ssh keys add                  # register this machine's SSH key
#   ssh-keyscan ssh.railway.com >> ~/.ssh/known_hosts
#
# Railway's native volume backups (dashboard → agent service → volume →
# Backups) should ALSO be enabled — they restore fastest but live in the same
# project; this script is the independent copy.
#
# Usage: scripts/ops/backup-mastra.sh

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

HC_URL="${HC_URL_MASTRA_BACKUP:-}"
LOG_FILE="$LOG_DIR/backup-mastra-$(date +%F).log"
exec > >(tee -a "$LOG_FILE") 2>&1
hc_trap
hc_start

require_tool rclone
require_tool sqlite3

AGENT_SERVICE='@nc-medicaid/agent'
STAMP="$(date +%F)"
REMOTE_SNAP="/data/mastra-backup-$STAMP.db"
LOCAL_SNAP="$(mktemp -d)/mastra-$STAMP.db"

log "mastra backup starting (stamp $STAMP)"

# 1. Consistent snapshot inside the container via sqlite3 (installed in the
#    runner image alongside gosu — the mastra bundle does not expose a usable
#    node_modules tree, so a node/@libsql fallback is not reliable there).
#    Two hazards, both observed on the first live run:
#    - The remote command must be ONE argument: ssh joins arguments with
#      spaces and the remote shell re-parses them, so a multi-line
#      `sh -c "…"` arrives as `sh -c` with the script on the next line.
#    - `railway ssh` exits 0 even when the remote command fails, so success
#      is confirmed by a sentinel in the output, not the exit code.
#    rm -f first: VACUUM INTO refuses to overwrite, which would fail every
#    same-day retry after a partial run.
SNAP_OUT="$(railway_cli ssh -s "$AGENT_SERVICE" -- \
  "command -v sqlite3 >/dev/null 2>&1 && rm -f '$REMOTE_SNAP' && sqlite3 /data/mastra.db \"VACUUM INTO '$REMOTE_SNAP'\" && echo SNAPSHOT_OK || echo SNAPSHOT_FAILED" 2>&1)"
if ! grep -q 'SNAPSHOT_OK' <<<"$SNAP_OUT"; then
  log "in-container snapshot failed: $SNAP_OUT"
  exit 1
fi

# 2. Download the snapshot, verify integrity locally, push to the bucket.
#    (-s is an option of `service files`, not of the download subcommand.)
railway_cli service files -s "$AGENT_SERVICE" download --overwrite "$REMOTE_SNAP" "$LOCAL_SNAP"
INTEGRITY="$(sqlite3 "$LOCAL_SNAP" 'PRAGMA integrity_check;')"
if [[ "$INTEGRITY" != "ok" ]]; then
  log "integrity check FAILED: $INTEGRITY"
  exit 1
fi
rclone copyto "$LOCAL_SNAP" "$(bucket_path "agent/mastra/mastra-$STAMP.db")"

# 3. Clean up: the in-container temp file and local copy; prune bucket >30d.
railway_cli ssh -s "$AGENT_SERVICE" -- rm -f "$REMOTE_SNAP" || \
  log "WARNING: could not remove $REMOTE_SNAP in container (harmless; next deploy clears it)"
rm -f "$LOCAL_SNAP"
rclone delete --min-age 30d "$(bucket_path 'agent/mastra')" || true

log "mastra backup complete"
hc_ok
