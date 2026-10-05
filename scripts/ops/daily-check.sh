#!/usr/bin/env bash
# Daily discovery, bounded download, parse, and release-change detection.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

HC_URL="${HC_URL_DAILY:-}"
LOG_FILE="$LOG_DIR/daily-check-$(date +%F).log"
exec > >(tee -a "$LOG_FILE") 2>&1
hc_trap
hc_start

acquire_lock daily-check || exit 0
require_tool jq
require_tool curl

PIPELINE_DIR="$REPO_ROOT/packages/pipeline"
SNAPSHOT_STATE="$CACHE_DIR/answer-ready.snapshot.json"
SNAPSHOT_RESULT="$CACHE_DIR/answer-ready.latest.json"
PY="$PIPELINE_DIR/.venv/bin/python"

log "daily document discovery starting"
(cd "$REPO_ROOT/packages/crawler" && npx tsx src/index.ts crawl)

log "parsing newly downloaded or changed documents"
(cd "$PIPELINE_DIR" && "$PY" -m pipeline.cli parse)

log "checking answer-ready corpus snapshot"
(cd "$PIPELINE_DIR" && "$PY" -m pipeline.cli answer-ready-snapshot \
  --state-file "$SNAPSHOT_STATE" \
  --json-output "$SNAPSHOT_RESULT" \
  --no-acknowledge)

if jq -e '.changed == true' "$SNAPSHOT_RESULT" >/dev/null; then
  if [[ -n "${CORPUS_RELEASE_TRIGGER_URL:-}" ]]; then
    log "answer-ready content changed — triggering corpus release"
    curl -fsS -m 30 \
      -H 'content-type: application/json' \
      --data-binary "@$SNAPSHOT_RESULT" \
      "$CORPUS_RELEASE_TRIGGER_URL" >/dev/null
    # The release endpoint accepted the idempotent snapshot request. Only now
    # acknowledge the hash; if curl fails, `set -e` exits first and tomorrow's
    # run compares against the previous delivered snapshot and retries.
    (cd "$PIPELINE_DIR" && "$PY" -m pipeline.cli acknowledge-answer-ready-snapshot \
      --state-file "$SNAPSHOT_STATE" \
      --snapshot-file "$SNAPSHOT_RESULT")
  else
    log "answer-ready content changed — release trigger is not configured in this environment"
  fi
else
  log "answer-ready content unchanged"
fi

log "daily document discovery complete"
hc_ok
