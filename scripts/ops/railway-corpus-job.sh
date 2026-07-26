#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/scripts/ops/lib.sh"

: "${CORPUS_DATA_ROOT:=/data}"
export CORPUS_DATA_ROOT
PIPELINE_DIR="$REPO_ROOT/packages/pipeline"
CRAWLER_DIR="$REPO_ROOT/packages/crawler"
PY="${PIPELINE_PYTHON:-$PIPELINE_DIR/.venv/bin/python}"
SNAPSHOT_DIR="$CORPUS_DATA_ROOT/pipeline/release-state"
SNAPSHOT_STATE="$SNAPSHOT_DIR/answer-ready.json"
SNAPSHOT_RESULT="$SNAPSHOT_DIR/answer-ready-result.json"
JOB_MODE="${CORPUS_JOB_MODE:-scheduled}"
HC_URL="${HC_URL_CORPUS_JOB:-}"
hc_trap
hc_start

mkdir -p \
  "$CORPUS_DATA_ROOT/crawler/documents" \
  "$CORPUS_DATA_ROOT/pipeline/parsed" \
  "$CORPUS_DATA_ROOT/pipeline/audits" \
  "$CORPUS_DATA_ROOT/pipeline/eval-results" \
  "$CORPUS_DATA_ROOT/pipeline/releases" \
  "$SNAPSHOT_DIR"

if [[ ! -f "$CORPUS_DATA_ROOT/crawler/crawler.db" ]]; then
  log "restoring corpus-job volume from Railway Object Storage"
  "$REPO_ROOT/scripts/ops/restore-corpus-artifacts.sh"
fi

active_graph_env() {
  local variables active_color uri_key password_key active_password
  variables="$(railway_cli variables \
    --environment "${RAILWAY_ENVIRONMENT:-production}" \
    --service "${RAILWAY_AGENT_SERVICE:-@nc-medicaid/agent}" \
    --kv)"
  active_color="$(awk -F= '$1 == "ACTIVE_CORPUS_COLOR" {print substr($0, index($0, "=") + 1); exit}' <<<"$variables")"
  [[ "$active_color" == "blue" || "$active_color" == "green" ]] || {
    log "agent ACTIVE_CORPUS_COLOR is not configured"
    return 1
  }
  uri_key="NEO4J_${active_color^^}_URI"
  password_key="NEO4J_${active_color^^}_PASSWORD"
  export NEO4J_URI="${!uri_key:?}"
  active_password="${!password_key:-}"
  export NEO4J_PASSWORD="${active_password:-${NEO4J_PASSWORD:-}}"
  [[ -n "$NEO4J_PASSWORD" ]] || {
    log "missing $password_key (or shared NEO4J_PASSWORD)"
    return 1
  }
}

discover_and_release() {
  log "daily discovery starting"
  (
    cd "$CRAWLER_DIR"
    npx tsx src/index.ts crawl
  )
  (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli parse --strict
    "$PY" -m pipeline.cli answer-ready-snapshot \
      --state-file "$SNAPSHOT_STATE" \
      --json-output "$SNAPSHOT_RESULT" \
      --no-acknowledge
  )

  if jq -e '.changed == true' "$SNAPSHOT_RESULT" >/dev/null; then
    log "answer-ready corpus changed; starting gated blue-green release"
    "$REPO_ROOT/scripts/ops/corpus-release.sh" promote
    (
      cd "$PIPELINE_DIR"
      "$PY" -m pipeline.cli acknowledge-answer-ready-snapshot \
        --state-file "$SNAPSHOT_STATE" \
        --snapshot-file "$SNAPSHOT_RESULT"
    )
  else
    log "answer-ready corpus unchanged"
  fi
  "$REPO_ROOT/scripts/ops/sync-current-corpus.sh"
}

weekly_audit_if_due() {
  [[ "$(date -u +%u)" == "7" ]] || return 0
  log "weekly full corpus audit starting"
  active_graph_env
  (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli audit-corpus
  )
}

monthly_evaluation_if_due() {
  [[ "$(date -u +%d)" == "01" ]] || return 0
  log "monthly retrieval and answer evaluation starting"
  active_graph_env
  (
    cd "$PIPELINE_DIR"
    MASTRA_OBSERVABILITY_PATH=":memory:" \
      "$PY" -m pipeline.cli eval --level retrieval
    MASTRA_OBSERVABILITY_PATH=":memory:" \
      "$PY" -m pipeline.cli eval --level answer
  )
}

scheduled() {
  discover_and_release
  "$REPO_ROOT/scripts/ops/corpus-release-cleanup.sh"
  weekly_audit_if_due
  monthly_evaluation_if_due
  "$REPO_ROOT/scripts/ops/sync-current-corpus.sh"
  "$REPO_ROOT/scripts/ops/object-storage-backup.sh"
}

case "$JOB_MODE" in
  scheduled) scheduled ;;
  discover) discover_and_release ;;
  bootstrap) "$REPO_ROOT/scripts/ops/corpus-release.sh" bootstrap ;;
  release) "$REPO_ROOT/scripts/ops/corpus-release.sh" promote ;;
  rollback) "$REPO_ROOT/scripts/ops/corpus-release.sh" rollback ;;
  cleanup) "$REPO_ROOT/scripts/ops/corpus-release-cleanup.sh" ;;
  audit)
    active_graph_env
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli audit-corpus
    ;;
  evaluate)
    active_graph_env
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli eval --level retrieval
    "$PY" -m pipeline.cli eval --level answer
    ;;
  backup) "$REPO_ROOT/scripts/ops/object-storage-backup.sh" ;;
  *)
    echo "Unknown CORPUS_JOB_MODE: $JOB_MODE" >&2
    exit 64
    ;;
esac
hc_ok
