#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/scripts/ops/lib.sh"
source "$REPO_ROOT/scripts/ops/object-storage-lib.sh"

ACTION="${1:-}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT:-production}"
AGENT_SERVICE="${RAILWAY_AGENT_SERVICE:-@nc-medicaid/agent}"
PIPELINE_DIR="$REPO_ROOT/packages/pipeline"
PY="${PIPELINE_PYTHON:-$PIPELINE_DIR/.venv/bin/python}"
DATA_ROOT="${CORPUS_DATA_ROOT:-$REPO_ROOT/packages}"
if [[ -n "${CORPUS_DATA_ROOT:-}" ]]; then
  RELEASES_DIR="$CORPUS_DATA_ROOT/pipeline/releases"
else
  RELEASES_DIR="$PIPELINE_DIR/data/releases"
fi
mkdir -p "$RELEASES_DIR"

validate_runtime() {
  : "${SYNTHETIC_USER_EMAIL:?Fresh synthetic account email is required}"
  : "${SYNTHETIC_USER_PASSWORD:?Fresh synthetic account password is required}"
  : "${WORKOS_CLIENT_ID:?WORKOS_CLIENT_ID is required}"
  : "${WORKOS_API_KEY:?WORKOS_API_KEY is required}"
  local tool
  for tool in railway curl jq rclone; do
    require_tool "$tool"
  done
  [[ -x "$PY" ]] || {
    echo "Pipeline Python does not exist: $PY" >&2
    return 69
  }
}

agent_variables() {
  railway_cli variables \
    --environment "$ENVIRONMENT" \
    --service "$AGENT_SERVICE" \
    --kv
}

variable_from() {
  local payload="$1"
  local key="$2"
  awk -v key="$key" '
    index($0, key "=") == 1 {
      print substr($0, length(key) + 2)
      exit
    }
  ' <<<"$payload"
}

color_uri() {
  local color="$1"
  local key="NEO4J_${color^^}_URI"
  local value="${!key:-}"
  [[ -n "$value" ]] || {
    echo "Missing required environment variable: $key" >&2
    return 1
  }
  printf '%s' "$value"
}

color_password() {
  local color="$1"
  local key="NEO4J_${color^^}_PASSWORD"
  local value="${!key:-${NEO4J_PASSWORD:-}}"
  [[ -n "$value" ]] || {
    echo "Missing $key (or shared NEO4J_PASSWORD)" >&2
    return 1
  }
  printf '%s' "$value"
}

download_manifest() {
  local release_id="$1"
  local destination="$2"
  [[ -f "$destination" ]] && return 0
  configure_release_remote
  mkdir -p "$(dirname "$destination")"
  rclone copyto \
    "$(release_object_path "releases/$release_id/manifest.json")" \
    "$destination"
}

set_agent_target() {
  local uri="$1"
  local password="$2"
  local release_id="$3"
  local color="$4"
  railway_cli variable set \
    --skip-deploys \
    --environment "$ENVIRONMENT" \
    --service "$AGENT_SERVICE" \
    "NEO4J_URI=$uri" \
    "NEO4J_PASSWORD=$password" \
    "CORPUS_RELEASE_ID=$release_id" \
    "ACTIVE_CORPUS_COLOR=$color" || return
  local response deployment_id
  response="$(railway_cli redeploy \
    --environment "$ENVIRONMENT" \
    --service "$AGENT_SERVICE" \
    --yes --json)" || return
  deployment_id="$(jq -er '.id' <<<"$response")" || return
  wait_for_railway_deployment "$AGENT_SERVICE" "$deployment_id"
}

wait_for_agent_release() {
  local release_id="$1"
  local attempts="${2:-30}"
  local ready_url="${AGENT_PUBLIC_URL:?AGENT_PUBLIC_URL is required}/readyz"
  local attempt ready
  for attempt in $(seq 1 "$attempts"); do
    if ready="$(curl --fail --silent --show-error --max-time 20 "$ready_url")" \
      && jq -e --arg release "$release_id" '.status == "ok" and .releaseId == $release' <<<"$ready" >/dev/null; then
      return 0
    fi
    [[ "$attempt" -lt "$attempts" ]] || { echo "Expected release never became ready" >&2; return 1; }
    sleep 10
  done
}

verify_agent_release() {
  local release_id="$1"
  wait_for_agent_release "$release_id" || return
  "$REPO_ROOT/scripts/ops/authenticated-release-smoke.sh" "$release_id"
}

# A restore is judged by the deployment and the graph-backed /readyz release
# id. The chat smoke can withhold an answer on a healthy target, and a restore
# must not be recorded as failed because of it.
restore_agent_target_with_retry() {
  local uri="$1"
  local password="$2"
  local release_id="$3"
  local color="$4"
  local attempts="${CUTOVER_RESTORE_ATTEMPTS:-3}"
  local attempt
  [[ "$attempts" =~ ^[1-9]$ ]] || {
    echo "CUTOVER_RESTORE_ATTEMPTS must be an integer from 1 to 9" >&2
    return 64
  }

  for attempt in $(seq 1 "$attempts"); do
    if set_agent_target "$uri" "$password" "$release_id" "$color" \
      && wait_for_agent_release "$release_id"; then
      return 0
    fi
    echo "Previous target restoration attempt $attempt/$attempts failed" >&2
    [[ "$attempt" -eq "$attempts" ]] || sleep 10
  done
  return 1
}

# Put the agent back on the previous release and record the abandoned one as
# rolled back. Everything is derived from the two manifests, so a later run can
# call this for a cutover it did not start.
recover_failed_cutover() {
  local manifest="$1"
  local previous_manifest="$2"
  local reason="$3"
  local release_id previous_release previous_color target_color
  local previous_uri previous_password target_uri target_password
  local repair_failed=0

  release_id="$(jq -er '.releaseId' "$manifest")" || return 1
  target_color="$(jq -er '.targetColor' "$manifest")" || return 1
  previous_release="$(jq -er '.releaseId' "$previous_manifest")" || return 1
  previous_color="$(jq -er '.targetColor' "$previous_manifest")" || return 1
  [[ "$previous_color" != "$target_color" ]] || {
    echo "Releases $release_id and $previous_release name the same graph color; recover by hand" >&2
    return 1
  }
  previous_uri="$(color_uri "$previous_color")" || return 1
  previous_password="$(color_password "$previous_color")" || return 1
  target_uri="$(color_uri "$target_color")" || return 1
  target_password="$(color_password "$target_color")" || return 1

  if ! (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli release-mark-recovery-pending \
      --manifest "$manifest" \
      --previous-release-id "$previous_release" \
      --reason "$reason"
  ); then
    echo "Failed to record pending cutover recovery" >&2
    repair_failed=1
  fi
  "$REPO_ROOT/scripts/ops/upload-release-manifest.sh" \
    "$manifest" \
    "releases/$release_id/manifest.json" || repair_failed=1

  # Switching the agent to a graph that is stopped, or that refuses the job's
  # password for it, would turn the recovery into the outage. Leave the agent
  # where it is unless the previous graph answers.
  local previous_ready=1
  graph_is_ready "$previous_uri" "$previous_password" || {
    previous_ready=0
    echo "neo4j-$previous_color is not ready with the job's NEO4J_${previous_color^^}_URI and password;" \
      "the agent target was not changed. Start that graph, confirm its variables, then run CORPUS_JOB_MODE=recover" >&2
  }

  if [[ "$previous_ready" -eq 0 ]] || ! restore_agent_target_with_retry \
    "$previous_uri" \
    "$previous_password" \
    "$previous_release" \
    "$previous_color"; then
    (
      cd "$PIPELINE_DIR"
      "$PY" -m pipeline.cli release-event \
        --manifest "$manifest" \
        --type cutover_restore_failed \
        --details '{"recoveryPending":true}'
    ) || true
    "$REPO_ROOT/scripts/ops/upload-release-manifest.sh" \
      "$manifest" \
      "releases/$release_id/manifest.json" || true
    return 1
  fi

  if ! (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli release-mark-cutover-restored \
      --current-manifest "$manifest" \
      --previous-manifest "$previous_manifest"
  ); then
    echo "Failed to record restored cutover metadata" >&2
    repair_failed=1
  fi
  if ! (
    cd "$PIPELINE_DIR"
    NEO4J_URI="$target_uri" \
    NEO4J_PASSWORD="$target_password" \
      "$PY" -m pipeline.cli release-mark-graph \
        --manifest "$manifest" \
        --state rolled_back
  ); then
    echo "Failed to mark the inactive graph rolled back" >&2
    repair_failed=1
  fi
  (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli release-event \
      --manifest "$manifest" \
      --type "$reason" \
      --details '{"agentTargetRestored":true}'
  ) || repair_failed=1
  "$REPO_ROOT/scripts/ops/upload-release-manifest.sh" \
    "$manifest" \
    "releases/$release_id/manifest.json" || repair_failed=1
  "$REPO_ROOT/scripts/ops/upload-release-manifest.sh" \
    "$previous_manifest" \
    "releases/$previous_release/manifest.json" || repair_failed=1
  return "$repair_failed"
}

# The record of a cutover is the manifest the agent names. Between
# release-mark-cutover-started and release-mark-promoted the agent can name a
# release that was never verified, and the previous release carries a rollback
# window for a switch that may not have happened. Sets CUTOVER_CANDIDATE and
# CUTOVER_PREVIOUS to the two manifests when the last cutover or rollback was
# left unfinished, leaves both empty when it is settled, and fails when the
# state cannot be recovered from the manifests.
#
# The variables are what the agent will serve after its next deploy, not what
# it serves now: `variable set --skip-deploys` can succeed and the redeploy
# fail. A settled record therefore also needs the running deployment to report
# that release on /readyz. When it does not, UNDEPLOYED_RELEASE names the
# release the variables point at and the check fails; only `recover` repairs it.
CUTOVER_CANDIDATE=""
CUTOVER_PREVIOUS=""
UNDEPLOYED_RELEASE=""
UNDEPLOYED_COLOR=""
UNDEPLOYED_URI=""
UNDEPLOYED_PASSWORD=""

inspect_cutover() {
  local variables release color uri serving state previous superseder
  CUTOVER_CANDIDATE=""
  CUTOVER_PREVIOUS=""
  UNDEPLOYED_RELEASE=""
  # Every path from here may have to restore the agent and wait for it.
  [[ -n "${AGENT_PUBLIC_URL:-}" ]] || {
    echo "AGENT_PUBLIC_URL is required" >&2
    return 64
  }
  variables="$(agent_variables)" || return 1
  release="$(variable_from "$variables" CORPUS_RELEASE_ID)"
  color="$(variable_from "$variables" ACTIVE_CORPUS_COLOR)"
  uri="$(variable_from "$variables" NEO4J_URI)"
  [[ "$color" == "blue" || "$color" == "green" ]] || {
    echo "Agent ACTIVE_CORPUS_COLOR must be blue or green" >&2
    return 64
  }
  [[ -n "$release" ]] || {
    echo "Agent CORPUS_RELEASE_ID is missing" >&2
    return 64
  }
  serving="$RELEASES_DIR/$release.json"
  download_manifest "$release" "$serving" || {
    echo "The manifest of serving release $release is unavailable; nothing may be reset or stopped" >&2
    return 1
  }
  state="$(jq -r '.promotionState // empty' "$serving")" || return 1

  if [[ "$state" != "promoted" ]]; then
    # The agent was switched to a release that was never marked promoted.
    previous="$(jq -r '.previousReleaseId // empty' "$serving")" || return 1
    [[ -n "$previous" ]] || {
      echo "The agent names first release $release, which is $state, not promoted." \
        "Rerun the same release-activate-bootstrap command: it restores or completes the activation." >&2
      return 1
    }
    CUTOVER_CANDIDATE="$serving"
    CUTOVER_PREVIOUS="$RELEASES_DIR/$previous.json"
    download_manifest "$previous" "$CUTOVER_PREVIOUS" || {
      echo "The manifest of previous release $previous is unavailable; recover by hand" >&2
      return 1
    }
    return 0
  fi

  superseder="$(jq -r '.supersededByReleaseId // empty' "$serving")" || return 1
  if [[ -n "$superseder" ]]; then
    # The serving release is stamped as replaced: a cutover that never switched
    # the agent, or a switch back to it that was never recorded.
    CUTOVER_PREVIOUS="$serving"
    CUTOVER_CANDIDATE="$RELEASES_DIR/$superseder.json"
    download_manifest "$superseder" "$CUTOVER_CANDIDATE" || {
      echo "The manifest of release $superseder is unavailable; recover by hand" >&2
      return 1
    }
    return 0
  fi

  [[ "$(jq -r '.targetColor // empty' "$serving")" == "$color" ]] || {
    echo "Agent ACTIVE_CORPUS_COLOR is $color, but serving release $release was built on" \
      "$(jq -r '.targetColor // "no color"' "$serving"); correct the agent variables by hand" >&2
    return 1
  }
  [[ "$uri" == "$(color_uri "$color")" ]] || {
    echo "Agent NEO4J_URI is not the $color graph named by ACTIVE_CORPUS_COLOR;" \
      "correct the agent variables by hand" >&2
    return 1
  }
  wait_for_agent_release "$release" 3 2>/dev/null || {
    UNDEPLOYED_RELEASE="$release"
    UNDEPLOYED_COLOR="$color"
    UNDEPLOYED_URI="$uri"
    UNDEPLOYED_PASSWORD="$(variable_from "$variables" NEO4J_PASSWORD)"
    echo "The agent's variables name release $release on $color, but the running deployment" \
      "does not report that release ready on /readyz: the variables and the running deployment" \
      "disagree. Nothing may be reset or stopped. Run CORPUS_JOB_MODE=recover to redeploy the" \
      "agent onto the release its variables name." >&2
    return 1
  }
}

# The agent's variables name a promoted release its running deployment does not
# serve. Redeploy the agent so the two agree, but only onto a graph that answers.
redeploy_agent_onto_its_variables() {
  graph_is_ready "$UNDEPLOYED_URI" "$UNDEPLOYED_PASSWORD" || {
    echo "neo4j-$UNDEPLOYED_COLOR does not answer with the agent's NEO4J_URI and NEO4J_PASSWORD," \
      "so the agent was not redeployed. By hand: (1) start it with" \
      "'railway redeploy --service neo4j-$UNDEPLOYED_COLOR --yes'; (2) check the agent's" \
      "NEO4J_PASSWORD is that graph's password; (3) run CORPUS_JOB_MODE=recover again." \
      "To serve another release instead, set the agent's NEO4J_URI, NEO4J_PASSWORD," \
      "CORPUS_RELEASE_ID and ACTIVE_CORPUS_COLOR together to that release's graph, then recover." >&2
    return 1
  }
  restore_agent_target_with_retry \
    "$UNDEPLOYED_URI" \
    "$UNDEPLOYED_PASSWORD" \
    "$UNDEPLOYED_RELEASE" \
    "$UNDEPLOYED_COLOR" || {
    echo "The agent could not be redeployed onto $UNDEPLOYED_RELEASE; nothing else was changed" >&2
    return 1
  }
  echo "Recovered: the agent was redeployed and now serves $UNDEPLOYED_RELEASE on $UNDEPLOYED_COLOR"
}

# promote, rollback and cleanup begin here: none of them may reset, stop or
# switch a graph while the last cutover is unfinished. An unfinished cutover is
# restored first and the run then ends non-zero.
require_settled_cutover() {
  inspect_cutover || exit $?
  [[ -n "$CUTOVER_CANDIDATE" ]] || return 0
  echo "The cutover to $(jq -r '.releaseId' "$CUTOVER_CANDIDATE") was left unfinished;" \
    "restoring $(jq -r '.releaseId' "$CUTOVER_PREVIOUS") before anything else" >&2
  recover_failed_cutover \
    "$CUTOVER_CANDIDATE" \
    "$CUTOVER_PREVIOUS" \
    interrupted_cutover_recovered || {
    echo "The unfinished cutover could not be fully recovered; run CORPUS_JOB_MODE=recover" >&2
    exit 1
  }
  echo "The unfinished cutover was recovered; this run stops here and the next one starts clean" >&2
  exit 1
}

recover() {
  local status=0
  inspect_cutover || status=$?
  if [[ "$status" -ne 0 ]]; then
    [[ -n "$UNDEPLOYED_RELEASE" ]] || exit "$status"
    redeploy_agent_onto_its_variables || exit 1
    return 0
  fi
  if [[ -z "$CUTOVER_CANDIDATE" ]]; then
    echo "No unfinished cutover: the agent serves a promoted release on its recorded graph"
    return 0
  fi
  recover_failed_cutover \
    "$CUTOVER_CANDIDATE" \
    "$CUTOVER_PREVIOUS" \
    interrupted_cutover_recovered || {
    echo "Recovery is incomplete; the manifest of the abandoned release says what was recorded" >&2
    exit 1
  }
  echo "Recovered: $(jq -r '.releaseId' "$CUTOVER_PREVIOUS") is serving and" \
    "$(jq -r '.releaseId' "$CUTOVER_CANDIDATE") is recorded as rolled back"
}

graph_is_ready() {
  local uri="$1"
  local password="$2"
  (
    cd "$PIPELINE_DIR"
    NEO4J_URI="$uri" \
    NEO4J_PASSWORD="$password" \
    "$PY" -m pipeline.cli schema-version >/dev/null 2>&1
  )
}

wait_for_graph() {
  local uri="$1"
  local password="$2"
  local attempt
  for attempt in $(seq 1 30); do
    if graph_is_ready "$uri" "$password"; then
      return 0
    fi
    sleep 10
  done
  echo "Neo4j did not become ready at $uri" >&2
  return 1
}

wait_for_railway_deployment() {
  local service="$1"
  local deployment_id="$2"
  local attempts="${RAILWAY_DEPLOYMENT_WAIT_ATTEMPTS:-120}"
  local interval="${RAILWAY_DEPLOYMENT_WAIT_INTERVAL_SECONDS:-5}"
  local attempt deployments status

  [[ "$attempts" =~ ^[1-9][0-9]*$ ]] || {
    echo "RAILWAY_DEPLOYMENT_WAIT_ATTEMPTS must be a positive integer" >&2
    return 64
  }
  [[ "$interval" =~ ^[1-9][0-9]*$ ]] || {
    echo "RAILWAY_DEPLOYMENT_WAIT_INTERVAL_SECONDS must be a positive integer" >&2
    return 64
  }

  for attempt in $(seq 1 "$attempts"); do
    deployments="$(railway_cli deployment list \
      --environment "$ENVIRONMENT" \
      --service "$service" \
      --limit 20 \
      --json)" || return
    status="$(jq -r --arg id "$deployment_id" \
      '.[] | select(.id == $id) | .status' <<<"$deployments")" || return
    case "$status" in
      SUCCESS|SLEEPING) return 0 ;;
      FAILED | CRASHED | REMOVED | REMOVING)
        echo "Railway deployment $deployment_id for $service ended as $status" >&2
        return 1
        ;;
    esac
    sleep "$interval"
  done

  echo "Railway deployment $deployment_id for $service did not become ready" >&2
  return 1
}

redeploy_graph() {
  local service="$1"
  local uri="$2"
  local password="$3"
  local response deployment_id

  response="$(railway_cli redeploy \
    --environment "$ENVIRONMENT" \
    --service "$service" \
    --yes \
    --json)" || return
  deployment_id="$(jq -er '.id' <<<"$response")" || return
  wait_for_railway_deployment "$service" "$deployment_id" || return
  wait_for_graph "$uri" "$password"
}

# A release that ends before the agent switch leaves nothing to serve from its
# target graph. promote() names the service here once it has started it, and
# clears the name when the cutover begins; from then on the graph may be the
# one serving, and stopping it belongs to recovery and cleanup.
UNSWITCHED_TARGET_SERVICE=""

stop_unswitched_target() {
  [[ -n "$UNSWITCHED_TARGET_SERVICE" ]] || return 0
  echo "Release ended before the agent switch; stopping $UNSWITCHED_TARGET_SERVICE" >&2
  railway_cli down \
    --environment "$ENVIRONMENT" \
    --service "$UNSWITCHED_TARGET_SERVICE" \
    --yes
}

bootstrap() {
  local variables current_uri target_color expected_confirmation
  local target_service target_uri target_password release_id manifest
  local preflight_args validate_args
  : "${BOOTSTRAP_BASELINE_EVIDENCE:?A fresh comparable legacy baseline is required}"

  target_color="${BOOTSTRAP_TARGET_COLOR:-}"
  [[ "$target_color" == "blue" || "$target_color" == "green" ]] || {
    echo "BOOTSTRAP_TARGET_COLOR must be blue or green" >&2
    exit 64
  }
  target_service="neo4j-$target_color"
  expected_confirmation="$target_service"
  [[ "${BOOTSTRAP_RESET_CONFIRM:-}" == "$expected_confirmation" ]] || {
    echo "BOOTSTRAP_RESET_CONFIRM must equal $expected_confirmation" >&2
    exit 64
  }

  target_uri="$(color_uri "$target_color")"
  target_password="$(color_password "$target_color")"
  variables="$(agent_variables)"
  current_uri="$(variable_from "$variables" NEO4J_URI)"
  [[ -n "$current_uri" ]] || {
    echo "Agent NEO4J_URI is missing" >&2
    exit 64
  }
  [[ "$current_uri" != "$target_uri" ]] || {
    echo "Refusing to bootstrap the graph currently serving the agent" >&2
    exit 64
  }
  # Once the agent serves a blue or green release, a bootstrap resets the other
  # color: the one an unfinished cutover would be restored to. A legacy agent
  # has no color and no cutover to check.
  case "$(variable_from "$variables" ACTIVE_CORPUS_COLOR)" in
    blue | green) require_settled_cutover ;;
  esac

  (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli release-retention-check \
      --releases-dir "$RELEASES_DIR" \
      --target-color "$target_color"
  )

  : "${RAILWAY_GIT_COMMIT_SHA:?RAILWAY_GIT_COMMIT_SHA is required}"
  release_id="${REQUESTED_CORPUS_RELEASE_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${RAILWAY_GIT_COMMIT_SHA:0:7}}"
  manifest="$RELEASES_DIR/$release_id.json"

  # Parse, then check every input that needs no graph, before the target is
  # restarted, reset and re-embedded.
  preflight_args=(
    --manifest "$manifest"
    --releases-dir "$RELEASES_DIR"
    --baseline-evidence "$BOOTSTRAP_BASELINE_EVIDENCE"
  )
  validate_args=(
    --manifest "$manifest"
    --baseline-evidence "$BOOTSTRAP_BASELINE_EVIDENCE"
  )
  # Bootstrap is always operator-invoked, so it may carry a gate override as an
  # operator-invoked release does. Each entry is bound to one source snapshot;
  # the preflight refuses a file written for any other before the graph is reset.
  if [[ -n "${RELEASE_OVERRIDE_FILE:-}" ]]; then
    preflight_args+=(--override-file "$RELEASE_OVERRIDE_FILE")
    validate_args+=(--override-file "$RELEASE_OVERRIDE_FILE")
  fi
  if [[ -n "${RELEASE_RETRY_REJECTED:-}" ]]; then
    preflight_args+=(--retry-rejected "$RELEASE_RETRY_REJECTED")
  fi
  (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli release-prepare \
      --release-id "$release_id" \
      --commit-sha "$RAILWAY_GIT_COMMIT_SHA" \
      --target-color "$target_color" \
      --output "$manifest"
    "$PY" -m pipeline.cli release-preflight "${preflight_args[@]}"
  )

  redeploy_graph "$target_service" "$target_uri" "$target_password"

  (
    cd "$PIPELINE_DIR"
    NEO4J_URI="$target_uri" \
    NEO4J_PASSWORD="$target_password" \
    MASTRA_OBSERVABILITY_PATH=":memory:" \
      "$PY" -m pipeline.cli release-build-graph --manifest "$manifest"
    NEO4J_URI="$target_uri" \
    NEO4J_PASSWORD="$target_password" \
    MASTRA_OBSERVABILITY_PATH=":memory:" \
      "$PY" -m pipeline.cli release-validate "${validate_args[@]}"
    NEO4J_URI="$target_uri" \
    NEO4J_PASSWORD="$target_password" \
      "$PY" -m pipeline.cli release-mark-graph \
        --manifest "$manifest" \
        --state validated
  )

  "$REPO_ROOT/scripts/ops/sync-corpus-artifacts.sh" "$release_id" "$manifest"
  echo "Bootstrap release validated: $release_id on $target_service"
  echo "The agent target was not changed"
}

promote() {
  local variables active_color current_release current_uri current_password
  local inactive_color
  local target_service target_uri target_password release_id manifest
  local previous_manifest=""
  local prepare_args validate_args preflight_args promoted_args

  # A gate override is an operator's decision about one source snapshot. Only
  # an operator-invoked release may carry one; any other run that finds the
  # variable set stops before it reads Railway or resets a graph.
  if [[ -n "${RELEASE_OVERRIDE_FILE:-}" && "${CORPUS_JOB_MODE:-scheduled}" != "release" ]]; then
    echo "RELEASE_OVERRIDE_FILE is honoured only with CORPUS_JOB_MODE=release; unset it" >&2
    exit 64
  fi

  require_settled_cutover

  variables="$(agent_variables)"
  active_color="$(variable_from "$variables" ACTIVE_CORPUS_COLOR)"
  current_release="$(variable_from "$variables" CORPUS_RELEASE_ID)"
  current_uri="$(variable_from "$variables" NEO4J_URI)"
  current_password="$(variable_from "$variables" NEO4J_PASSWORD)"
  [[ "$active_color" == "blue" || "$active_color" == "green" ]] || {
    echo "Agent ACTIVE_CORPUS_COLOR must be blue or green before promotion" >&2
    exit 64
  }
  [[ -n "$current_uri" ]] || {
    echo "Agent NEO4J_URI is missing" >&2
    exit 64
  }
  [[ -n "$current_release" && -n "$current_password" ]] || {
    echo "Agent CORPUS_RELEASE_ID and NEO4J_PASSWORD are required after bootstrap" >&2
    exit 64
  }

  if [[ "$active_color" == "blue" ]]; then
    inactive_color="green"
  else
    inactive_color="blue"
  fi
  target_service="neo4j-$inactive_color"
  target_uri="$(color_uri "$inactive_color")"
  target_password="$(color_password "$inactive_color")"
  [[ "$current_uri" != "$target_uri" ]] || {
    echo "Refusing to reset the graph currently serving the agent" >&2
    exit 64
  }
  # A failed cutover is restored with the job's credentials for the serving
  # color. Find out now, not then, that they are not the ones the agent uses.
  [[ "$(color_password "$active_color")" == "$current_password" ]] || {
    echo "The job's password for neo4j-$active_color is not the agent's NEO4J_PASSWORD;" \
      "a failed cutover could not be restored. Correct NEO4J_${active_color^^}_PASSWORD on the corpus job" >&2
    exit 64
  }

  # A release inside its rollback window on the target defers this run: the
  # check exits 20 and the corpus job carries on without a promotion.
  (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli release-retention-check \
      --releases-dir "$RELEASES_DIR" \
      --target-color "$inactive_color"
  )

  previous_manifest="$RELEASES_DIR/$current_release.json"
  download_manifest "$current_release" "$previous_manifest"

  : "${RAILWAY_GIT_COMMIT_SHA:?RAILWAY_GIT_COMMIT_SHA is required}"
  release_id="${REQUESTED_CORPUS_RELEASE_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${RAILWAY_GIT_COMMIT_SHA:0:7}}"
  manifest="$RELEASES_DIR/$release_id.json"

  # The cutover reads this only after the build and the evaluations are paid for.
  : "${AGENT_PUBLIC_URL:?AGENT_PUBLIC_URL is required}"

  prepare_args=(
    --release-id "$release_id"
    --commit-sha "${RAILWAY_GIT_COMMIT_SHA:?}"
    --target-color "$inactive_color"
    --output "$manifest"
  )
  validate_args=(--manifest "$manifest")
  preflight_args=(--manifest "$manifest" --releases-dir "$RELEASES_DIR")
  prepare_args+=(--previous-manifest "$previous_manifest")
  validate_args+=(--previous-manifest "$previous_manifest")
  preflight_args+=(--previous-manifest "$previous_manifest")
  if [[ -n "${RELEASE_OVERRIDE_FILE:-}" ]]; then
    validate_args+=(--override-file "$RELEASE_OVERRIDE_FILE")
    preflight_args+=(--override-file "$RELEASE_OVERRIDE_FILE")
  fi
  if [[ -n "${RELEASE_RETRY_REJECTED:-}" ]]; then
    preflight_args+=(--retry-rejected "$RELEASE_RETRY_REJECTED")
  fi

  # Parse, then check every input that needs no graph, before the target is
  # restarted, reset and re-embedded.
  (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli release-prepare "${prepare_args[@]}"
    "$PY" -m pipeline.cli release-preflight "${preflight_args[@]}"
  )

  UNSWITCHED_TARGET_SERVICE="$target_service"
  add_exit_hook stop_unswitched_target
  redeploy_graph "$target_service" "$target_uri" "$target_password"

  (
    cd "$PIPELINE_DIR"
    NEO4J_URI="$target_uri" \
    NEO4J_PASSWORD="$target_password" \
    MASTRA_OBSERVABILITY_PATH=":memory:" \
      "$PY" -m pipeline.cli release-build-graph --manifest "$manifest"
    NEO4J_URI="$target_uri" \
    NEO4J_PASSWORD="$target_password" \
    MASTRA_OBSERVABILITY_PATH=":memory:" \
      "$PY" -m pipeline.cli release-validate "${validate_args[@]}"
  )

  "$REPO_ROOT/scripts/ops/sync-corpus-artifacts.sh" "$release_id" "$manifest"

  # Record the cutover and the previous release's rollback window, and put
  # both manifests in the bucket, before the agent is touched. A run that dies
  # after this point leaves a state the next run recognises and restores.
  (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli release-mark-cutover-started \
      --manifest "$manifest" \
      --previous-manifest "$previous_manifest"
  )
  "$REPO_ROOT/scripts/ops/upload-release-manifest.sh" \
    "$manifest" \
    "releases/$release_id/manifest.json"
  "$REPO_ROOT/scripts/ops/upload-release-manifest.sh" \
    "$previous_manifest" \
    "releases/$current_release/manifest.json"

  UNSWITCHED_TARGET_SERVICE=""
  if ! set_agent_target \
      "$target_uri" \
      "$target_password" \
      "$release_id" \
      "$inactive_color"; then
    echo "Agent cutover failed; restoring $current_release on $active_color" >&2
    recover_failed_cutover \
      "$manifest" \
      "$previous_manifest" \
      cutover_command_failed || true
    exit 1
  fi
  if ! verify_agent_release "$release_id"; then
    echo "Release verification failed; restoring $current_release on $active_color" >&2
    recover_failed_cutover \
      "$manifest" \
      "$previous_manifest" \
      cutover_verification_failed || true
    exit 1
  fi

  promoted_args=(--manifest "$manifest")
  promoted_args+=(--previous-manifest "$previous_manifest")
  if ! (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli release-mark-promoted "${promoted_args[@]}" \
      && NEO4J_URI="$target_uri" \
        NEO4J_PASSWORD="$target_password" \
        "$PY" -m pipeline.cli release-mark-graph \
          --manifest "$manifest" \
          --state promoted
  ); then
    echo "Promotion metadata failed; restoring $current_release on $active_color" >&2
    recover_failed_cutover \
      "$manifest" \
      "$previous_manifest" \
      promotion_metadata_failed || true
    exit 1
  fi

  "$REPO_ROOT/scripts/ops/sync-corpus-artifacts.sh" "$release_id" "$manifest"
  "$REPO_ROOT/scripts/ops/upload-release-manifest.sh" \
    "$previous_manifest" \
    "releases/$current_release/manifest.json"

  echo "Promotion verified: $release_id on neo4j-$inactive_color"
  echo "neo4j-$active_color remains live for the rollback window"
}

rollback() {
  local variables current_release current_color current_uri current_password
  local current_manifest previous_release previous_manifest previous_color
  local previous_uri previous_password

  require_settled_cutover

  variables="$(agent_variables)"
  current_release="$(variable_from "$variables" CORPUS_RELEASE_ID)"
  current_color="$(variable_from "$variables" ACTIVE_CORPUS_COLOR)"
  current_uri="$(variable_from "$variables" NEO4J_URI)"
  current_password="$(variable_from "$variables" NEO4J_PASSWORD)"
  [[ -n "$current_release" ]] || {
    echo "Agent CORPUS_RELEASE_ID is missing" >&2
    exit 64
  }
  current_manifest="$RELEASES_DIR/$current_release.json"
  download_manifest "$current_release" "$current_manifest"
  previous_release="$(jq -er '.previousReleaseId' "$current_manifest")" || {
    echo "Release $current_release records no previous release to roll back to" >&2
    exit 64
  }
  previous_manifest="$RELEASES_DIR/$previous_release.json"
  download_manifest "$previous_release" "$previous_manifest"
  previous_color="$(jq -er '.targetColor' "$previous_manifest")"
  previous_uri="$(color_uri "$previous_color")"
  previous_password="$(color_password "$previous_color")"

  (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli release-check-rollback \
      --previous-manifest "$previous_manifest"
  )
  redeploy_graph \
    "neo4j-$previous_color" \
    "$previous_uri" \
    "$previous_password"

  set_agent_target \
    "$previous_uri" \
    "$previous_password" \
    "$previous_release" \
    "$previous_color"
  # A rollback leaves a release the operator judged bad for one that already
  # passed its smoke. It is judged like a restore, by the deployment and the
  # /readyz release id: one withheld smoke answer must not send the agent back.
  if ! wait_for_agent_release "$previous_release"; then
    echo "Rollback verification failed; restoring current target" >&2
    restore_agent_target_with_retry \
      "$current_uri" \
      "$current_password" \
      "$current_release" \
      "$current_color" \
      || echo "The current target was not restored; run CORPUS_JOB_MODE=recover" >&2
    exit 1
  fi

  (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli release-mark-rolled-back \
      --current-manifest "$current_manifest" \
      --previous-manifest "$previous_manifest"
  )
  "$REPO_ROOT/scripts/ops/upload-release-manifest.sh" \
    "$current_manifest" \
    "releases/$current_release/manifest.json"
  "$REPO_ROOT/scripts/ops/upload-release-manifest.sh" \
    "$previous_manifest" \
    "releases/$previous_release/manifest.json"
  echo "Rollback verified: $previous_release on neo4j-$previous_color"
  # The smoke still runs and still fails the run, but changes nothing.
  "$REPO_ROOT/scripts/ops/authenticated-release-smoke.sh" "$previous_release" || {
    echo "The rollback is recorded and $previous_release is serving, but its chat smoke did not pass;" \
      "check an answer by hand" >&2
    exit 1
  }
}

main() {
  validate_runtime
  case "$ACTION" in
    bootstrap) bootstrap ;;
    promote) promote ;;
    rollback) rollback ;;
    recover) recover ;;
    *)
      echo "Usage: $0 {bootstrap|promote|rollback|recover}" >&2
      exit 64
      ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main
fi
