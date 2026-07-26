#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/scripts/ops/lib.sh"

ENVIRONMENT="${RAILWAY_ENVIRONMENT:-production}"
AGENT_SERVICE="${RAILWAY_AGENT_SERVICE:-@nc-medicaid/agent}"
PIPELINE_DIR="$REPO_ROOT/packages/pipeline"
PY="${PIPELINE_PYTHON:-$PIPELINE_DIR/.venv/bin/python}"
if [[ -n "${CORPUS_DATA_ROOT:-}" ]]; then
  RELEASES_DIR="$CORPUS_DATA_ROOT/pipeline/releases"
else
  RELEASES_DIR="$PIPELINE_DIR/data/releases"
fi

VARIABLES="$(railway_cli variables \
  --environment "$ENVIRONMENT" \
  --service "$AGENT_SERVICE" \
  --kv)"
ACTIVE_COLOR="$(awk -F= '$1 == "ACTIVE_CORPUS_COLOR" {print substr($0, index($0, "=") + 1); exit}' <<<"$VARIABLES")"
CURRENT_RELEASE="$(awk -F= '$1 == "CORPUS_RELEASE_ID" {print substr($0, index($0, "=") + 1); exit}' <<<"$VARIABLES")"
[[ "$ACTIVE_COLOR" == "blue" || "$ACTIVE_COLOR" == "green" ]] || exit 0
[[ -n "$CURRENT_RELEASE" ]] || exit 0
if [[ "$ACTIVE_COLOR" == "blue" ]]; then
  INACTIVE_COLOR="green"
else
  INACTIVE_COLOR="blue"
fi

CANDIDATE="$(
  cd "$PIPELINE_DIR"
  "$PY" -m pipeline.cli release-cleanup-candidate \
    --releases-dir "$RELEASES_DIR" \
    --current-release-id "$CURRENT_RELEASE" \
    --inactive-color "$INACTIVE_COLOR"
)"
MANIFEST_PATH="$(jq -r '.manifestPath // empty' <<<"$CANDIDATE")"
[[ -n "$MANIFEST_PATH" ]] || exit 0

railway_cli down \
  --environment "$ENVIRONMENT" \
  --service "neo4j-$INACTIVE_COLOR" \
  --yes

(
  cd "$PIPELINE_DIR"
  "$PY" -m pipeline.cli release-mark-service-stopped \
    --manifest "$MANIFEST_PATH" \
    --service "neo4j-$INACTIVE_COLOR"
)
"$REPO_ROOT/scripts/ops/upload-release-manifest.sh" \
  "$MANIFEST_PATH" \
  "releases/$(jq -r '.releaseId' <<<"$CANDIDATE")/manifest.json"
