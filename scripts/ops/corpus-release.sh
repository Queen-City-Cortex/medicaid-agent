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
    "ACTIVE_CORPUS_COLOR=$color"
  railway_cli redeploy \
    --environment "$ENVIRONMENT" \
    --service "$AGENT_SERVICE" \
    --yes
}

verify_agent_release() {
  local release_id="$1"
  local ready_url="${AGENT_PUBLIC_URL:?AGENT_PUBLIC_URL is required}/readyz"
  curl --fail --silent --show-error \
    --retry 24 \
    --retry-all-errors \
    --retry-delay 10 \
    --max-time 20 \
    "$ready_url" \
    | jq -e --arg release "$release_id" \
        '.status == "ok" and .releaseId == $release' >/dev/null
  "$REPO_ROOT/scripts/ops/authenticated-release-smoke.sh" "$release_id"
}

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
      && verify_agent_release "$release_id"; then
      return 0
    fi
    echo "Previous target restoration attempt $attempt/$attempts failed" >&2
    [[ "$attempt" -eq "$attempts" ]] || sleep 10
  done
  return 1
}

recover_failed_cutover() {
  local manifest="$1"
  local previous_manifest="$2"
  local previous_uri="$3"
  local previous_password="$4"
  local previous_release="$5"
  local previous_color="$6"
  local target_uri="$7"
  local target_password="$8"
  local reason="$9"
  local release_id="${10}"
  local repair_failed=0

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

  if ! restore_agent_target_with_retry \
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
      SUCCESS) return 0 ;;
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

bootstrap() {
  local variables current_uri target_color expected_confirmation
  local target_service target_uri target_password release_id manifest

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

  (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli release-retention-check \
      --releases-dir "$RELEASES_DIR" \
      --target-color "$target_color"
  )

  : "${RAILWAY_GIT_COMMIT_SHA:?RAILWAY_GIT_COMMIT_SHA is required}"
  release_id="${REQUESTED_CORPUS_RELEASE_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${RAILWAY_GIT_COMMIT_SHA:0:7}}"
  manifest="$RELEASES_DIR/$release_id.json"

  redeploy_graph "$target_service" "$target_uri" "$target_password"

  (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli release-prepare \
      --release-id "$release_id" \
      --commit-sha "$RAILWAY_GIT_COMMIT_SHA" \
      --target-color "$target_color" \
      --output "$manifest"
    NEO4J_URI="$target_uri" \
    NEO4J_PASSWORD="$target_password" \
    MASTRA_OBSERVABILITY_PATH=":memory:" \
      "$PY" -m pipeline.cli release-build-graph --manifest "$manifest"
    NEO4J_URI="$target_uri" \
    NEO4J_PASSWORD="$target_password" \
    MASTRA_OBSERVABILITY_PATH=":memory:" \
      "$PY" -m pipeline.cli release-validate --manifest "$manifest"
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

  redeploy_graph "$target_service" "$target_uri" "$target_password"

  prepare_args=(
    --release-id "$release_id"
    --commit-sha "${RAILWAY_GIT_COMMIT_SHA:?}"
    --target-color "$inactive_color"
    --output "$manifest"
  )
  validate_args=(--manifest "$manifest")
  prepare_args+=(--previous-manifest "$previous_manifest")
  validate_args+=(--previous-manifest "$previous_manifest")
  if [[ -n "${RELEASE_OVERRIDE_FILE:-}" ]]; then
    validate_args+=(--override-file "$RELEASE_OVERRIDE_FILE")
  fi

  (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli release-prepare "${prepare_args[@]}"
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

  if ! set_agent_target \
      "$target_uri" \
      "$target_password" \
      "$release_id" \
      "$inactive_color"; then
    echo "Agent cutover failed; restoring $current_release on $active_color" >&2
    recover_failed_cutover \
      "$manifest" \
      "$previous_manifest" \
      "$current_uri" \
      "$current_password" \
      "$current_release" \
      "$active_color" \
      "$target_uri" \
      "$target_password" \
      cutover_command_failed \
      "$release_id" || true
    exit 1
  fi
  if ! verify_agent_release "$release_id"; then
    echo "Release verification failed; restoring $current_release on $active_color" >&2
    recover_failed_cutover \
      "$manifest" \
      "$previous_manifest" \
      "$current_uri" \
      "$current_password" \
      "$current_release" \
      "$active_color" \
      "$target_uri" \
      "$target_password" \
      cutover_verification_failed \
      "$release_id" || true
    exit 1
  fi

  promoted_args=(--manifest "$manifest")
  promoted_args+=(--previous-manifest "$previous_manifest")
  if ! (
    cd "$PIPELINE_DIR"
    "$PY" -m pipeline.cli release-mark-promoted "${promoted_args[@]}"
    NEO4J_URI="$target_uri" \
    NEO4J_PASSWORD="$target_password" \
      "$PY" -m pipeline.cli release-mark-graph \
        --manifest "$manifest" \
        --state promoted
  ); then
    echo "Promotion metadata failed; restoring $current_release on $active_color" >&2
    recover_failed_cutover \
      "$manifest" \
      "$previous_manifest" \
      "$current_uri" \
      "$current_password" \
      "$current_release" \
      "$active_color" \
      "$target_uri" \
      "$target_password" \
      promotion_metadata_failed \
      "$release_id" || true
    exit 1
  fi

  "$REPO_ROOT/scripts/ops/sync-corpus-artifacts.sh" "$release_id" "$manifest"
  "$REPO_ROOT/scripts/ops/upload-release-manifest.sh" \
    "$previous_manifest" \
    "releases/$current_release/manifest.json"

  echo "Promotion verified: $release_id on neo4j-$inactive_color"
  echo "neo4j-$active_color remains live for the 24-hour rollback window"
}

rollback() {
  local variables current_release current_color current_uri current_password
  local current_manifest previous_release previous_manifest previous_color
  local previous_uri previous_password

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
  previous_release="$(jq -er '.previousReleaseId' "$current_manifest")"
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
  if ! verify_agent_release "$previous_release"; then
    echo "Rollback verification failed; restoring current target" >&2
    set_agent_target \
      "$current_uri" \
      "$current_password" \
      "$current_release" \
      "$current_color"
    verify_agent_release "$current_release"
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
}

main() {
  validate_runtime
  case "$ACTION" in
    bootstrap) bootstrap ;;
    promote) promote ;;
    rollback) rollback ;;
    *)
      echo "Usage: $0 {bootstrap|promote|rollback}" >&2
      exit 64
      ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main
fi
