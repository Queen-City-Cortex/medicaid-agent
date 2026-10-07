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
  local name="$1" mode="$2" crawl_status="$3" promote_status="${4:-0}"
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
    promote_release() { printf 'promote\n' >> "$calls_log"; return "$promote_status"; }
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

# A snapshot that was already rejected at a gate is not rebuilt (promote exits
# 21 from the release preflight). The crawl is still mirrored and backed up,
# the snapshot stays unacknowledged, and the run ends non-zero.
set +e
run_discovery_case already-rejected scheduled 0 21
status=$?
set -e
[[ "$status" -eq 21 ]] || fail "an already-rejected snapshot exited $status, expected 21"
called already-rejected '^promote$' || fail "an already-rejected snapshot was never offered to promote"
! called already-rejected 'acknowledge-answer-ready-snapshot' \
  || fail "an already-rejected snapshot was acknowledged"
[[ "$(tail -n 4 "$TEMP_ROOT/already-rejected.calls")" == $'sync\ncleanup\nsync\nbackup' ]] \
  || fail "an already-rejected snapshot skipped the sync, cleanup or backup"
[[ "$(<"$TEMP_ROOT/already-rejected.health")" == fail ]] \
  || fail "an already-rejected snapshot did not send exactly one Healthchecks failure"
pass "an already-rejected snapshot is not acknowledged, still syncs and backs up, and fails the run"

set +e
run_discovery_case already-rejected-discover discover 0 21
status=$?
set -e
[[ "$status" -eq 21 ]] || fail "discover mode exited $status for an already-rejected snapshot"
[[ "$(tail -n 1 "$TEMP_ROOT/already-rejected-discover.calls")" == sync ]] \
  || fail "discover mode did not sync after an already-rejected snapshot"
pass "discover mode syncs and fails the run for an already-rejected snapshot"

# A reset blocked by the rollback window is a deferral (promote exits 20), not a
# failure: the snapshot stays unacknowledged for the next run, cleanup, mirror
# and backup still happen, and the run succeeds.
set +e
run_discovery_case reset-deferred scheduled 0 20
status=$?
set -e
[[ "$status" -eq 0 ]] || fail "a deferred promotion exited $status, expected 0"
called reset-deferred '^promote$' || fail "a deferred run never attempted the promotion"
! called reset-deferred 'acknowledge-answer-ready-snapshot' \
  || fail "a deferred promotion acknowledged the snapshot"
[[ "$(tail -n 4 "$TEMP_ROOT/reset-deferred.calls")" == $'sync\ncleanup\nsync\nbackup' ]] \
  || fail "a deferred promotion skipped the sync, cleanup or backup"
[[ "$(<"$TEMP_ROOT/reset-deferred.health")" == ok ]] \
  || fail "a deferred promotion did not report Healthchecks success"
pass "a deferred promotion leaves the snapshot unacknowledged, still cleans up, syncs and backs up, and succeeds"

set +e
run_discovery_case reset-deferred-discover discover 0 20
status=$?
set -e
[[ "$status" -eq 0 ]] || fail "discover mode exited $status for a deferred promotion"
! called reset-deferred-discover 'acknowledge-answer-ready-snapshot' \
  || fail "discover mode acknowledged a deferred snapshot"
[[ "$(tail -n 1 "$TEMP_ROOT/reset-deferred-discover.calls")" == sync ]] \
  || fail "discover mode did not sync after a deferred promotion"
pass "discover mode syncs and succeeds when the promotion is deferred"

# The serving release was already built from this snapshot (promote exits 22):
# an earlier run promoted it and stopped before the acknowledgement. Acknowledge
# now, rebuild nothing, and succeed.
set +e
run_discovery_case already-released scheduled 0 22
status=$?
set -e
[[ "$status" -eq 0 ]] || fail "an already-released snapshot exited $status, expected 0"
called already-released 'acknowledge-answer-ready-snapshot' \
  || fail "an already-released snapshot was not acknowledged"
[[ "$(tail -n 4 "$TEMP_ROOT/already-released.calls")" == $'sync\ncleanup\nsync\nbackup' ]] \
  || fail "an already-released snapshot skipped the sync, cleanup or backup"
[[ "$(<"$TEMP_ROOT/already-released.health")" == ok ]] \
  || fail "an already-released snapshot did not report Healthchecks success"
pass "a snapshot that is already the serving release is acknowledged without a rebuild, and the run succeeds"

# Recover mode runs the release script's recover action and nothing else.
(
  calls_log="$TEMP_ROOT/recover-mode.calls"
  fake_root="$TEMP_ROOT/recover-mode-root"
  mkdir -p "$TEMP_ROOT/recover-mode-home" "$fake_root/scripts/ops"
  printf '#!/usr/bin/env bash\nprintf "corpus-release %%s\\n" "$*" >> "%s"\n' "$calls_log" \
    > "$fake_root/scripts/ops/corpus-release.sh"
  chmod +x "$fake_root/scripts/ops/corpus-release.sh"
  export HOME="$TEMP_ROOT/recover-mode-home" OPS_ENV="$TEMP_ROOT/no-ops.env"
  export CORPUS_DATA_ROOT="$TEMP_ROOT/recover-mode-data" CORPUS_JOB_MODE=recover
  export CORPUS_JOB_TEST_SOURCE_ONLY=1
  source "$ENTRYPOINT"
  REPO_ROOT="$fake_root"
  run_job_mode
  [[ "$(<"$calls_log")" == 'corpus-release recover' ]] \
    || fail "recover mode ran: $(<"$calls_log")"
) || exit $?
pass "recover mode runs the release script's recover action"

probe="$(env -i PATH="$PATH" VOYAGE_API_KEY=voyage-secret-value RAILWAY_GIT_COMMIT_SHA=0123abc \
  CORPUS_DATA_ROOT=/data REQUESTED_CORPUS_RELEASE_ID=left-over bash "$REPO_ROOT/scripts/ops/measure-probe.sh")"
grep -qx 'secret VOYAGE_API_KEY=present' <<<"$probe" || fail "the probe did not report a present secret"
grep -qx 'secret NEO4J_BLUE_PASSWORD=MISSING' <<<"$probe" || fail "the probe did not report a missing secret"
! grep -q 'voyage-secret-value' <<<"$probe" || fail "the probe printed a secret value"
grep -qx 'setting REQUESTED_CORPUS_RELEASE_ID=left-over' <<<"$probe" || fail "the probe hid a stored setting a run would inherit"
grep -qx 'setting MEASURE_REUSE_GRAPH=unset' <<<"$probe" || fail "the probe did not report an unset setting"
[[ "$(sed -n 's/^measure_mode_lines=//p' <<<"$probe")" -ge 2 ]] || fail "the probe did not find the measure mode"
pass "the measurement probe reports secrets as present or missing, never their values, and shows stored settings"

# Run measure mode with a fake crawler exit status and a stub release script.
# The release script fails at the action named in $4; the parser exits $5.
run_measure_case() {
  local name="$1" crawl_status="$2" settings="${3:-}" failing_action="${4:-}" parse_status="${5:-0}"
  (
    calls_log="$TEMP_ROOT/$name.calls"
    fake_root="$TEMP_ROOT/$name-root"
    fake_python="$TEMP_ROOT/python-$name"
    make_fake_python "$fake_python" "$parse_status"
    mkdir -p "$TEMP_ROOT/$name-home" "$fake_root/scripts/ops"
    printf '#!/usr/bin/env bash\nprintf "corpus-release %%s\\n" "$*" >> "%s"\n[[ "$1" != "%s" ]] || exit 64\n' \
      "$calls_log" "$failing_action" > "$fake_root/scripts/ops/corpus-release.sh"
    chmod +x "$fake_root/scripts/ops/corpus-release.sh"
    export HOME="$TEMP_ROOT/$name-home" OPS_ENV="$TEMP_ROOT/no-ops.env"
    export CORPUS_DATA_ROOT="$TEMP_ROOT/$name-data" PIPELINE_PYTHON="$fake_python"
    export PYTHON_ARGS_LOG="$calls_log" CORPUS_JOB_MODE=measure
    [[ -z "$settings" ]] || export "$settings"
    export CORPUS_JOB_TEST_SOURCE_ONLY=1
    source "$ENTRYPOINT"
    REPO_ROOT="$fake_root"
    node() { printf 'crawl\n' >> "$calls_log"; return "$crawl_status"; }
    promote_release() { printf 'promote\n' >> "$calls_log"; }
    sync_current_corpus() { printf 'sync\n' >> "$calls_log"; }
    backup_corpus() { printf 'backup\n' >> "$calls_log"; }
    run_job_mode
  ) >/dev/null 2>&1
}

status=0
run_measure_case measure-clean 0 || status=$?
[[ "$status" -eq 0 ]] || fail "measure mode exited $status"
expected=$'corpus-release measure-check\ncrawl\n-m pipeline.cli parse --strict-required\ncorpus-release measure\nsync'
[[ "$(<"$TEMP_ROOT/measure-clean.calls")" == "$expected" ]] \
  || fail "measure mode ran: $(<"$TEMP_ROOT/measure-clean.calls")"
pass "measure mode checks its settings, crawls, parses, measures and syncs, with no snapshot, promotion or backup"

status=0
run_measure_case measure-bad-settings 0 "" measure-check || status=$?
[[ "$status" -eq 64 ]] || fail "measure mode exited $status on refused settings, expected 64"
[[ "$(<"$TEMP_ROOT/measure-bad-settings.calls")" == 'corpus-release measure-check' ]] \
  || fail "measure mode went on after its settings were refused: $(<"$TEMP_ROOT/measure-bad-settings.calls")"
pass "measure mode stops before the crawl when its reset settings are refused"

status=0
run_measure_case measure-required-failed 3 || status=$?
[[ "$status" -eq 0 ]] || fail "measure mode exited $status after a required-family discovery failure"
called measure-required-failed '^corpus-release measure$' \
  || fail "a required-family discovery failure stopped the measurement"
pass "measure mode still measures after a required-family discovery failure"

status=0
run_measure_case measure-crawl-crash 1 || status=$?
[[ "$status" -eq 1 ]] || fail "a crawler crash exited $status, expected 1"
! called measure-crawl-crash '^corpus-release measure$' || fail "measure mode reset a graph after a crawler crash"
pass "measure mode stops before any graph is touched when the crawler crashes"

status=0
run_measure_case measure-parse-fails 0 "" "" 23 || status=$?
[[ "$status" -eq 23 ]] || fail "a strict parse failure exited $status, expected 23"
! called measure-parse-fails '^corpus-release measure$' || fail "measure mode reset a graph after a failed parse"
! called measure-parse-fails '^sync$' || fail "measure mode mirrored the corpus after a failed parse"
pass "measure mode stops before any graph is touched when the strict parse fails"

status=0
run_measure_case measure-fails 0 "" measure || status=$?
[[ "$status" -eq 64 ]] || fail "a failed measurement exited $status, expected 64"
! called measure-fails '^sync$' || fail "measure mode mirrored the corpus after a failed measurement"
pass "a failed measurement decides the exit status"

status=0
run_measure_case measure-skip-crawl 0 MEASURE_SKIP_CRAWL=1 || status=$?
[[ "$status" -eq 0 ]] || fail "measure mode exited $status with MEASURE_SKIP_CRAWL=1"
! called measure-skip-crawl '^crawl$' || fail "MEASURE_SKIP_CRAWL=1 still crawled"
called measure-skip-crawl '^corpus-release measure$' || fail "MEASURE_SKIP_CRAWL=1 skipped the measurement"
pass "MEASURE_SKIP_CRAWL=1 measures what an earlier crawl delivered"

status=0
run_measure_case measure-reuse 0 MEASURE_REUSE_GRAPH=1 || status=$?
[[ "$status" -eq 0 ]] || fail "measure mode exited $status with MEASURE_REUSE_GRAPH=1"
expected=$'corpus-release measure-check\ncorpus-release measure'
[[ "$(<"$TEMP_ROOT/measure-reuse.calls")" == "$expected" ]] \
  || fail "MEASURE_REUSE_GRAPH=1 ran: $(<"$TEMP_ROOT/measure-reuse.calls")"
pass "MEASURE_REUSE_GRAPH=1 measures the built graph with no crawl, parse or mirror"

# A failed required family outranks a skipped release in the exit status.
set +e
run_discovery_case rejected-after-failed-family scheduled 3 21
status=$?
set -e
[[ "$status" -eq 3 ]] || fail "a failed required family exited $status, expected 3"
pass "a failed required-family discovery decides the exit status"

# Any other promote failure is a failed release: nothing after it runs.
set +e
run_discovery_case promote-failed scheduled 0 1
status=$?
set -e
[[ "$status" -eq 1 ]] || fail "a failed promotion exited $status, expected 1"
[[ "$(tail -n 1 "$TEMP_ROOT/promote-failed.calls")" == promote ]] \
  || fail "a failed promotion still acknowledged, synced, cleaned up or backed up"
[[ "$(<"$TEMP_ROOT/promote-failed.health")" == fail ]] \
  || fail "a failed promotion did not send a Healthchecks failure"
pass "a failed promotion stops the run before acknowledge, sync, cleanup, or backup"

# Any other crawler status is a crash: nothing after the crawl runs.
set +e
run_discovery_case crashed scheduled 1
status=$?
set -e
[[ "$status" -eq 1 ]] || fail "crashed crawl exited $status, expected 1"
[[ "$(<"$TEMP_ROOT/crashed.calls")" == crawl ]] || fail "crashed crawl ran later steps"
[[ "$(<"$TEMP_ROOT/crashed.health")" == fail ]] || fail "crashed crawl did not send a Healthchecks failure"
pass "crawler crash stops the run before parse, sync, backup, or promotion"

# A gate override is an operator's decision about one snapshot. An unattended
# run that finds RELEASE_OVERRIDE_FILE still set stops before it does anything.
for mode in scheduled discover; do
  set +e
  RELEASE_OVERRIDE_FILE="$TEMP_ROOT/overrides.json" \
    run_discovery_case "standing-override-$mode" "$mode" 0
  status=$?
  set -e
  [[ "$status" -eq 64 ]] || fail "$mode run with a standing override exited $status, expected 64"
  [[ ! -e "$TEMP_ROOT/standing-override-$mode.calls" ]] \
    || fail "$mode run with a standing override crawled, parsed or promoted"
  [[ "$(<"$TEMP_ROOT/standing-override-$mode.health")" == fail ]] \
    || fail "$mode run with a standing override did not send a Healthchecks failure"
done
pass "scheduled and discover runs fail before any work while a gate override file is set"

# The operator's release mode is the one path that may carry the override.
set +e
RELEASE_OVERRIDE_FILE="$TEMP_ROOT/overrides.json" \
  run_discovery_case operator-release release 0
status=$?
set -e
[[ "$status" -eq 0 ]] || fail "release mode with an override file exited $status"
[[ "$(<"$TEMP_ROOT/operator-release.calls")" == promote ]] \
  || fail "release mode with an override file did not promote"
pass "release mode promotes with a gate override file set"

# corpus-release.sh promote with every Railway, graph and upload step stubbed.
# Prints the release-validate arguments the pipeline CLI would have received.
run_promote_case() {
  local name="$1" mode="$2" override_file="$3"
  (
    args_log="$TEMP_ROOT/$name.args"
    fake_python="$TEMP_ROOT/python-$name"
    fake_root="$TEMP_ROOT/$name-root"
    make_fake_python "$fake_python" 0
    mkdir -p "$TEMP_ROOT/$name-home" "$fake_root/scripts/ops"
    for script in sync-corpus-artifacts.sh upload-release-manifest.sh; do
      printf '#!/usr/bin/env bash\nexit 0\n' > "$fake_root/scripts/ops/$script"
      chmod +x "$fake_root/scripts/ops/$script"
    done
    export HOME="$TEMP_ROOT/$name-home" OPS_ENV="$TEMP_ROOT/no-ops.env"
    export CORPUS_DATA_ROOT="$TEMP_ROOT/$name-data" PIPELINE_PYTHON="$fake_python"
    export PYTHON_ARGS_LOG="$args_log" RAILWAY_GIT_COMMIT_SHA=abcdef1234
    export REQUESTED_CORPUS_RELEASE_ID=release-2 AGENT_PUBLIC_URL=https://agent.test
    unset CORPUS_JOB_MODE RELEASE_OVERRIDE_FILE RELEASE_RETRY_REJECTED
    [[ -z "$mode" ]] || export CORPUS_JOB_MODE="$mode"
    [[ -z "$override_file" ]] || export RELEASE_OVERRIDE_FILE="$override_file"
    # shellcheck source=../corpus-release.sh
    source "$REPO_ROOT/scripts/ops/corpus-release.sh"
    REPO_ROOT="$fake_root"
    printf '{"releaseId":"release-1","targetColor":"blue","promotionState":"promoted"}\n' \
      > "$RELEASES_DIR/release-1.json"
    agent_variables() {
      printf '%s\n' ACTIVE_CORPUS_COLOR=blue CORPUS_RELEASE_ID=release-1 \
        NEO4J_URI=bolt://blue NEO4J_PASSWORD=blue-password
    }
    color_uri() { printf 'bolt://%s' "$1"; }
    color_password() { printf '%s-password' "$1"; }
    download_manifest() { :; }
    redeploy_graph() { :; }
    set_agent_target() { :; }
    wait_for_agent_release() { :; }
    verify_agent_release() { :; }
    promote >/dev/null 2>&1
  )
}

validate_arguments() { grep -- 'release-validate' "$TEMP_ROOT/$1.args"; }

run_promote_case promote-operator release "$TEMP_ROOT/overrides.json" \
  || fail "operator release with an override file failed"
[[ "$(validate_arguments promote-operator)" == *" --override-file $TEMP_ROOT/overrides.json" ]] \
  || fail "operator release did not pass the override file: $(validate_arguments promote-operator)"
pass "operator-invoked release passes the override file to release-validate"

run_promote_case promote-plain release "" || fail "release without an override file failed"
[[ "$(validate_arguments promote-plain)" != *override-file* ]] \
  || fail "release without an override file passed one"
pass "release without an override file passes none"

for mode in scheduled ""; do
  set +e
  run_promote_case "promote-unattended-${mode:-unset}" "$mode" "$TEMP_ROOT/overrides.json"
  status=$?
  set -e
  [[ "$status" -eq 64 ]] \
    || fail "promote outside release mode with an override file exited $status, expected 64"
  [[ ! -e "$TEMP_ROOT/promote-unattended-${mode:-unset}.args" ]] \
    || fail "promote outside release mode reached the pipeline with an override file set"
done
pass "promote outside release mode refuses a gate override file before touching anything"

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
