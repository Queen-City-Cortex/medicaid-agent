#!/usr/bin/env bash
# Runs scripts/ops/corpus-release.sh against fakes only. Each case gets a copy
# of the release scripts in a temp repository root, stub railway, curl, rclone
# and sleep binaries first on PATH, a stub pipeline Python, and a temp corpus
# volume. Nothing reaches Railway, a graph, a model or object storage.
#
# The fakes keep just enough state for a second run to find what the first one
# left behind:
#   - railway holds the agent's variables in $STATE/agent.env; `variable set`
#     rewrites them, `variables --kv` prints them. What the running agent
#     serves is kept apart, in $STATE/deployed.env: only a successful redeploy
#     of the agent service copies the variables there;
#   - curl answers /readyz from the deployed state, never from the variables;
#   - rclone copyto copies to and from $STATE/bucket;
#   - the pipeline Python logs each command and applies the one manifest field
#     change each lifecycle command makes (the state, and the previous
#     release's superseded stamp), so the shell reads real manifest files.
#     The pipeline tests cover the real commands; test_railway_packaging.py
#     checks the shell against manifests those commands wrote.
# Every call is appended to $STATE/calls in order.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TEMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEMP_ROOT"' EXIT
FAKE_BIN="$TEMP_ROOT/bin"
TESTS=0
CASE=""

((BASH_VERSINFO[0] >= 4)) || {
  printf 'not ok - corpus-release.sh needs bash 4 or newer; found %s\n' "$BASH_VERSION" >&2
  exit 1
}

fail() {
  printf 'not ok - %s\n' "$*" >&2
  [[ -f "$TEMP_ROOT/$CASE/output" ]] && sed 's/^/    /' "$TEMP_ROOT/$CASE/output" >&2
  [[ -f "$TEMP_ROOT/$CASE/state/calls" ]] && sed 's/^/    > /' "$TEMP_ROOT/$CASE/state/calls" >&2
  exit 1
}

pass() {
  TESTS=$((TESTS + 1))
  printf 'ok %s - %s\n' "$TESTS" "$1"
}

mkdir -p "$FAKE_BIN"

cat > "$FAKE_BIN/railway" <<'STUB'
#!/usr/bin/env bash
printf 'railway %s\n' "$*" >> "$STATE/calls"
service=""
arguments=("$@")
for ((i = 0; i < ${#arguments[@]}; i++)); do
  [[ "${arguments[$i]}" == "--service" ]] && service="${arguments[$((i + 1))]}"
done
case "$1" in
  variables) cat "$STATE/agent.env" ;;
  variable)
    [[ ! -e "$STATE/fail-variable-set" ]] || exit 1
    for argument in "$@"; do
      [[ "$argument" == [A-Z]*=* ]] || continue
      grep -v "^${argument%%=*}=" "$STATE/agent.env" > "$STATE/agent.env.next" || true
      printf '%s\n' "$argument" >> "$STATE/agent.env.next"
      mv "$STATE/agent.env.next" "$STATE/agent.env"
    done
    ;;
  redeploy)
    if [[ "$service" != neo4j-* ]]; then
      # $STATE/agent-redeploys-left holds how many more agent redeploys succeed.
      if [[ -e "$STATE/agent-redeploys-left" ]]; then
        left="$(<"$STATE/agent-redeploys-left")"
        ((left > 0)) || exit 1
        echo $((left - 1)) > "$STATE/agent-redeploys-left"
      fi
      cp "$STATE/agent.env" "$STATE/deployed.env"
    fi
    printf '{"id":"deployment-1"}\n'
    ;;
  deployment) printf '[{"id":"deployment-1","status":"SUCCESS"}]\n' ;;
  down) ;;
  *) exit 64 ;;
esac
STUB

cat > "$FAKE_BIN/curl" <<'STUB'
#!/usr/bin/env bash
url="${*: -1}"
printf 'curl %s\n' "$url" >> "$STATE/calls"
[[ "$url" == */readyz ]] || exit 0
if [[ -e "$STATE/readyz-release" ]]; then
  release="$(<"$STATE/readyz-release")"
else
  release="$(sed -n 's/^CORPUS_RELEASE_ID=//p' "$STATE/deployed.env")"
fi
status=ok
# $STATE/readyz-never-ready names a release whose deployment never gets ready.
if [[ -e "$STATE/readyz-never-ready" && "$(<"$STATE/readyz-never-ready")" == "$release" ]]; then
  status=starting
fi
printf '{"status":"%s","releaseId":"%s"}\n' "$status" "$release"
STUB

cat > "$FAKE_BIN/rclone" <<'STUB'
#!/usr/bin/env bash
printf 'rclone %s\n' "$*" >> "$STATE/calls"
[[ "$1" == "copyto" ]] || exit 0
local_path() {
  if [[ "$1" == release:* ]]; then
    printf '%s/bucket/%s' "$STATE" "${1#release:}"
  else
    printf '%s' "$1"
  fi
}
source_path="$(local_path "$2")"
destination_path="$(local_path "$3")"
mkdir -p "$(dirname "$destination_path")"
cp "$source_path" "$destination_path"
STUB

cat > "$FAKE_BIN/sleep" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB

# The stub pipeline CLI. A case makes one command fail by writing the status
# to $STATE/python-exit-<command>.
cat > "$FAKE_BIN/pipeline-python" <<'STUB'
#!/usr/bin/env bash
shift 2  # -m pipeline.cli
command="$1"
printf 'python %s\n' "$*" >> "$STATE/calls"
option() {
  local name="$1"
  shift
  while (($#)); do
    [[ "$1" == "$name" ]] && { printf '%s' "$2"; return; }
    shift
  done
}
edit() {
  local file="$1"
  shift
  jq "$@" "$file" > "$file.next" && mv "$file.next" "$file"
}
if [[ -e "$STATE/python-exit-$command" ]]; then
  exit "$(<"$STATE/python-exit-$command")"
fi
# The whole job is killed at this command: no trap or exit hook runs.
if [[ -e "$STATE/python-kill-$command" ]]; then
  pkill -KILL -f "$(dirname "$STATE")/repo/scripts/ops/corpus-release.sh"
  exit 137
fi
manifest="$(option --manifest "$@")"
[[ -n "$manifest" ]] || manifest="$(option --current-manifest "$@")"
previous="$(option --previous-manifest "$@")"
case "$command" in
  release-prepare)
    jq -n \
      --arg id "$(option --release-id "$@")" \
      --arg color "$(option --target-color "$@")" \
      --arg previous "$([[ -z "$previous" ]] || basename "$previous" .json)" \
      '{releaseId: $id, targetColor: $color, promotionState: "building",
        previousReleaseId: (if $previous == "" then null else $previous end)}' \
      > "$(option --output "$@")"
    ;;
  release-validate) edit "$manifest" '.promotionState = "validated"' ;;
  release-mark-cutover-started)
    edit "$previous" --arg id "$(jq -r .releaseId "$manifest")" \
      '.supersededByReleaseId = $id | .rollbackWindowEndsAt = "2026-10-07T10:00:00Z"'
    ;;
  release-mark-promoted) edit "$manifest" '.promotionState = "promoted"' ;;
  release-mark-recovery-pending) edit "$manifest" '.promotionState = "recovery_pending"' ;;
  release-mark-cutover-restored | release-mark-rolled-back)
    edit "$manifest" '.promotionState = "rolled_back"'
    edit "$previous" 'del(.supersededByReleaseId) | .rollbackWindowEndsAt = null | .promotionState = "promoted"'
    ;;
  release-retention-check) printf '{"blocked": false}\n' ;;
  release-cleanup-candidate)
    if [[ -e "$STATE/cleanup-candidate" ]]; then cat "$STATE/cleanup-candidate"; else printf '{}\n'; fi
    ;;
esac
exit 0
STUB
chmod +x "$FAKE_BIN"/*

write_manifest() {
  local release="$1" color="$2" state="$3" previous="${4:-}" superseded_by="${5:-}"
  jq -n --arg id "$release" --arg color "$color" --arg state "$state" \
    --arg previous "$previous" --arg superseder "$superseded_by" \
    '{releaseId: $id, targetColor: $color, promotionState: $state,
      previousReleaseId: (if $previous == "" then null else $previous end)}
     + (if $superseder == "" then {} else
        {supersededByReleaseId: $superseder, rollbackWindowEndsAt: "2026-10-07T10:00:00Z"} end)' \
    > "$DATA/pipeline/releases/$release.json"
}

agent_serves() {
  printf '%s\n' "ACTIVE_CORPUS_COLOR=$2" "CORPUS_RELEASE_ID=$1" \
    "NEO4J_URI=bolt://$2" "NEO4J_PASSWORD=$2-password" > "$STATE/agent.env"
  cp "$STATE/agent.env" "$STATE/deployed.env"
}

deployed() { grep -qx -- "$1" "$STATE/deployed.env"; }

# The agent serves promoted release-1 on blue, with its manifest on the volume.
new_case() {
  CASE="$1"
  local root="$TEMP_ROOT/$CASE"
  STATE="$root/state"
  DATA="$root/data"
  FAKE_ROOT="$root/repo"
  mkdir -p "$STATE/bucket" "$DATA/pipeline/releases" "$root/home" \
    "$FAKE_ROOT/scripts/ops" "$FAKE_ROOT/packages/pipeline"
  cp "$REPO_ROOT/scripts/ops/corpus-release.sh" "$REPO_ROOT/scripts/ops/lib.sh" \
    "$REPO_ROOT/scripts/ops/corpus-release-cleanup.sh" \
    "$REPO_ROOT/scripts/ops/object-storage-lib.sh" \
    "$REPO_ROOT/scripts/ops/upload-release-manifest.sh" "$FAKE_ROOT/scripts/ops/"
  cat > "$FAKE_ROOT/scripts/ops/sync-corpus-artifacts.sh" <<'STUB'
#!/usr/bin/env bash
printf 'sync-corpus-artifacts %s\n' "$1" >> "$STATE/calls"
STUB
  cat > "$FAKE_ROOT/scripts/ops/authenticated-release-smoke.sh" <<'STUB'
#!/usr/bin/env bash
printf 'smoke %s\n' "$1" >> "$STATE/calls"
# The job is killed here, after the agent switch and before the result is
# recorded: no trap or exit hook of the release script runs.
[[ ! -e "$STATE/kill-at-smoke" ]] || kill -KILL "$PPID"
[[ ! -e "$STATE/fail-smoke" ]] || exit 1
STUB
  chmod +x "$FAKE_ROOT/scripts/ops/"*.sh
  agent_serves release-1 blue
  write_manifest release-1 blue promoted
  : > "$STATE/calls"
}

# Runs one corpus-release.sh action for the current case, or the cleanup
# script for `cleanup`; prints nothing and returns the script's exit status.
# Extra arguments are NAME=value settings. The call log starts empty.
run_release() {
  local action="$1" script="corpus-release.sh"
  shift
  [[ "$action" != "cleanup" ]] || script="corpus-release-cleanup.sh"
  : > "$STATE/calls"
  env -i PATH="$FAKE_BIN:$PATH" HOME="$TEMP_ROOT/$CASE/home" \
    OPS_ENV="$TEMP_ROOT/no-ops.env" STATE="$STATE" \
    CORPUS_DATA_ROOT="$DATA" PIPELINE_PYTHON="$FAKE_BIN/pipeline-python" \
    RAILWAY_GIT_COMMIT_SHA=abcdef1234 REQUESTED_CORPUS_RELEASE_ID=release-2 \
    NEO4J_BLUE_URI=bolt://blue NEO4J_BLUE_PASSWORD=blue-password \
    NEO4J_GREEN_URI=bolt://green NEO4J_GREEN_PASSWORD=green-password \
    AGENT_PUBLIC_URL=https://agent.test \
    SYNTHETIC_USER_EMAIL=synthetic@agent.test SYNTHETIC_USER_PASSWORD=stub \
    WORKOS_CLIENT_ID=stub WORKOS_API_KEY=stub \
    BUCKET=bucket ACCESS_KEY_ID=stub SECRET_ACCESS_KEY=stub ENDPOINT=https://objects.test \
    "$@" \
    bash "$FAKE_ROOT/scripts/ops/$script" "$action" \
    > "$TEMP_ROOT/$CASE/output" 2>&1
}

# Runs an action and expects one exit status.
expect_exit() {
  local expected="$1" actual=0
  shift
  # A killed run makes the shell report the signal; keep that off the output.
  { run_release "$@" || actual=$?; } 2>/dev/null
  [[ "$actual" -eq "$expected" ]] || fail "$1 exited $actual, expected $expected ($CASE)"
}

agent_names() { grep -qx -- "$1" "$STATE/agent.env"; }
manifest_field() { jq -r "$2 // \"\"" "$DATA/pipeline/releases/$1.json"; }
uploaded_field() { jq -r "$2 // \"\"" "$STATE/bucket/bucket/releases/$1/manifest.json"; }
count_of() { grep -c -- "$1" "$STATE/calls" || true; }
line_of() { grep -n -m 1 -- "$1" "$STATE/calls" | cut -d: -f1; }
last_line_of() { { grep -n -- "$1" "$STATE/calls" || echo 0; } | tail -n 1 | cut -d: -f1; }
called() { grep -q -- "$1" "$STATE/calls"; }
before() {
  local first second
  first="$(line_of "$1")"
  second="$(line_of "$2")"
  [[ -n "$first" && -n "$second" && "$first" -lt "$second" ]]
}
printed() { grep -q -- "$1" "$TEMP_ROOT/$CASE/output"; }

RESTORE_BLUE='railway variable set --skip-deploys --environment production --service @nc-medicaid/agent NEO4J_URI=bolt://blue NEO4J_PASSWORD=blue-password CORPUS_RELEASE_ID=release-1 ACTIVE_CORPUS_COLOR=blue'

# What every run that finds an unfinished cutover to release-2 must have done,
# and must not have done.
assert_restored_release_1() {
  local what="$1"
  called "^$RESTORE_BLUE\$" || fail "$what did not point the agent back at release-1 on blue"
  [[ "$(line_of "^$RESTORE_BLUE\$")" -lt "$(last_line_of 'curl https://agent.test/readyz')" ]] \
    || fail "$what did not wait for the restored release on /readyz"
  called "python release-mark-cutover-restored --current-manifest $DATA/pipeline/releases/release-2.json --previous-manifest $DATA/pipeline/releases/release-1.json\$" \
    || fail "$what did not record the restore on both manifests"
  called "python release-mark-graph --manifest $DATA/pipeline/releases/release-2.json --state rolled_back\$" \
    || fail "$what did not mark the abandoned graph rolled back"
  agent_names CORPUS_RELEASE_ID=release-1 || fail "$what left the agent off release-1"
  agent_names ACTIVE_CORPUS_COLOR=blue || fail "$what left the agent off blue"
  agent_names NEO4J_URI=bolt://blue || fail "$what left the agent off the blue graph"
  [[ "$(manifest_field release-2 .promotionState)" == rolled_back ]] \
    || fail "$what left release-2 $(manifest_field release-2 .promotionState)"
  [[ -z "$(manifest_field release-1 .supersededByReleaseId)" ]] \
    || fail "$what left release-1 stamped as superseded"
  [[ "$(uploaded_field release-2 .promotionState)" == rolled_back ]] \
    || fail "$what did not upload the rolled-back manifest"
  [[ -z "$(uploaded_field release-1 .supersededByReleaseId)" ]] \
    || fail "$what did not upload the restored previous manifest"
}

assert_nothing_built() {
  local what="$1"
  ! called 'python release-prepare' || fail "$what prepared a new release"
  ! called 'railway redeploy .*--service neo4j-' || fail "$what restarted a graph"
  ! called 'python release-build-graph' || fail "$what reset a graph"
  ! called 'railway down' || fail "$what stopped a graph"
}

# ── Release preflight ────────────────────────────────────────────────────────

new_case promote-order
expect_exit 0 promote
before 'python release-prepare' 'python release-preflight' \
  || fail "promote did not prepare the manifest before the preflight"
before 'python release-preflight' 'railway redeploy .*--service neo4j-green' \
  || fail "promote restarted the target graph before the preflight"
before 'railway redeploy .*--service neo4j-green' 'python release-build-graph' \
  || fail "promote built before restarting the target graph"
called "python release-preflight --manifest $DATA/pipeline/releases/release-2.json --releases-dir $DATA/pipeline/releases --previous-manifest $DATA/pipeline/releases/release-1.json\$" \
  || fail "promote did not preflight the manifest against the previous release"
! called 'railway down' || fail "a promoted release stopped its own graph"
pass "promote prepares and preflights the release before the target graph is restarted"

for status in 1 21 22; do
  new_case "promote-preflight-$status"
  echo "$status" > "$STATE/python-exit-release-preflight"
  expect_exit "$status" promote
  ! called 'railway redeploy' || fail "a refused preflight still restarted a graph"
  ! called 'release-build-graph' || fail "a refused preflight still reset the graph"
  ! called 'railway down' || fail "a refused preflight stopped a graph it never started"
  ! called 'railway variable set' || fail "a refused preflight changed the agent target"
done
pass "a failed preflight, a snapshot already rejected (21) or already released (22) stops promote before any graph is touched"

new_case promote-retry-rejected
expect_exit 0 promote RELEASE_RETRY_REJECTED=release-0
called 'python release-preflight .* --retry-rejected release-0$' \
  || fail "promote did not pass the rejected release to retry"
pass "promote passes the one rejected release an operator chose to retry"

new_case promote-no-agent-url
expect_exit 64 promote AGENT_PUBLIC_URL=
! called 'python release-prepare' || fail "promote prepared a release it could not cut over"
printed 'AGENT_PUBLIC_URL is required' || fail "promote did not name the missing variable"
pass "promote refuses to start without the agent URL its cutover needs"

for command in release-build-graph release-validate; do
  new_case "promote-stops-target-$command"
  echo 1 > "$STATE/python-exit-$command"
  expect_exit 1 promote
  called 'railway down --environment production --service neo4j-green --yes' \
    || fail "promote left neo4j-green running after $command failed"
  ! called 'railway variable set' || fail "promote switched the agent after $command failed"
  ! called 'railway down .*--service neo4j-blue' || fail "promote stopped the serving graph"
done
pass "promote stops the target graph when it ends between the restart and the agent switch"

# A bootstrap of green for the current case.
bootstrap_case() {
  new_case "$1"
  bootstrap_settings=(BOOTSTRAP_TARGET_COLOR=green BOOTSTRAP_RESET_CONFIRM=neo4j-green
    BOOTSTRAP_BASELINE_EVIDENCE="$DATA/pipeline/releases/legacy-baseline.json")
}

bootstrap_case bootstrap-order
expect_exit 0 bootstrap "${bootstrap_settings[@]}"
before 'python release-prepare' 'python release-preflight' \
  || fail "bootstrap did not prepare the manifest before the preflight"
before 'python release-preflight' 'railway redeploy .*--service neo4j-green' \
  || fail "bootstrap restarted the target graph before the preflight"
called "python release-preflight --manifest $DATA/pipeline/releases/release-2.json --releases-dir $DATA/pipeline/releases --baseline-evidence $DATA/pipeline/releases/legacy-baseline.json\$" \
  || fail "bootstrap did not preflight the legacy baseline"
! called 'railway variable set' || fail "bootstrap changed the agent target"
! called 'railway down' || fail "bootstrap stopped the graph it validated"
pass "bootstrap prepares and preflights the release before the target graph is restarted"

bootstrap_case bootstrap-preflight-fails
echo 1 > "$STATE/python-exit-release-preflight"
expect_exit 1 bootstrap "${bootstrap_settings[@]}"
! called 'railway redeploy' || fail "a failed preflight still restarted the bootstrap graph"
! called 'release-build-graph' || fail "a failed preflight still reset the bootstrap graph"
pass "a failed preflight stops bootstrap before the target graph is restarted"

# ── Gate overrides at bootstrap ──────────────────────────────────────────────

bootstrap_case bootstrap-override
expect_exit 0 bootstrap "${bootstrap_settings[@]}" RELEASE_OVERRIDE_FILE="$DATA/overrides.json"
called "python release-preflight --manifest $DATA/pipeline/releases/release-2.json --releases-dir $DATA/pipeline/releases --baseline-evidence $DATA/pipeline/releases/legacy-baseline.json --override-file $DATA/overrides.json\$" \
  || fail "bootstrap did not preflight the override file"
called "python release-validate --manifest $DATA/pipeline/releases/release-2.json --baseline-evidence $DATA/pipeline/releases/legacy-baseline.json --override-file $DATA/overrides.json\$" \
  || fail "bootstrap did not pass the override file to release-validate"
before 'python release-preflight .*--override-file' 'railway redeploy .*--service neo4j-green' \
  || fail "bootstrap restarted the graph before the override file was checked"
pass "bootstrap passes a gate override file to the preflight and to release-validate"

bootstrap_case bootstrap-no-override
expect_exit 0 bootstrap "${bootstrap_settings[@]}"
! called 'override-file' || fail "bootstrap passed an override file it was not given"
called "python release-validate --manifest $DATA/pipeline/releases/release-2.json --baseline-evidence $DATA/pipeline/releases/legacy-baseline.json\$" \
  || fail "bootstrap did not validate against the legacy baseline"
pass "bootstrap without an override file passes none and still requires the legacy baseline"

bootstrap_case bootstrap-stale-override
echo 1 > "$STATE/python-exit-release-preflight"
expect_exit 1 bootstrap "${bootstrap_settings[@]}" RELEASE_OVERRIDE_FILE="$DATA/overrides.json"
! called 'railway redeploy' || fail "a refused override file still restarted the bootstrap graph"
! called 'python release-build-graph' || fail "a refused override file still reset the bootstrap graph"
pass "an override file the preflight refuses stops bootstrap before the graph is reset"

new_case bootstrap-needs-baseline
expect_exit 1 bootstrap BOOTSTRAP_TARGET_COLOR=green BOOTSTRAP_RESET_CONFIRM=neo4j-green
printed 'A fresh comparable legacy baseline is required' \
  || fail "bootstrap did not require the legacy baseline"
! called 'python' || fail "bootstrap ran the pipeline without a legacy baseline"
pass "bootstrap still refuses to start without the legacy baseline evidence"

# ── Cutover ──────────────────────────────────────────────────────────────────

SWITCH_GREEN='railway variable set --skip-deploys --environment production --service @nc-medicaid/agent NEO4J_URI=bolt://green NEO4J_PASSWORD=green-password CORPUS_RELEASE_ID=release-2 ACTIVE_CORPUS_COLOR=green'

new_case cutover-order
expect_exit 0 promote
started="python release-mark-cutover-started --manifest $DATA/pipeline/releases/release-2.json --previous-manifest $DATA/pipeline/releases/release-1.json\$"
before "$started" "rclone copyto $DATA/pipeline/releases/release-2.json release:bucket/releases/release-2/manifest.json" \
  || fail "promote did not upload the candidate manifest after recording the cutover"
before "rclone copyto $DATA/pipeline/releases/release-1.json release:bucket/releases/release-1/manifest.json" "^$SWITCH_GREEN\$" \
  || fail "promote switched the agent before the stamped previous manifest was uploaded"
before "rclone copyto $DATA/pipeline/releases/release-2.json release:bucket/releases/release-2/manifest.json" "^$SWITCH_GREEN\$" \
  || fail "promote switched the agent before the candidate manifest was uploaded"
before "^$SWITCH_GREEN\$" 'smoke release-2' || fail "promote verified before the switch"
before 'smoke release-2' 'python release-mark-promoted' \
  || fail "promote recorded the promotion before verifying it"
before 'python release-mark-promoted' 'python release-mark-graph .*--state promoted' \
  || fail "promote marked the graph promoted before the manifest"
agent_names CORPUS_RELEASE_ID=release-2 || fail "a clean promote left the agent off release-2"
[[ "$(manifest_field release-2 .promotionState)" == promoted ]] || fail "release-2 was not promoted"
[[ "$(uploaded_field release-1 .supersededByReleaseId)" == release-2 ]] \
  || fail "the uploaded previous manifest does not name its replacement"
pass "promote records the rollback window and uploads both manifests before it switches the agent"

# The job is killed after the switch, before the promotion is recorded.
leave_cutover_unfinished() {
  new_case "$1"
  touch "$STATE/kill-at-smoke"
  expect_exit 137 promote
  rm "$STATE/kill-at-smoke"
}

leave_cutover_unfinished killed-after-switch
agent_names CORPUS_RELEASE_ID=release-2 || fail "the killed run had not switched the agent"
agent_names ACTIVE_CORPUS_COLOR=green || fail "the killed run had not switched the color"
[[ "$(manifest_field release-2 .promotionState)" == validated ]] \
  || fail "the killed run recorded a promotion"
[[ "$(uploaded_field release-2 .promotionState)" == validated ]] \
  || fail "the candidate manifest was not in the bucket before the switch"
[[ "$(uploaded_field release-1 .supersededByReleaseId)" == release-2 \
  && -n "$(uploaded_field release-1 .rollbackWindowEndsAt)" ]] \
  || fail "the previous manifest in the bucket lacks its rollback window"
! called 'railway down' || fail "the killed run stopped a graph"
# The next scheduled run must not build on, or reset beside, the unverified release.
expect_exit 1 promote REQUESTED_CORPUS_RELEASE_ID=release-3
assert_restored_release_1 "the run after a kill"
assert_nothing_built "the run after a kill"
! called 'smoke' || fail "the restore was judged by the chat smoke"
printed 'cutover to release-2 was left unfinished' || fail "the run did not say what it found"
# With the state settled, the run after that promotes normally.
expect_exit 0 promote REQUESTED_CORPUS_RELEASE_ID=release-3
agent_names CORPUS_RELEASE_ID=release-3 || fail "the third run did not promote release-3"
agent_names ACTIVE_CORPUS_COLOR=green || fail "the third run did not rebuild on green"
pass "a kill between the switch and the promotion record is restored by the next run, and the run after promotes"

leave_cutover_unfinished recover-mode
expect_exit 0 recover
assert_restored_release_1 "recover"
assert_nothing_built "recover"
printed 'Recovered: release-1 is serving and release-2 is recorded as rolled back' \
  || fail "recover did not report what it restored"
expect_exit 0 recover
printed 'No unfinished cutover' || fail "a second recover did not find the state settled"
! called 'railway variable set' || fail "recover changed a settled agent target"
pass "recover restores an unfinished cutover and does nothing once it is settled"

leave_cutover_unfinished cleanup-guard
echo "{\"manifestPath\": \"$DATA/pipeline/releases/release-2.json\", \"releaseId\": \"release-2\"}" \
  > "$STATE/cleanup-candidate"
expect_exit 1 cleanup
assert_restored_release_1 "cleanup"
! called 'railway down' || fail "cleanup stopped a graph while the cutover was unfinished"
! called 'python release-cleanup-candidate' || fail "cleanup looked for a graph to stop"
expect_exit 0 cleanup
called 'railway down --environment production --service neo4j-green --yes' \
  || fail "cleanup on a settled state did not stop the inactive graph"
pass "cleanup restores an unfinished cutover and stops nothing until the state is settled"

leave_cutover_unfinished rollback-guard
expect_exit 1 rollback
assert_restored_release_1 "rollback"
! called 'python release-check-rollback' || fail "rollback proceeded from an unfinished cutover"
pass "rollback restores an unfinished cutover and stops"

# The serving manifest was never promoted: derive the previous target from it.
for state in validated recovery_pending; do
  new_case "unpromoted-serving-$state"
  write_manifest release-0 green promoted "" release-1
  write_manifest release-1 blue "$state" release-0
  expect_exit 1 promote
  called '^railway variable set --skip-deploys --environment production --service @nc-medicaid/agent NEO4J_URI=bolt://green NEO4J_PASSWORD=green-password CORPUS_RELEASE_ID=release-0 ACTIVE_CORPUS_COLOR=green$' \
    || fail "promote did not derive release-0 on green from a $state serving manifest"
  called "python release-mark-cutover-restored --current-manifest $DATA/pipeline/releases/release-1.json --previous-manifest $DATA/pipeline/releases/release-0.json\$" \
    || fail "promote did not record the restore from a $state serving manifest"
  assert_nothing_built "promote on a $state serving manifest"
  agent_names CORPUS_RELEASE_ID=release-0 || fail "the agent was not restored to release-0"
done
pass "promote refuses an unpromoted serving manifest and restores the previous target it names"

# A rebuilt volume has no local manifests: both come from the bucket.
new_case manifests-from-bucket
write_manifest release-0 green promoted "" release-1
write_manifest release-1 blue validated release-0
for release in release-0 release-1; do
  mkdir -p "$STATE/bucket/bucket/releases/$release"
  mv "$DATA/pipeline/releases/$release.json" "$STATE/bucket/bucket/releases/$release/manifest.json"
done
expect_exit 0 recover
agent_names CORPUS_RELEASE_ID=release-0 || fail "recover did not restore from bucket manifests"
[[ "$(manifest_field release-1 .promotionState)" == rolled_back ]] \
  || fail "recover did not record the restore on the downloaded manifest"
pass "recover reads both manifests from the bucket when the volume has none"

# The switch itself fails and so does the restore: the agent never moved.
new_case switch-never-happened
touch "$STATE/fail-variable-set"
expect_exit 1 promote
agent_names CORPUS_RELEASE_ID=release-1 || fail "a failed switch moved the agent"
[[ "$(manifest_field release-2 .promotionState)" == recovery_pending ]] \
  || fail "a failed restore did not leave release-2 recovery_pending"
[[ "$(manifest_field release-1 .supersededByReleaseId)" == release-2 ]] \
  || fail "the previous manifest lost its stamp before any restore succeeded"
called 'python release-event .*--type cutover_restore_failed' \
  || fail "a failed restore was not recorded"
! called 'railway down' || fail "a graph was stopped after the cutover had started"
rm "$STATE/fail-variable-set"
# release-1 is promoted and serving, but stamped as replaced: still unfinished.
expect_exit 1 promote REQUESTED_CORPUS_RELEASE_ID=release-3
assert_restored_release_1 "the run after a failed switch"
assert_nothing_built "the run after a failed switch"
expect_exit 0 promote REQUESTED_CORPUS_RELEASE_ID=release-3
agent_names CORPUS_RELEASE_ID=release-3 || fail "the run after recovery did not promote"
pass "a serving release still stamped as replaced is recovered before the next promotion"

new_case smoke-fails
touch "$STATE/fail-smoke"
expect_exit 1 promote
[[ "$(count_of '^smoke release-2$')" -eq 1 ]] || fail "the forward smoke did not run exactly once"
! called '^smoke release-1$' || fail "the restore was judged by the chat smoke"
assert_restored_release_1 "a failed release smoke"
! called 'railway down' || fail "a graph was stopped after the cutover had started"
pass "a failed release smoke restores the previous target, judged by the deployment and /readyz"

new_case restore-not-ready
touch "$STATE/fail-smoke"
echo 1 > "$STATE/agent-redeploys-left"  # the switch deploys; no restore does
expect_exit 1 promote
[[ "$(count_of "^$RESTORE_BLUE\$")" -eq 3 ]] || fail "the restore was not attempted three times"
called 'python release-event .*--type cutover_restore_failed' \
  || fail "a restore that never became ready was not recorded as failed"
! called 'python release-mark-cutover-restored' \
  || fail "a restore that never became ready was recorded as restored"
[[ "$(manifest_field release-2 .promotionState)" == recovery_pending ]] \
  || fail "a failed restore did not leave release-2 recovery_pending"
deployed CORPUS_RELEASE_ID=release-2 || fail "the failed restore changed what is deployed"
rm "$STATE/fail-smoke" "$STATE/agent-redeploys-left"
expect_exit 0 recover
assert_restored_release_1 "recover after a failed restore"
pass "a restore whose redeploy never succeeds stays recovery_pending until recover completes it"

new_case promotion-record-fails
echo 1 > "$STATE/python-exit-release-mark-promoted"
expect_exit 1 promote
! called 'python release-mark-graph .*--state promoted' \
  || fail "the graph was marked promoted after the manifest could not be"
! printed 'Promotion verified' || fail "a failed promotion record was reported as verified"
rm "$STATE/python-exit-release-mark-promoted"
assert_restored_release_1 "a failed promotion record"
pass "a failed promotion record is not masked by the graph marker and restores the previous target"

new_case rollback-clean
expect_exit 0 promote
expect_exit 0 rollback
before 'python release-check-rollback' "^$RESTORE_BLUE\$" \
  || fail "rollback switched before checking the rollback window"
[[ "$(line_of "^$RESTORE_BLUE\$")" -lt "$(last_line_of 'curl https://agent.test/readyz')" ]] \
  || fail "rollback did not wait for release-1 on /readyz"
before 'python release-mark-rolled-back' 'smoke release-1' \
  || fail "rollback did not record itself before the chat smoke"
agent_names CORPUS_RELEASE_ID=release-1 || fail "rollback left the agent off release-1"
expect_exit 0 recover
printed 'No unfinished cutover' || fail "a completed rollback left an unfinished state"
pass "rollback from a settled promotion returns to the previous release and leaves a settled state"

# A withheld smoke answer must not send the agent back to the release it left.
new_case rollback-smoke-withheld
expect_exit 0 promote
touch "$STATE/fail-smoke"
expect_exit 1 rollback
[[ "$(count_of 'railway variable set')" -eq 1 ]] \
  || fail "a failed smoke after rollback moved the agent again"
called 'python release-mark-rolled-back' || fail "a rollback with a failed smoke was not recorded"
agent_names CORPUS_RELEASE_ID=release-1 || fail "a failed smoke undid the rollback"
deployed CORPUS_RELEASE_ID=release-1 || fail "the rolled-back release is not the one deployed"
printed 'chat smoke did not pass' || fail "the failed smoke was not reported"
rm "$STATE/fail-smoke"
expect_exit 0 recover
printed 'No unfinished cutover' || fail "a rollback with a failed smoke left an unfinished state"
pass "rollback is judged by the deployment and /readyz; a failed smoke is reported and moves nothing"

new_case rollback-killed
expect_exit 0 promote
touch "$STATE/python-kill-release-mark-rolled-back"
expect_exit 137 rollback
rm "$STATE/python-kill-release-mark-rolled-back"
agent_names CORPUS_RELEASE_ID=release-1 || fail "the killed rollback had not switched the agent"
[[ "$(manifest_field release-2 .promotionState)" == promoted ]] \
  || fail "the killed rollback recorded a result"
expect_exit 1 promote REQUESTED_CORPUS_RELEASE_ID=release-3
assert_restored_release_1 "the run after a killed rollback"
assert_nothing_built "the run after a killed rollback"
pass "a rollback killed after its switch is completed by the next run before anything is reset"

# The variables name one release and the running deployment serves another:
# rollback switched to release-1, it never became ready, and the restore set
# the variables back to release-2 but its redeploy failed every time.
leave_variables_ahead_of_deployment() {
  new_case "$1"
  expect_exit 0 promote
  echo 1 > "$STATE/agent-redeploys-left"
  echo release-1 > "$STATE/readyz-never-ready"
  expect_exit 1 rollback
  rm "$STATE/agent-redeploys-left" "$STATE/readyz-never-ready"
  agent_names CORPUS_RELEASE_ID=release-2 || fail "the scenario did not leave the variables on release-2"
  deployed CORPUS_RELEASE_ID=release-1 || fail "the scenario did not leave release-1 deployed"
  [[ "$(manifest_field release-2 .promotionState)" == promoted \
    && -z "$(manifest_field release-2 .supersededByReleaseId)" ]] \
    || fail "the scenario did not leave release-2 looking settled"
}

leave_variables_ahead_of_deployment variables-ahead
for action in promote cleanup rollback; do
  echo "{\"manifestPath\": \"$DATA/pipeline/releases/release-1.json\", \"releaseId\": \"release-1\"}" \
    > "$STATE/cleanup-candidate"
  expect_exit 1 "$action" REQUESTED_CORPUS_RELEASE_ID=release-3
  printed 'the variables and the running deployment disagree' \
    || fail "$action did not say the variables and the deployment disagree"
  assert_nothing_built "$action with variables ahead of the deployment"
  ! called 'railway variable set' || fail "$action changed the agent with variables ahead of the deployment"
  ! called 'python release-cleanup-candidate' || fail "$action looked for a graph to stop"
done
expect_exit 1 bootstrap BOOTSTRAP_TARGET_COLOR=blue BOOTSTRAP_RESET_CONFIRM=neo4j-blue \
  BOOTSTRAP_BASELINE_EVIDENCE="$DATA/pipeline/releases/legacy-baseline.json"
assert_nothing_built "bootstrap with variables ahead of the deployment"
pass "promote, cleanup, rollback and bootstrap refuse while the running agent serves another release than its variables name"

leave_variables_ahead_of_deployment variables-ahead-recover
echo 1 > "$STATE/python-exit-schema-version"
expect_exit 1 recover
! called 'railway redeploy' || fail "recover redeployed the agent onto a graph that does not answer"
printed "railway redeploy --service neo4j-green --yes" || fail "recover did not give the manual steps"
rm "$STATE/python-exit-schema-version"
expect_exit 0 recover
before 'python schema-version' 'railway redeploy .*--service @nc-medicaid/agent' \
  || fail "recover redeployed the agent before checking its graph"
deployed CORPUS_RELEASE_ID=release-2 || fail "recover did not bring the deployment to release-2"
agent_names CORPUS_RELEASE_ID=release-2 || fail "recover changed which release the variables name"
assert_nothing_built "recover with variables ahead of the deployment"
expect_exit 0 recover
printed 'No unfinished cutover' || fail "the state was not settled after recover"
pass "recover redeploys the agent onto the release its variables name, once that graph answers"

# Recovery must not switch the agent onto a previous graph that does not answer.
leave_cutover_unfinished restore-target-down
echo 1 > "$STATE/python-exit-schema-version"
expect_exit 1 recover
! called 'railway variable set' || fail "recover switched the agent to a graph that is not ready"
! called 'railway redeploy' || fail "recover redeployed the agent toward a graph that is not ready"
called 'python release-event .*--type cutover_restore_failed' \
  || fail "a restore refused for an unready graph was not recorded"
agent_names CORPUS_RELEASE_ID=release-2 || fail "the agent target was changed"
printed 'neo4j-blue is not ready' || fail "recover did not name the graph that is not ready"
rm "$STATE/python-exit-schema-version"
expect_exit 0 recover
assert_restored_release_1 "recover once the previous graph answers"
pass "recovery leaves the agent alone until the previous graph answers"

new_case job-password-differs
expect_exit 64 promote NEO4J_BLUE_PASSWORD=another-password
printed "password for neo4j-blue is not the agent's NEO4J_PASSWORD" \
  || fail "promote did not report the differing password"
! grep -q 'another-password\|blue-password' "$TEMP_ROOT/$CASE/output" \
  || fail "promote printed a password"
assert_nothing_built "promote with a differing serving-graph password"
pass "promote refuses, without printing either value, when the job's serving-graph password is not the agent's"

for action in recover cleanup rollback; do
  leave_cutover_unfinished "no-agent-url-$action"
  expect_exit 64 "$action" AGENT_PUBLIC_URL=
  printed 'AGENT_PUBLIC_URL is required' || fail "$action did not name the missing variable"
  ! called 'railway variable set' || fail "$action switched the agent without AGENT_PUBLIC_URL"
  ! called 'python' || fail "$action recorded a recovery it could not finish"
done
pass "recover, cleanup and rollback stop before any switch when AGENT_PUBLIC_URL is missing"

# A bootstrap onto the color an unfinished cutover must be restored to.
leave_cutover_unfinished bootstrap-fenced
expect_exit 1 bootstrap BOOTSTRAP_TARGET_COLOR=blue BOOTSTRAP_RESET_CONFIRM=neo4j-blue \
  BOOTSTRAP_BASELINE_EVIDENCE="$DATA/pipeline/releases/legacy-baseline.json"
assert_restored_release_1 "bootstrap"
assert_nothing_built "bootstrap after an unfinished cutover"
pass "bootstrap restores an unfinished cutover instead of resetting the graph it needs"

new_case bootstrap-legacy-agent
printf '%s\n' CORPUS_RELEASE_ID=legacy-20260725 NEO4J_URI=bolt://legacy \
  NEO4J_PASSWORD=legacy-password > "$STATE/agent.env"
expect_exit 0 bootstrap BOOTSTRAP_TARGET_COLOR=blue BOOTSTRAP_RESET_CONFIRM=neo4j-blue \
  BOOTSTRAP_BASELINE_EVIDENCE="$DATA/pipeline/releases/legacy-baseline.json" AGENT_PUBLIC_URL=
called 'python release-build-graph' || fail "bootstrap beside a legacy agent did not build"
! called 'curl' || fail "bootstrap beside a legacy agent probed the agent"
pass "bootstrap beside a legacy agent, which has no color, is not fenced"

new_case first-release-unpromoted
write_manifest release-1 blue validated
expect_exit 1 promote
printed 'Rerun the same release-activate-bootstrap command' \
  || fail "promote did not point an unpromoted first release at bootstrap activation"
! called 'railway variable set' || fail "promote changed the agent for an unpromoted first release"
assert_nothing_built "promote on an unpromoted first release"
pass "an unpromoted first release is refused with the bootstrap activation step"

new_case label-disagrees
agent_serves release-1 green
expect_exit 1 promote
printed 'correct the agent variables by hand' || fail "promote did not explain the color mismatch"
! called 'railway variable set' || fail "promote changed the agent on a color mismatch"
assert_nothing_built "promote on a color mismatch"
printf '%s\n' ACTIVE_CORPUS_COLOR=blue CORPUS_RELEASE_ID=release-1 \
  NEO4J_URI=bolt://green NEO4J_PASSWORD=green-password > "$STATE/agent.env"
cp "$STATE/agent.env" "$STATE/deployed.env"
expect_exit 1 promote
printed 'Agent NEO4J_URI is not the blue graph' || fail "promote did not explain the URI mismatch"
assert_nothing_built "promote on a URI mismatch"
pass "promote refuses when the agent's color or URI disagrees with the serving manifest"

new_case serving-manifest-missing
rm "$DATA/pipeline/releases/release-1.json"
expect_exit 1 promote
printed 'manifest of serving release release-1 is unavailable' \
  || fail "promote did not say the serving manifest was missing"
assert_nothing_built "promote without the serving manifest"
pass "promote refuses when the serving release's manifest cannot be read"

new_case reset-deferred
echo 20 > "$STATE/python-exit-release-retention-check"
expect_exit 20 promote
assert_nothing_built "a deferred promote"
! called 'railway variable set' || fail "a deferred promote changed the agent target"
pass "promote exits 20 without touching anything while the target is inside its rollback window"

printf '1..%s\n' "$TESTS"
