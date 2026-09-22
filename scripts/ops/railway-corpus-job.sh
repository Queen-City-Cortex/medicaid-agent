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
RUN_STATE_DIR="$CORPUS_DATA_ROOT/pipeline/run-state"
JOB_MODE="${CORPUS_JOB_MODE:-scheduled}"
HC_URL="${HC_URL_CORPUS_JOB:-}"
JOB_RUN_ID="${RAILWAY_DEPLOYMENT_ID:-$(date -u '+%Y%m%dT%H%M%SZ')-$$}"
JOB_STARTED_EPOCH="$(date +%s)"
JOB_FINAL_STATUS=starting
ACTIVE_JOB_PID=""

ensure_data_layout() {
  mkdir -p \
    "$CORPUS_DATA_ROOT/crawler/documents" \
    "$CORPUS_DATA_ROOT/pipeline/parsed" \
    "$CORPUS_DATA_ROOT/pipeline/audits" \
    "$CORPUS_DATA_ROOT/pipeline/eval-results" \
    "$CORPUS_DATA_ROOT/pipeline/releases" \
    "$SNAPSHOT_DIR" \
    "$RUN_STATE_DIR"
}

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
    node "$REPO_ROOT/node_modules/tsx/dist/cli.mjs" src/index.ts crawl
  )
  (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli parse --strict-required
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
  sync_current_corpus
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

sync_current_corpus() {
  "$REPO_ROOT/scripts/ops/sync-current-corpus.sh"
}

backup_corpus() {
  "$REPO_ROOT/scripts/ops/object-storage-backup.sh"
}

recover_parse() {
  local max_runtime max_consecutive_timeouts
  max_runtime="${CORPUS_RECOVERY_MAX_RUNTIME_SECONDS:-18000}"
  max_consecutive_timeouts="${CORPUS_RECOVERY_MAX_CONSECUTIVE_TIMEOUTS:-3}"
  [[ "$max_runtime" =~ ^[1-9][0-9]*$ ]] || {
    log "CORPUS_RECOVERY_MAX_RUNTIME_SECONDS must be a positive integer"
    return 64
  }
  [[ "$max_consecutive_timeouts" =~ ^[1-9][0-9]*$ ]] || {
    log "CORPUS_RECOVERY_MAX_CONSECUTIVE_TIMEOUTS must be a positive integer"
    return 64
  }

  log "parser recovery starting (runtime_budget_seconds=$max_runtime consecutive_timeout_limit=$max_consecutive_timeouts)"
  local parse_exit
  if (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli parse \
      --retry-failures \
      --strict \
      --max-runtime-seconds "$max_runtime" \
      --max-consecutive-timeouts "$max_consecutive_timeouts"
  ); then
    parse_exit=0
  else
    parse_exit=$?
  fi
  [[ "$parse_exit" -eq 0 ]] || return "$parse_exit"
  # Strict success is the only path that mirrors or archives artifacts. This
  # mode intentionally does not crawl, create/ack a snapshot, or promote.
  sync_current_corpus
  backup_corpus
}

scheduled() {
  discover_and_release
  "$REPO_ROOT/scripts/ops/corpus-release-cleanup.sh"
  weekly_audit_if_due
  monthly_evaluation_if_due
  sync_current_corpus
  backup_corpus
}

run_job_mode() {
  case "$JOB_MODE" in
    scheduled) scheduled ;;
    discover) discover_and_release ;;
    recover-parse) recover_parse ;;
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
    backup) backup_corpus ;;
    *)
      log "unknown CORPUS_JOB_MODE: $JOB_MODE"
      return 64
      ;;
  esac
}

run_supervised_job() {
  # Restore is part of the same supervised process group as every job mode, so
  # TERM/INT cannot leave an unsupervised restore writer behind. The parent
  # already holds the persistent-volume flock before starting this function.
  if [[ ! -f "$CORPUS_DATA_ROOT/crawler/crawler.db" ]]; then
    log "restoring corpus-job volume from Railway Object Storage"
    "$REPO_ROOT/scripts/ops/restore-corpus-artifacts.sh"
  fi
  if [[ "$JOB_MODE" == "recover-parse" && ! -s "$CORPUS_DATA_ROOT/crawler/crawler.db" ]]; then
    log "recovery requires a non-empty restored crawler registry"
    return 66
  fi
  run_job_mode
}

record_interruption() {
  local signal="$1" exit_code="$2" temporary
  ensure_data_layout
  temporary="$RUN_STATE_DIR/.latest-corpus-job-interruption.json.$$"
  printf '{"run_id":"%s","mode":"%s","terminal_state":"interrupted","signal":"%s","exit_code":%s,"updated_at":"%s"}\n' \
    "$JOB_RUN_ID" "$JOB_MODE" "$signal" "$exit_code" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$temporary"
  mv -f "$temporary" "$RUN_STATE_DIR/latest-corpus-job-interruption.json"
  log "corpus_job_interrupted run_id=$JOB_RUN_ID mode=$JOB_MODE signal=$signal exit_code=$exit_code"
}

log_job_final() {
  local exit_code="${_EXIT_CODE:-$?}" elapsed status
  elapsed=$(( $(date +%s) - JOB_STARTED_EPOCH ))
  status="$JOB_FINAL_STATUS"
  if [[ "$exit_code" -ne 0 && "$status" != "interrupted" && "$status" != "lock_contended" ]]; then
    status="$(structured_failure_status)"
  fi
  printf 'CORPUS_RUN_SUMMARY {"run_id":"%s","mode":"%s","status":"%s","exit_code":%s,"elapsed_seconds":%s,"run_state":"%s"}\n' \
    "$JOB_RUN_ID" "$JOB_MODE" "$status" "$exit_code" "$elapsed" "$RUN_STATE_DIR/latest-parse.json"
}

structured_failure_status() {
  local terminal_state
  # The parser owns this JSON contract and writes it atomically. Classify only
  # explicit run-state values; never scrape human-oriented CLI output.
  if [[ "$JOB_MODE" == "recover-parse" && -f "$RUN_STATE_DIR/latest-parse.json" ]]; then
    terminal_state="$(jq -er '.status | select(type == "string")' \
      "$RUN_STATE_DIR/latest-parse.json" 2>/dev/null || true)"
    case "$terminal_state" in
      max_runtime_reached|max_consecutive_timeouts_reached)
        printf 'incomplete'
        return
        ;;
      interrupted)
        printf 'interrupted'
        return
        ;;
    esac
  fi
  printf 'failed'
}

process_group_exists() {
  local pgid="$1"
  kill -0 -- "-$pgid" 2>/dev/null
}

stop_supervised_group() {
  local signal="$1" pgid="$2"
  local grace_seconds="${CORPUS_JOB_SIGNAL_GRACE_SECONDS:-30}" deadline
  [[ "$grace_seconds" =~ ^[0-9]+$ ]] || grace_seconds=30

  kill -s "$signal" -- "-$pgid" 2>/dev/null || true
  deadline=$((SECONDS + grace_seconds))
  while process_group_exists "$pgid" && (( SECONDS < deadline )); do
    sleep 0.05
  done
  if process_group_exists "$pgid"; then
    log "process group $pgid did not stop within ${grace_seconds}s; sending KILL"
    kill -KILL -- "-$pgid" 2>/dev/null || true
  fi

  # Reap the group leader and do not return (and therefore do not record the
  # interruption or release flock) while any descendant still exists.
  wait "$pgid" 2>/dev/null || true
  while process_group_exists "$pgid"; do
    sleep 0.05
  done
}

handle_interrupt() {
  local signal="$1" exit_code=143
  [[ "$signal" == "INT" ]] && exit_code=130
  trap - TERM INT
  JOB_FINAL_STATUS=interrupted
  if [[ -n "$ACTIVE_JOB_PID" ]]; then
    stop_supervised_group "$signal" "$ACTIVE_JOB_PID"
    ACTIVE_JOB_PID=""
  fi
  record_interruption "$signal" "$exit_code"
  exit "$exit_code"
}

# Tests source the functions without starting the production entrypoint.
if [[ "${CORPUS_JOB_TEST_SOURCE_ONLY:-0}" == "1" ]]; then
  return 0 2>/dev/null || exit 0
fi

# The supervised child owns the process group containing parser workers. It
# deliberately does not acquire a second lock or emit Healthchecks pings.
if [[ "${CORPUS_JOB_CHILD:-0}" == "1" ]]; then
  run_supervised_job
  exit $?
fi

case "$JOB_MODE" in
  scheduled|discover|recover-parse|bootstrap|release|rollback|cleanup|audit|evaluate|backup) ;;
  *) log "unknown CORPUS_JOB_MODE: $JOB_MODE"; exit 64 ;;
esac

ensure_data_layout
hc_trap
add_exit_hook 'log_job_final'
hc_start
require_tool flock
require_tool setsid
require_tool jq
if ! acquire_path_lock "$CORPUS_DATA_ROOT/.locks/corpus-job.lock" corpus-job-volume; then
  JOB_FINAL_STATUS=lock_contended
  exit 75
fi
trap 'handle_interrupt TERM' TERM
trap 'handle_interrupt INT' INT

JOB_FINAL_STATUS=running
setsid env CORPUS_JOB_CHILD=1 \
  bash "$REPO_ROOT/scripts/ops/railway-corpus-job.sh" &
ACTIVE_JOB_PID=$!
if wait "$ACTIVE_JOB_PID"; then
  job_exit=0
else
  job_exit=$?
fi
ACTIVE_JOB_PID=""
if [[ "$job_exit" -ne 0 ]]; then
  exit "$job_exit"
fi

JOB_FINAL_STATUS=success
hc_ok
