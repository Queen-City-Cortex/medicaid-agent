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

remote_has_entries() {
  local remote="$1"
  local listing
  listing="$(rclone lsf "$(release_object_path "$remote")" \
    --max-depth 1 2>/dev/null || true)"
  [[ -n "$listing" ]]
}

copy_if_present() {
  local remote="$1"
  local destination="$2"
  if remote_has_entries "$remote"; then
    rclone copy "$(release_object_path "$remote")" "$destination" \
      --checksum --transfers "${RCLONE_TRANSFERS:-8}"
  fi
}

restore_current_layout() {
  copy_if_present corpus/current/crawler "$CORPUS_DATA_ROOT/crawler"
  copy_if_present corpus/current/pipeline/parsed "$CORPUS_DATA_ROOT/pipeline/parsed"
  copy_if_present corpus/current/pipeline/audits "$CORPUS_DATA_ROOT/pipeline/audits"
  copy_if_present corpus/current/pipeline/eval-results "$CORPUS_DATA_ROOT/pipeline/eval-results"
  copy_if_present corpus/current/pipeline/releases "$CORPUS_DATA_ROOT/pipeline/releases"
  copy_if_present corpus/current/pipeline/ecfr-cache "$CORPUS_DATA_ROOT/pipeline/ecfr-cache"
}

restore_legacy_layout() {
  local registry_snapshot
  registry_snapshot="$(
    rclone lsf "$(release_object_path 'crawler/registry')" \
      --files-only 2>/dev/null | sort | tail -n 1
  )"
  [[ -n "$registry_snapshot" ]] || {
    echo "No crawler registry snapshot exists in Railway Object Storage" >&2
    exit 66
  }

  echo "corpus/current is absent; restoring the legacy corpus layout"
  rclone copyto \
    "$(release_object_path "crawler/registry/$registry_snapshot")" \
    "$CORPUS_DATA_ROOT/crawler/crawler.db" \
    --checksum
  copy_if_present crawler/documents "$CORPUS_DATA_ROOT/crawler/documents"
  copy_if_present pipeline/parsed "$CORPUS_DATA_ROOT/pipeline/parsed"
  copy_if_present pipeline/audits "$CORPUS_DATA_ROOT/pipeline/audits"
  copy_if_present pipeline/eval-results "$CORPUS_DATA_ROOT/pipeline/eval-results"
  copy_if_present pipeline/releases "$CORPUS_DATA_ROOT/pipeline/releases"
  copy_if_present pipeline/ecfr-cache "$CORPUS_DATA_ROOT/pipeline/ecfr-cache"
}

if remote_has_entries corpus/current/crawler; then
  restore_current_layout
else
  restore_legacy_layout
fi

[[ -s "$CORPUS_DATA_ROOT/crawler/crawler.db" ]] || {
  echo "Restored corpus is missing crawler/crawler.db" >&2
  exit 66
}
for required in \
  "$CORPUS_DATA_ROOT/crawler/documents" \
  "$CORPUS_DATA_ROOT/pipeline/parsed"; do
  [[ -n "$(find "$required" -type f -print -quit)" ]] || {
    echo "Restored corpus directory is empty: $required" >&2
    exit 66
  }
done
