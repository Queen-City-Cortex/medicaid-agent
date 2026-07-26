#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/scripts/ops/object-storage-lib.sh"

MANIFEST="${1:?manifest path required}"
OBJECT_KEY="${2:-releases/$(basename "$MANIFEST")}"
[[ -f "$MANIFEST" ]] || {
  echo "Manifest does not exist: $MANIFEST" >&2
  exit 66
}

configure_release_remote
rclone copyto "$MANIFEST" "$(release_object_path "$OBJECT_KEY")" \
  --checksum \
  --metadata
