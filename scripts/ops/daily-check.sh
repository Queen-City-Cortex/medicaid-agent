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

# The crawler exits with this status (DISCOVERY_FAILED_EXIT_CODE in
# packages/crawler/src/cli/crawl.ts) when its run finished but discovery failed
# for a source family that is required for answering.
CRAWL_DISCOVERY_FAILED_EXIT=3

log "daily document discovery starting"
if (cd "$REPO_ROOT/packages/crawler" && npx tsx src/index.ts crawl); then
  crawl_exit=0
else
  crawl_exit=$?
fi
# A failed required family still leaves a finished crawl: parse what the
# healthy families delivered, never ask for a release, and exit non-zero at the
# end so the healthcheck goes red. Any other status is a crash and stops here.
if [[ "$crawl_exit" -ne 0 && "$crawl_exit" -ne "$CRAWL_DISCOVERY_FAILED_EXIT" ]]; then
  exit "$crawl_exit"
fi

log "parsing newly downloaded or changed documents"
(cd "$PIPELINE_DIR" && "$PY" -m pipeline.cli parse)

log "checking answer-ready corpus snapshot"
(cd "$PIPELINE_DIR" && "$PY" -m pipeline.cli answer-ready-snapshot \
  --state-file "$SNAPSHOT_STATE" \
  --json-output "$SNAPSHOT_RESULT" \
  --no-acknowledge)

if [[ "$crawl_exit" -ne 0 ]]; then
  log "discovery failed for a required source family — not triggering a corpus release"
  exit "$crawl_exit"
fi

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
