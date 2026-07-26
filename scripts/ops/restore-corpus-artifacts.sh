#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/scripts/ops/object-storage-lib.sh"

: "${CORPUS_DATA_ROOT:?CORPUS_DATA_ROOT must be the corpus-job volume mount}"
configure_release_remote

mkdir -p \
  "$CORPUS_DATA_ROOT/crawler/documents" \
  "$CORPUS_DATA_ROOT/pipeline/parsed" \
  "$CORPUS_DATA_ROOT/pipeline/audits" \
  "$CORPUS_DATA_ROOT/pipeline/eval-results" \
  "$CORPUS_DATA_ROOT/pipeline/releases" \
  "$CORPUS_DATA_ROOT/pipeline/ecfr-cache"

copy_if_present() {
  local remote="$1"
  local destination="$2"
  if rclone lsf "$(release_object_path "$remote")" >/dev/null 2>&1; then
    rclone copy "$(release_object_path "$remote")" "$destination" \
      --checksum --transfers "${RCLONE_TRANSFERS:-8}"
  fi
}

copy_if_present corpus/current/crawler "$CORPUS_DATA_ROOT/crawler"
copy_if_present corpus/current/pipeline/parsed "$CORPUS_DATA_ROOT/pipeline/parsed"
copy_if_present corpus/current/pipeline/audits "$CORPUS_DATA_ROOT/pipeline/audits"
copy_if_present corpus/current/pipeline/eval-results "$CORPUS_DATA_ROOT/pipeline/eval-results"
copy_if_present corpus/current/pipeline/releases "$CORPUS_DATA_ROOT/pipeline/releases"
copy_if_present corpus/current/pipeline/ecfr-cache "$CORPUS_DATA_ROOT/pipeline/ecfr-cache"
