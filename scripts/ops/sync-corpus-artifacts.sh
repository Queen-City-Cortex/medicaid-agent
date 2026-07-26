#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/scripts/ops/object-storage-lib.sh"

RELEASE_ID="${1:?release ID required}"
MANIFEST="${2:?release manifest path required}"
DATA_ROOT="${CORPUS_DATA_ROOT:-$REPO_ROOT/packages}"
PIPELINE_DATA="$(
  if [[ -n "${CORPUS_DATA_ROOT:-}" ]]; then
    printf '%s/pipeline' "$DATA_ROOT"
  else
    printf '%s/packages/pipeline/data' "$REPO_ROOT"
  fi
)"

configure_release_remote

[[ -f "$MANIFEST" ]] || {
  echo "Release manifest does not exist: $MANIFEST" >&2
  exit 66
}
"$REPO_ROOT/scripts/ops/sync-current-corpus.sh"

# The manifest and its audit/evaluation evidence are immutable by release ID.
"$REPO_ROOT/scripts/ops/upload-release-manifest.sh" \
  "$MANIFEST" \
  "releases/$RELEASE_ID/manifest.json"
if [[ -d "$PIPELINE_DATA/releases/$RELEASE_ID" ]]; then
  rclone copy "$PIPELINE_DATA/releases/$RELEASE_ID" \
    "$(release_object_path "releases/$RELEASE_ID/evidence")" \
    --checksum
fi
