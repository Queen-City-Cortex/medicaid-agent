#!/usr/bin/env bash
# Runs scripts/ops/backup-mastra.sh against fakes only: stub railway, curl,
# rclone, sqlite3 and sleep binaries first on PATH, a temp HOME and OPS_ENV,
# and a temp directory standing in for the agent's /data volume. The railway
# stub runs each ssh command in a local shell with /data rewritten to that
# directory, so the remote globs are expanded the way the container would.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/ops/backup-mastra.sh"
TEMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEMP_ROOT"' EXIT
FAKE_BIN="$TEMP_ROOT/bin"
TESTS=0
RUNNING_INSTANCE='inst-running'

fail() {
  printf 'not ok - %s\n' "$*" >&2
  [[ -f "${CASE_DIR:-}/output" ]] && sed 's/^/    /' "$CASE_DIR/output" >&2
  [[ -f "${CASE_DIR:-}/calls" ]] && sed 's/^/    > /' "$CASE_DIR/calls" >&2
  exit 1
}

pass() {
  TESTS=$((TESTS + 1))
  printf 'ok %s - %s\n' "$TESTS" "$1"
}

mkdir -p "$FAKE_BIN"

cat > "$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
url="${*: -1}"
if [[ "$url" == */healthz ]]; then
  left="$(<"$MOCK_DIR/healthz-misses")"
  if ((left > 0)); then
    echo $((left - 1)) > "$MOCK_DIR/healthz-misses"
    printf 'healthz 502\n' >> "$MOCK_DIR/calls"
    printf '502'
  else
    printf 'healthz 200\n' >> "$MOCK_DIR/calls"
    printf '200'
  fi
  exit 0
fi
printf 'ping %s\n' "$url" >> "$MOCK_DIR/calls"
EOF

cat > "$FAKE_BIN/railway" <<'EOF'
#!/usr/bin/env bash
account_json='{"status":"ready","account":{"name":"stub"}}'
case "$1" in
  status)
    printf 'status\n' >> "$MOCK_DIR/calls"
    [[ -n "${MOCK_NO_RUNNING_INSTANCE:-}" ]] && running=STOPPED || running=RUNNING
    # The instance is RUNNING for the first lookup only.
    if [[ -n "${MOCK_INSTANCE_GONE_ON_RETRY:-}" ]]; then
      [[ -e "$MOCK_DIR/status-seen" ]] && running=STOPPED
      touch "$MOCK_DIR/status-seen"
    fi
    cat <<JSON
{"environments":{"edges":[{"node":{"serviceInstances":{"edges":[
  {"node":{"serviceName":"neo4j","latestDeployment":{"instances":[{"id":"inst-other-service","status":"RUNNING"}]},"activeDeployments":[]}},
  {"node":{"serviceName":"@nc-medicaid/agent",
    "latestDeployment":{"id":"dep-new","instances":[{"id":"inst-obsolete","status":"REMOVED"},{"id":"inst-running","status":"$running"}]},
    "activeDeployments":[{"id":"dep-new","instances":[{"id":"inst-obsolete","status":"REMOVED"},{"id":"inst-running","status":"$running"}]}]}}
]}}}]}}
JSON
    ;;
  ssh)
    command="${*: -1}"
    # Everything before the remote command, plus how many arguments it took.
    separator=0
    for ((i = 1; i <= $#; i++)); do [[ "${!i}" == "--" ]] && separator=$i; done
    printf 'ssh remote_args=%s %s\n' "$(($# - separator))" "${*:1:separator}" >> "$MOCK_DIR/calls"
    if [[ "$command" == *SNAPSHOT_OK* && -n "${MOCK_SNAPSHOT_SENTINEL_LOST:-}" ]]; then
      # The snapshot is written but its output never arrives.
      sh -c "${command//\/data\//$MOCK_VOLUME/}" > /dev/null
      printf '%s\n' "$account_json"
      exit 0
    elif [[ "$command" == *SNAPSHOT_OK* ]]; then
      left="$(<"$MOCK_DIR/snapshot-misses")"
      if ((left > 0)); then
        echo $((left - 1)) > "$MOCK_DIR/snapshot-misses"
        printf '%s\n' "$account_json"
        exit 0
      fi
    elif [[ -n "${MOCK_CLEAN_FAIL:-}" ]]; then
      printf '%s\n' "$account_json"
      exit 0
    fi
    sh -c "${command//\/data\//$MOCK_VOLUME/}"
    exit 0
    ;;
  service)
    # service files -s <service> download --overwrite <remote> <local>
    remote="${*: -2:1}"
    local_path="${*: -1}"
    printf 'download %s\n' "$remote" >> "$MOCK_DIR/calls"
    [[ -z "${MOCK_DOWNLOAD_FAIL:-}" ]] || { echo 'Failed to copy remote file: Timeout' >&2; exit 1; }
    cp "${remote/#\/data\//$MOCK_VOLUME/}" "$local_path"
    ;;
  *)
    printf 'unexpected railway %s\n' "$*" >> "$MOCK_DIR/calls"
    exit 2
    ;;
esac
EOF

cat > "$FAKE_BIN/sqlite3" <<'EOF'
#!/usr/bin/env bash
if [[ "$2" =~ ^VACUUM\ INTO\ \'(.*)\'$ ]]; then
  [[ ! -e "${BASH_REMATCH[1]}" ]] || { echo 'Error: output file already exists' >&2; exit 1; }
  printf 'snapshot of %s\n' "$1" > "${BASH_REMATCH[1]}"
else
  echo ok
fi
EOF

cat > "$FAKE_BIN/rclone" <<'EOF'
#!/usr/bin/env bash
printf 'rclone %s\n' "$*" >> "$MOCK_DIR/calls"
EOF

printf '#!/usr/bin/env bash\nexit 0\n' > "$FAKE_BIN/sleep"
chmod +x "$FAKE_BIN"/*

# run_backup <case> [VAR=value...]: one isolated run; sets CASE_DIR and STATUS.
run_backup() {
  CASE_DIR="$TEMP_ROOT/$1"
  shift
  mkdir -p "$CASE_DIR/home" "$CASE_DIR/volume" "$CASE_DIR/tmp"
  echo "${HEALTHZ_MISSES:-0}" > "$CASE_DIR/healthz-misses"
  echo "${SNAPSHOT_MISSES:-0}" > "$CASE_DIR/snapshot-misses"
  # A leftover from an earlier failed run, which every snapshot must sweep.
  echo stale > "$CASE_DIR/volume/mastra-backup-2026-08-09.db"
  echo live > "$CASE_DIR/volume/mastra.db"
  cat > "$CASE_DIR/ops.env" <<'EOF'
BACKUP_REMOTE=fakeremote
BACKUP_BUCKET=fakebucket
HC_URL_MASTRA_BACKUP=http://hc.invalid/mastra
EOF
  STATUS=0
  env "$@" HOME="$CASE_DIR/home" OPS_ENV="$CASE_DIR/ops.env" TMPDIR="$CASE_DIR/tmp" \
    PATH="$FAKE_BIN:$PATH" MOCK_DIR="$CASE_DIR" MOCK_VOLUME="$CASE_DIR/volume" \
    bash -c '[[ "$(command -v railway)" == "$1/railway" && "$(command -v curl)" == "$1/curl" ]] || exit 97
             exec bash "$2"' _ "$FAKE_BIN" "$SCRIPT" > "$CASE_DIR/output" 2>&1 || STATUS=$?
  [[ "$STATUS" -ne 97 ]] || fail "fakes are not first on PATH; refusing to run the backup script"
  [[ -f "$CASE_DIR/calls" ]] || fail "$(basename "$CASE_DIR"): no stub was called"
}

calls() { grep -c -- "$1" "$CASE_DIR/calls" || true; }
line_of() { grep -n -m1 -- "$1" "$CASE_DIR/calls" | cut -d: -f1; }
assert_volume_clean() {
  local left
  left="$(find "$CASE_DIR/volume" -name 'mastra-backup-*.db')"
  [[ -z "$left" ]] || fail "$1: snapshot left on the volume: $left"
  [[ -f "$CASE_DIR/volume/mastra.db" ]] || fail "$1: live database was removed"
}
assert_tmp_clean() {
  [[ -z "$(ls -A "$CASE_DIR/tmp")" ]] || fail "$1: local temp directory left behind"
}
# Every ssh call names the resolved instance and sends the command as one argument.
assert_ssh_calls() {
  local expected="$2" total selected
  total="$(calls '^ssh ')"
  selected="$(calls "^ssh remote_args=1 ssh -s @nc-medicaid/agent --deployment-instance $RUNNING_INSTANCE --\$")"
  [[ "$total" -eq "$expected" ]] || fail "$1: expected $expected ssh calls, saw $total"
  [[ "$selected" -eq "$total" ]] || fail "$1: an ssh call did not select $RUNNING_INSTANCE with a single-argument command"
}

# Healthy run: polls /healthz through two 502s before touching Railway.
HEALTHZ_MISSES=2 run_backup healthy
[[ "$STATUS" -eq 0 ]] || fail "healthy run exited $STATUS"
[[ "$(calls '^healthz 502$')" -eq 2 ]] || fail "healthy: did not keep polling through 502s"
[[ "$(line_of '^healthz 200$')" -lt "$(line_of '^status$')" ]] || fail "healthy: resolved the instance before /healthz returned 200"
[[ "$(line_of '^status$')" -lt "$(line_of '^ssh ')" ]] || fail "healthy: ssh ran before the instance was resolved"
assert_ssh_calls healthy 2
[[ "$(calls '^rclone copyto .* fakeremote:fakebucket/agent/mastra/mastra-')" -eq 1 ]] || fail "healthy: snapshot was not uploaded"
[[ "$(calls '^ping http://hc.invalid/mastra$')" -eq 1 ]] || fail "healthy: no success ping"
[[ "$(calls '/fail$')" -eq 0 ]] || fail "healthy: failure ping sent"
assert_volume_clean healthy
assert_tmp_clean healthy
pass "waits for /healthz 200, selects the running instance on both ssh calls, sweeps and cleans up"

# The agent never wakes: nothing is asked of Railway.
HEALTHZ_MISSES=1000 run_backup asleep AGENT_WAKE_ATTEMPTS=3
[[ "$STATUS" -ne 0 ]] || fail "asleep: run succeeded without a healthy agent"
[[ "$(calls '^healthz 502$')" -eq 6 ]] || fail "asleep: expected 3 polls on each of 2 attempts"
[[ "$(calls '^status$')" -eq 0 && "$(calls '^ssh ')" -eq 0 ]] || fail "asleep: called Railway without a 200"
[[ "$(calls '/fail$')" -eq 1 ]] || fail "asleep: no failure ping"
pass "fails without calling Railway when /healthz never returns 200"

# No RUNNING instance: ssh is never left to pick its own default.
run_backup no-instance MOCK_NO_RUNNING_INSTANCE=1
[[ "$STATUS" -ne 0 ]] || fail "no-instance: run succeeded"
[[ "$(calls '^ssh ')" -eq 0 ]] || fail "no-instance: ssh ran without a resolved instance"
[[ "$(calls '/fail$')" -eq 1 ]] || fail "no-instance: expected exactly one failure ping"
pass "fails without ssh when no RUNNING instance is found"

# Sentinel missing once (account JSON instead of output): one retry, then success.
SNAPSHOT_MISSES=1 run_backup retry-once
[[ "$STATUS" -eq 0 ]] || fail "retry-once exited $STATUS"
[[ "$(calls '^healthz 200$')" -eq 2 && "$(calls '^status$')" -eq 2 ]] || fail "retry-once: retry did not re-wake and re-resolve"
assert_ssh_calls retry-once 3
[[ "$(calls '^rclone copyto ')" -eq 1 ]] || fail "retry-once: snapshot was not uploaded"
[[ "$(calls '/fail$')" -eq 0 ]] || fail "retry-once: failure ping sent"
assert_volume_clean retry-once
pass "retries once when SNAPSHOT_OK is missing"

# Sentinel missing twice: fails after the second miss, no third attempt; the
# third ssh call is the cleanup.
SNAPSHOT_MISSES=5 run_backup retry-exhausted
[[ "$STATUS" -ne 0 ]] || fail "retry-exhausted: run succeeded"
assert_ssh_calls retry-exhausted 3
assert_volume_clean retry-exhausted
[[ "$(calls '^download ')" -eq 0 && "$(calls '^rclone ')" -eq 0 ]] || fail "retry-exhausted: continued past a failed snapshot"
[[ "$(calls '/fail$')" -eq 1 ]] || fail "retry-exhausted: no failure ping"
pass "fails after the second missing sentinel"

# Both attempts write the snapshot file but lose the sentinel: the copy must
# not stay on the volume.
run_backup snapshot-written-unconfirmed MOCK_SNAPSHOT_SENTINEL_LOST=1
[[ "$STATUS" -ne 0 ]] || fail "snapshot-written-unconfirmed: run succeeded"
assert_ssh_calls snapshot-written-unconfirmed 3
[[ "$(calls '^download ')" -eq 0 ]] || fail "snapshot-written-unconfirmed: continued past a failed snapshot"
[[ "$(calls '/fail$')" -eq 1 ]] || fail "snapshot-written-unconfirmed: no failure ping"
assert_volume_clean snapshot-written-unconfirmed
pass "a snapshot written without its sentinel on both attempts is still removed"

# The first attempt writes a snapshot; the retry cannot resolve an instance.
# Cleanup still goes to the instance the first attempt wrote on.
run_backup instance-gone-on-retry MOCK_SNAPSHOT_SENTINEL_LOST=1 MOCK_INSTANCE_GONE_ON_RETRY=1
[[ "$STATUS" -ne 0 ]] || fail "instance-gone-on-retry: run succeeded"
assert_ssh_calls instance-gone-on-retry 2
assert_volume_clean instance-gone-on-retry
pass "cleanup reaches the first attempt's instance when the retry resolves none"

# Download fails after the snapshot: the exit hook still clears the volume.
run_backup download-fails MOCK_DOWNLOAD_FAIL=1
[[ "$STATUS" -ne 0 ]] || fail "download-fails: run succeeded"
assert_ssh_calls download-fails 2
[[ "$(line_of '^download ')" -lt "$(grep -n '^ssh ' "$CASE_DIR/calls" | tail -1 | cut -d: -f1)" ]] || fail "download-fails: no remote cleanup after the failed download"
[[ "$(calls '^rclone ')" -eq 0 ]] || fail "download-fails: uploaded after a failed download"
[[ "$(calls '/fail$')" -eq 1 ]] || fail "download-fails: no failure ping"
assert_volume_clean download-fails
assert_tmp_clean download-fails
pass "a failed download still removes the remote snapshot and the local temp directory"

# Cleanup cannot be confirmed: the run is reported failed even though the copy uploaded.
run_backup cleanup-fails MOCK_CLEAN_FAIL=1
[[ "$STATUS" -eq 1 ]] || fail "cleanup-fails: exited $STATUS, expected 1"
[[ "$(calls '^rclone copyto ')" -eq 1 ]] || fail "cleanup-fails: snapshot was not uploaded"
[[ "$(calls '/fail$')" -eq 1 ]] || fail "cleanup-fails: no failure ping"
[[ "$(line_of '/fail$')" -gt "$(line_of '^ping http://hc.invalid/mastra$')" ]] || fail "cleanup-fails: failure ping is not the last word"
# With the exit-hook removal stubbed out, what is left shows the pre-snapshot
# sweep alone: the earlier run's leftover is gone, only this run's file remains.
[[ ! -e "$CASE_DIR/volume/mastra-backup-2026-08-09.db" ]] || fail "cleanup-fails: earlier leftover was not swept before the snapshot"
[[ "$(find "$CASE_DIR/volume" -name 'mastra-backup-*.db' | wc -l)" -eq 1 ]] || fail "cleanup-fails: stub did not leave this run's snapshot in place"
assert_tmp_clean cleanup-fails
pass "an unconfirmed remote cleanup marks the run failed"

printf '1..%s\n' "$TESTS"
