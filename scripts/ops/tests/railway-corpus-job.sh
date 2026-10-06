#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENTRYPOINT="$REPO_ROOT/scripts/ops/railway-corpus-job.sh"
TEMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEMP_ROOT"' EXIT
TESTS=0

fail() {
  printf 'not ok - %s\n' "$*" >&2
  exit 1
}

pass() {
  TESTS=$((TESTS + 1))
  printf 'ok %s - %s\n' "$TESTS" "$1"
}

make_fake_python() {
  local path="$1" exit_code="$2"
  cat > "$path" <<EOF
#!/usr/bin/env bash
printf '%s\\n' "\$*" >> "\$PYTHON_ARGS_LOG"
exit $exit_code
EOF
  chmod +x "$path"
}

# Recovery success invokes only the bounded strict parser, then sync and backup.
(
  data="$TEMP_ROOT/success-data"
  fake_python="$TEMP_ROOT/python-success"
  args_log="$TEMP_ROOT/python-success.args"
  calls_log="$TEMP_ROOT/success.calls"
  make_fake_python "$fake_python" 0
  export CORPUS_DATA_ROOT="$data" PIPELINE_PYTHON="$fake_python"
  export PYTHON_ARGS_LOG="$args_log" CORPUS_JOB_TEST_SOURCE_ONLY=1
  # shellcheck source=../railway-corpus-job.sh
  source "$ENTRYPOINT"
  sync_current_corpus() { printf 'sync\n' >> "$calls_log"; }
  backup_corpus() { printf 'backup\n' >> "$calls_log"; }
  recover_parse
  expected='-m pipeline.cli parse --retry-failures --strict --max-runtime-seconds 18000 --max-consecutive-timeouts 3'
  [[ "$(<"$args_log")" == "$expected" ]] || fail "unexpected recovery CLI: $(<"$args_log")"
  [[ "$(<"$calls_log")" == $'sync\nbackup' ]] || fail "success did not sync then backup"
) || exit $?
pass "clean recovery is bounded, strict, synced, and backed up"

# A strict parser failure must not sync, back up, crawl, snapshot, or promote.
(
  data="$TEMP_ROOT/failure-data"
  fake_python="$TEMP_ROOT/python-failure"
  args_log="$TEMP_ROOT/python-failure.args"
  calls_log="$TEMP_ROOT/failure.calls"
  make_fake_python "$fake_python" 23
  export CORPUS_DATA_ROOT="$data" PIPELINE_PYTHON="$fake_python"
  export PYTHON_ARGS_LOG="$args_log" CORPUS_JOB_TEST_SOURCE_ONLY=1
  source "$ENTRYPOINT"
  sync_current_corpus() { printf 'sync\n' >> "$calls_log"; }
  backup_corpus() { printf 'backup\n' >> "$calls_log"; }
  if recover_parse; then
    fail "strict parser failure was reported as success"
  fi
  [[ ! -e "$calls_log" ]] || fail "failed recovery mutated remote artifacts"
  [[ "$(<"$args_log")" != *crawl* ]] || fail "recovery crawled"
  [[ "$(<"$args_log")" != *snapshot* ]] || fail "recovery touched snapshots"
) || exit $?
pass "strict failure does not sync, back up, crawl, or touch snapshots"

# Run one discovery mode with a fake crawler exit status. Every external step is
# a stub that appends its name to one call log; the stubs for the Healthchecks
# pings record what the real entrypoint would send at exit.
run_discovery_case() {
  local name="$1" mode="$2" crawl_status="$3"
  (
    calls_log="$TEMP_ROOT/$name.calls"
    health_log="$TEMP_ROOT/$name.health"
    fake_python="$TEMP_ROOT/python-$name"
    make_fake_python "$fake_python" 0
    mkdir -p "$TEMP_ROOT/$name-home"
    export HOME="$TEMP_ROOT/$name-home" OPS_ENV="$TEMP_ROOT/no-ops.env"
    export CORPUS_DATA_ROOT="$TEMP_ROOT/$name-data" PIPELINE_PYTHON="$fake_python"
    export PYTHON_ARGS_LOG="$calls_log" CORPUS_JOB_MODE="$mode"
    export CORPUS_JOB_TEST_SOURCE_ONLY=1
    source "$ENTRYPOINT"
    node() { printf 'crawl\n' >> "$calls_log"; return "$crawl_status"; }
    jq() { return 0; }  # the answer-ready snapshot reports a change
    promote_release() { printf 'promote\n' >> "$calls_log"; }
    cleanup_releases() { printf 'cleanup\n' >> "$calls_log"; }
    weekly_audit_if_due() { :; }
    monthly_evaluation_if_due() { :; }
    sync_current_corpus() { printf 'sync\n' >> "$calls_log"; }
    backup_corpus() { printf 'backup\n' >> "$calls_log"; }
    hc_fail() { printf 'fail\n' >> "$health_log"; }
    hc_ok() { printf 'ok\n' >> "$health_log"; }
    hc_trap
    run_job_mode
    hc_ok
  ) >/dev/null 2>&1
}

called() { grep -q -- "$2" "$TEMP_ROOT/$1.calls"; }

# A required family failing discovery (crawler exit 3) still parses, snapshots,
# mirrors and backs up, but never promotes or acknowledges, and the run fails.
set +e
run_discovery_case required-failed scheduled 3
status=$?
set -e
[[ "$status" -eq 3 ]] || fail "required-family failure exited $status, expected 3"
called required-failed 'parse --strict-required' || fail "required-family failure skipped parse"
called required-failed 'answer-ready-snapshot' || fail "required-family failure skipped the snapshot"
called required-failed '^sync$' || fail "required-family failure skipped the corpus sync"
called required-failed '^backup$' || fail "required-family failure skipped the backup"
called required-failed '^cleanup$' || fail "required-family failure skipped release cleanup"
! called required-failed '^promote$' || fail "required-family failure promoted a release"
! called required-failed 'acknowledge-answer-ready-snapshot' \
  || fail "required-family failure acknowledged the snapshot"
[[ "$(tail -n 1 "$TEMP_ROOT/required-failed.calls")" == backup ]] \
  || fail "required-family failure returned before the backup"
[[ "$(<"$TEMP_ROOT/required-failed.health")" == fail ]] \
  || fail "required-family failure did not send exactly one Healthchecks failure"
pass "required-family discovery failure parses, syncs and backs up, skips promotion, and fails the run"

# Discover mode has the same gate and returns the crawl status after its sync.
set +e
run_discovery_case required-failed-discover discover 3
status=$?
set -e
[[ "$status" -eq 3 ]] || fail "discover mode exited $status, expected 3"
called required-failed-discover 'parse --strict-required' || fail "discover mode skipped parse"
called required-failed-discover '^sync$' || fail "discover mode skipped the corpus sync"
! called required-failed-discover '^promote$' || fail "discover mode promoted a release"
[[ "$(<"$TEMP_ROOT/required-failed-discover.health")" == fail ]] \
  || fail "discover mode did not send a Healthchecks failure"
pass "discover mode skips promotion and fails after a required-family discovery failure"

# A clean crawl with a changed snapshot promotes, acknowledges and succeeds.
set +e
run_discovery_case clean scheduled 0
status=$?
set -e
[[ "$status" -eq 0 ]] || fail "clean scheduled run exited $status"
expected=$'crawl\n-m pipeline.cli parse --strict-required\n-m pipeline.cli answer-ready-snapshot'
[[ "$(<"$TEMP_ROOT/clean.calls")" == "$expected"* ]] || fail "clean run did not crawl, parse, then snapshot"
[[ "$(grep -n -- '^promote$' "$TEMP_ROOT/clean.calls" | cut -d: -f1)" \
  -lt "$(grep -n -- 'acknowledge-answer-ready-snapshot' "$TEMP_ROOT/clean.calls" | cut -d: -f1)" ]] \
  || fail "clean run did not promote before acknowledging"
[[ "$(tail -n 4 "$TEMP_ROOT/clean.calls")" == $'sync\ncleanup\nsync\nbackup' ]] \
  || fail "clean run did not sync, clean up, sync and back up"
[[ "$(<"$TEMP_ROOT/clean.health")" == ok ]] || fail "clean run did not report Healthchecks success"
pass "clean crawl promotes, acknowledges, backs up, and succeeds"

# Any other crawler status is a crash: nothing after the crawl runs.
set +e
run_discovery_case crashed scheduled 1
status=$?
set -e
[[ "$status" -eq 1 ]] || fail "crashed crawl exited $status, expected 1"
[[ "$(<"$TEMP_ROOT/crashed.calls")" == crawl ]] || fail "crashed crawl ran later steps"
[[ "$(<"$TEMP_ROOT/crashed.health")" == fail ]] || fail "crashed crawl did not send a Healthchecks failure"
pass "crawler crash stops the run before parse, sync, backup, or promotion"

# Persistent-path flock rejects overlap and is released when the holder exits.
(
  lock="$TEMP_ROOT/locks/corpus-job.lock"
  ready="$TEMP_ROOT/lock-ready"
  (
    export HOME="$TEMP_ROOT/holder-home"
    source "$REPO_ROOT/scripts/ops/lib.sh"
    acquire_path_lock "$lock" test-volume
    touch "$ready"
    sleep 2
  ) &
  holder=$!
  for _ in {1..50}; do [[ -e "$ready" ]] && break; sleep 0.02; done
  [[ -e "$ready" ]] || fail "lock holder did not start"
  (
    export HOME="$TEMP_ROOT/contender-home"
    source "$REPO_ROOT/scripts/ops/lib.sh"
    if acquire_path_lock "$lock" test-volume; then exit 99; fi
  )
  wait "$holder"
  (
    export HOME="$TEMP_ROOT/reacquire-home"
    source "$REPO_ROOT/scripts/ops/lib.sh"
    acquire_path_lock "$lock" test-volume
  )
) || fail "persistent volume lock contention/release failed"
pass "persistent volume lock rejects overlap and releases on exit"

# The interruption marker is durable before EXIT runs the Healthchecks failure hook.
(
  data="$TEMP_ROOT/interrupted-data"
  healthcheck_observation="$TEMP_ROOT/healthcheck-observation"
  export CORPUS_DATA_ROOT="$data" CORPUS_JOB_TEST_SOURCE_ONLY=1
  source "$ENTRYPOINT"
  JOB_RUN_ID=test-run
  JOB_MODE=recover-parse
  JOB_FINAL_STATUS=running
  hc_fail() {
    [[ -f "$RUN_STATE_DIR/latest-corpus-job-interruption.json" ]] || exit 88
    printf 'failure-after-marker\n' > "$healthcheck_observation"
  }
  hc_trap
  add_exit_hook 'log_job_final >/dev/null'
  handle_interrupt TERM
) >/dev/null 2>&1 && fail "TERM handler returned success"
interrupt_exit=$?
[[ "$interrupt_exit" -eq 143 ]] || fail "TERM exit was $interrupt_exit, expected 143"
[[ -f "$TEMP_ROOT/interrupted-data/pipeline/run-state/latest-corpus-job-interruption.json" ]] \
  || fail "TERM did not persist interruption marker"
[[ -f "$TEMP_ROOT/healthcheck-observation" ]] \
  || fail "Healthchecks failure ran before marker or not at all"
pass "TERM records interruption before Healthchecks failure and exits 143"

# TERM reaches an active parser-like process group, waits for descendants,
# records interruption, reports Healthchecks failure once, and only then makes
# the persistent lock available to a replacement.
(
  data="$TEMP_ROOT/signal-data"
  fake_bin="$TEMP_ROOT/signal-bin"
  worker_pid_file="$TEMP_ROOT/signal-worker.pid"
  health_log="$TEMP_ROOT/signal-health.log"
  job_log="$TEMP_ROOT/signal-job.log"
  mkdir -p "$data/crawler/recovery-journal" "$fake_bin"
  printf 'sqlite-registry' > "$data/crawler/crawler.db"

  cat > "$fake_bin/python" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
bash -c 'trap "exit 0" TERM INT; while :; do sleep 1; done' &
worker=$!
printf '%s\n' "$worker" > "$MOCK_WORKER_PID_FILE"
trap 'kill -TERM "$worker" 2>/dev/null || true; wait "$worker" 2>/dev/null || true; exit 143' TERM
trap 'kill -INT "$worker" 2>/dev/null || true; wait "$worker" 2>/dev/null || true; exit 130' INT
wait "$worker"
EOF
  chmod +x "$fake_bin/python"
  cat > "$fake_bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "${*: -1}" >> "$MOCK_HEALTH_LOG"
EOF
  chmod +x "$fake_bin/curl"

  PATH="$fake_bin:$PATH" \
    CORPUS_DATA_ROOT="$data" \
    CORPUS_JOB_MODE=recover-parse \
    CORPUS_JOB_SIGNAL_GRACE_SECONDS=2 \
    PIPELINE_PYTHON="$fake_bin/python" \
    HC_URL_CORPUS_JOB=https://healthchecks.invalid/test \
    MOCK_WORKER_PID_FILE="$worker_pid_file" \
    MOCK_HEALTH_LOG="$health_log" \
    bash "$ENTRYPOINT" >"$job_log" 2>&1 &
  job_pid=$!

  for _ in {1..100}; do [[ -s "$worker_pid_file" ]] && break; sleep 0.02; done
  [[ -s "$worker_pid_file" ]] || fail "mock parser descendant did not start"
  worker_pid="$(<"$worker_pid_file")"

  if flock -n "$data/.locks/corpus-job.lock" true; then
    fail "replacement acquired lock while parser was active"
  fi

  started=$SECONDS
  kill -TERM "$job_pid"
  while kill -0 "$job_pid" 2>/dev/null && (( SECONDS - started < 5 )); do sleep 0.05; done
  if kill -0 "$job_pid" 2>/dev/null; then
    kill -KILL "$job_pid" 2>/dev/null || true
    fail "TERM did not produce a bounded parent exit"
  fi
  set +e
  wait "$job_pid"
  job_exit=$?
  set -e
  [[ "$job_exit" -eq 143 ]] || fail "supervised TERM exit was $job_exit, expected 143"
  ! kill -0 "$worker_pid" 2>/dev/null || fail "parser descendant survived parent exit"
  [[ -f "$data/pipeline/run-state/latest-corpus-job-interruption.json" ]] \
    || fail "supervised TERM did not write interruption marker"
  [[ "$(grep -c '/fail$' "$health_log" || true)" -eq 1 ]] \
    || fail "Healthchecks failure was not sent exactly once"
  [[ "$(grep -c '/start$' "$health_log" || true)" -eq 1 ]] \
    || fail "Healthchecks start was not sent exactly once"
  [[ "$(grep -c '^https://healthchecks.invalid/test$' "$health_log" || true)" -eq 0 ]] \
    || fail "interrupted run sent a Healthchecks success ping"
  flock -n "$data/.locks/corpus-job.lock" true \
    || fail "replacement could not acquire lock after interruption completed"
  grep -q '"status":"interrupted"' "$job_log" \
    || fail "final summary did not classify interruption"
) || exit $?
pass "TERM drains descendants, records interruption, fails health once, then releases lock"

# Structured parser state distinguishes resumable bounded stops from failures.
(
  data="$TEMP_ROOT/summary-data"
  export CORPUS_DATA_ROOT="$data" CORPUS_JOB_MODE=recover-parse CORPUS_JOB_TEST_SOURCE_ONLY=1
  source "$ENTRYPOINT"
  ensure_data_layout
  printf '{"status":"max_runtime_reached"}\n' > "$RUN_STATE_DIR/latest-parse.json"
  [[ "$(structured_failure_status)" == incomplete ]] || fail "runtime stop was not incomplete"
  printf '{"status":"max_consecutive_timeouts_reached"}\n' > "$RUN_STATE_DIR/latest-parse.json"
  [[ "$(structured_failure_status)" == incomplete ]] || fail "timeout stop was not incomplete"
  printf '{"status":"completed"}\n' > "$RUN_STATE_DIR/latest-parse.json"
  [[ "$(structured_failure_status)" == failed ]] || fail "strict completed failure was not failed"
) || exit $?
pass "run summary classifies structured bounded stops as incomplete"

# Recovery refuses to treat a missing/empty registry as an empty successful corpus.
(
  data="$TEMP_ROOT/empty-registry-data"
  mkdir -p "$data/crawler"
  : > "$data/crawler/crawler.db"
  export CORPUS_DATA_ROOT="$data" CORPUS_JOB_MODE=recover-parse CORPUS_JOB_TEST_SOURCE_ONLY=1
  source "$ENTRYPOINT"
  run_job_mode() { fail "recovery ran with an empty registry"; }
  set +e
  run_supervised_job
  status=$?
  set -e
  [[ "$status" -eq 66 ]] || fail "empty registry returned $status, expected 66"
) || exit $?
pass "recovery fails closed when the restored crawler registry is empty"

# An existing registry cannot initialize missing history as empty and sync it.
(
  data="$TEMP_ROOT/missing-history-data"
  mkdir -p "$data/crawler"
  printf 'sqlite-registry' > "$data/crawler/crawler.db"
  export CORPUS_DATA_ROOT="$data" CORPUS_JOB_MODE=recover-parse CORPUS_JOB_TEST_SOURCE_ONLY=1
  source "$ENTRYPOINT"
  ensure_data_layout
  [[ ! -d "$data/crawler/recovery-journal" ]] || fail "startup recreated lost journals"
  run_job_mode() { fail "job ran without recovery history"; }
  set +e
  run_supervised_job
  status=$?
  set -e
  [[ "$status" -eq 66 ]] || fail "missing recovery history returned $status, expected 66"
) || exit $?
pass "existing corpus refuses startup without its recovery journals"

printf '1..%s\n' "$TESTS"
