#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Sourced for its settings and for the cutover check; it runs no action.
source "$REPO_ROOT/scripts/ops/corpus-release.sh"

VARIABLES="$(railway_cli variables \
  --environment "$ENVIRONMENT" \
  --service "$AGENT_SERVICE" \
  --kv)"
ACTIVE_COLOR="$(awk -F= '$1 == "ACTIVE_CORPUS_COLOR" {print substr($0, index($0, "=") + 1); exit}' <<<"$VARIABLES")"
CURRENT_RELEASE="$(awk -F= '$1 == "CORPUS_RELEASE_ID" {print substr($0, index($0, "=") + 1); exit}' <<<"$VARIABLES")"
[[ "$ACTIVE_COLOR" == "blue" || "$ACTIVE_COLOR" == "green" ]] || exit 0
[[ -n "$CURRENT_RELEASE" ]] || exit 0
# While the last cutover is unfinished the "inactive" color may be the one a
# restore needs: recover first, and stop nothing in this run.
require_settled_cutover
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
