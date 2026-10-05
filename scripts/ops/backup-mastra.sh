#!/usr/bin/env bash
# Daily off-platform backup of the production LibSQL store (chat history,
# feedback, rate-limit audit log) from the agent's Railway volume to the
# Railway bucket.
#
# Approach: wake the sleeping agent service, take a consistent point-in-time
# snapshot INSIDE the container with SQLite's VACUUM INTO (copying the live
# WAL-mode file directly risks a torn read), download it, push it to the
# bucket. Snapshots on the volume are swept before each run and removed by an
# exit hook after it, however the run ends. Dated copies are pruned after 30
# days.
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

# Overlapping runs (a manual retry racing the scheduled job) share the same
# snapshot path in the container — one run's sweep/cleanup would clobber the
# other's snapshot mid-download. One run at a time.
acquire_lock mastra-backup || exit 0
hc_trap
hc_start

require_tool curl
require_tool jq
require_tool rclone
require_tool sqlite3

AGENT_SERVICE='@nc-medicaid/agent'
AGENT_HEALTHZ_URL="${AGENT_HEALTHZ_URL:-https://medicaid-agent-backend.up.railway.app/healthz}"
WAKE_ATTEMPTS="${AGENT_WAKE_ATTEMPTS:-30}"
WAKE_INTERVAL="${AGENT_WAKE_INTERVAL_SECONDS:-10}"
STAMP="$(date +%F)"
REMOTE_GLOB='/data/mastra-backup-*.db'
REMOTE_SNAP="/data/mastra-backup-$STAMP.db"
INSTANCE_ID=""
LOCAL_DIR=""

log "mastra backup starting (stamp $STAMP)"

# The agent service sleeps when idle (sleepApplication), and SSH does not wake
# it. Poll /healthz until it answers 200; the first hits after a sleep can 502.
wake_agent() {
  local attempt code
  for ((attempt = 1; attempt <= WAKE_ATTEMPTS; attempt++)); do
    code="$(curl -sS -o /dev/null -m 15 -w '%{http_code}' "$AGENT_HEALTHZ_URL" 2>/dev/null || true)"
    [[ "$code" == "200" ]] && return 0
    sleep "$WAKE_INTERVAL"
  done
  log "agent /healthz did not return 200 after $WAKE_ATTEMPTS attempts (last: ${code:-none})"
  return 1
}

# After a wake, `railway ssh` can default to an obsolete instance and return
# account JSON instead of command output. Pick the RUNNING instance of the
# agent's current deployment and name it on every ssh call.
resolve_instance() {
  local status id
  status="$(railway_cli status --json)" || return 1
  id="$(jq -r --arg service "$AGENT_SERVICE" '
    [.. | objects | select(.serviceName? == $service)
     | (.latestDeployment.instances[]?, .activeDeployments[]?.instances[]?)
     | select(.status == "RUNNING") | .id] | first // empty' <<<"$status")" || return 1
  if [[ -z "$id" ]]; then
    log "no RUNNING instance found for $AGENT_SERVICE"
    return 1
  fi
  # Set only on success: a failed retry must not forget the instance an
  # earlier attempt may have written a snapshot on.
  INSTANCE_ID="$id"
}

agent_ssh() {
  railway_cli ssh -s "$AGENT_SERVICE" --deployment-instance "$INSTANCE_ID" -- "$1" 2>&1
}

# 1. Consistent snapshot inside the container via sqlite3 (installed in the
#    runner image alongside gosu — the mastra bundle does not expose a usable
#    node_modules tree, so a node/@libsql fallback is not reliable there).
#    Two hazards, both observed on the first live run:
#    - The remote command must be ONE argument: ssh joins arguments with
#      spaces and the remote shell re-parses them, so a multi-line
#      `sh -c "…"` arrives as `sh -c` with the script on the next line.
#    - `railway ssh` exits 0 even when the remote command fails, so success
#      is confirmed by a sentinel in the output, not the exit code.
#    The sweep removes every earlier snapshot first, whatever its date: a run
#    that died before its cleanup must not leave a plaintext copy of the store
#    on the volume, and VACUUM INTO refuses to overwrite. The glob stays
#    inside the quoted command so the remote shell expands it.
take_snapshot() {
  local out
  wake_agent || return 1
  resolve_instance || return 1
  out="$(agent_ssh "command -v sqlite3 >/dev/null 2>&1 && rm -f $REMOTE_GLOB && sqlite3 /data/mastra.db \"VACUUM INTO '$REMOTE_SNAP'\" && echo SNAPSHOT_OK || echo SNAPSHOT_FAILED")" || true
  if ! grep -q 'SNAPSHOT_OK' <<<"$out"; then
    log "in-container snapshot failed (instance $INSTANCE_ID): $out"
    return 1
  fi
}

# Runs at exit however the run ends, and is registered before the first
# snapshot attempt: a VACUUM INTO that dies part-way, or one whose sentinel is
# lost, has still written a copy to the volume. With no instance resolved no
# ssh was sent, so there is nothing remote to remove. Otherwise CLEAN_OK is
# echoed only when no snapshot is left on the volume; without it the hook
# fails and the run is reported failed.
cleanup_snapshot() {
  local out status=0
  if [[ -n "$LOCAL_DIR" ]] && ! rm -rf "$LOCAL_DIR"; then
    log "could not remove local snapshot directory $LOCAL_DIR"
    status=1
  fi
  [[ -n "$INSTANCE_ID" ]] || return "$status"
  out="$(agent_ssh "rm -f $REMOTE_GLOB && ! ls $REMOTE_GLOB >/dev/null 2>&1 && echo CLEAN_OK")" || true
  if ! grep -q 'CLEAN_OK' <<<"$out"; then
    log "could not confirm removal of $REMOTE_GLOB in container: $out"
    status=1
  fi
  return "$status"
}

add_exit_hook cleanup_snapshot
if ! take_snapshot; then
  log "retrying snapshot once"
  take_snapshot || exit 1
fi

# 2. Download the snapshot, verify integrity locally, push to the bucket.
#    (-s is an option of `service files`, not of the download subcommand.)
LOCAL_DIR="$(mktemp -d)"
LOCAL_SNAP="$LOCAL_DIR/mastra-$STAMP.db"
railway_cli service files -s "$AGENT_SERVICE" download --overwrite "$REMOTE_SNAP" "$LOCAL_SNAP"
INTEGRITY="$(sqlite3 "$LOCAL_SNAP" 'PRAGMA integrity_check;')"
if [[ "$INTEGRITY" != "ok" ]]; then
  log "integrity check FAILED: $INTEGRITY"
  exit 1
fi
rclone copyto "$LOCAL_SNAP" "$(bucket_path "agent/mastra/mastra-$STAMP.db")"

# 3. Prune bucket copies older than 30 days.
rclone delete --min-age 30d "$(bucket_path 'agent/mastra')" || true

log "mastra backup complete"
hc_ok
