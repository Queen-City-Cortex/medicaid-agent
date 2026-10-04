#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/scripts/ops/object-storage-lib.sh"

DATA_ROOT="${CORPUS_DATA_ROOT:-$REPO_ROOT/packages}"
if [[ -n "${CORPUS_DATA_ROOT:-}" ]]; then
  CRAWLER_DATA="$DATA_ROOT/crawler"
  PIPELINE_DATA="$DATA_ROOT/pipeline"
else
  CRAWLER_DATA="$REPO_ROOT/packages/crawler/data"
  PIPELINE_DATA="$REPO_ROOT/packages/pipeline/data"
fi

configure_release_remote
[[ -f "$CRAWLER_DATA/crawler.db" ]] || {
  echo "Crawler registry does not exist: $CRAWLER_DATA/crawler.db" >&2
  exit 66
}
for required in "$CRAWLER_DATA/documents" "$CRAWLER_DATA/recovery-journal" "$PIPELINE_DATA/parsed"; do
  [[ -d "$required" ]] || {
    echo "Required corpus artifact directory does not exist: $required" >&2
    exit 66
  }
done

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
sqlite3 "$CRAWLER_DATA/crawler.db" ".backup '$TEMP_DIR/crawler.db'"
rclone copyto "$TEMP_DIR/crawler.db" \
  "$(release_object_path 'corpus/current/crawler/crawler.db')" \
  --checksum
rclone sync "$CRAWLER_DATA/documents" \
  "$(release_object_path 'corpus/current/crawler/documents')" \
  --checksum --transfers "${RCLONE_TRANSFERS:-8}"
rclone sync "$CRAWLER_DATA/recovery-journal" \
  "$(release_object_path 'corpus/current/crawler/recovery-journal')" \
  --checksum --transfers "${RCLONE_TRANSFERS:-8}"
rclone sync "$PIPELINE_DATA/parsed" \
  "$(release_object_path 'corpus/current/pipeline/parsed')" \
  --checksum --transfers "${RCLONE_TRANSFERS:-8}"

for directory in audits eval-results releases ecfr-cache source-retirement-evidence source-audit-evidence section-labels; do
  [[ -d "$PIPELINE_DATA/$directory" ]] || continue
  rclone sync "$PIPELINE_DATA/$directory" \
    "$(release_object_path "corpus/current/pipeline/$directory")" \
    --checksum --transfers "${RCLONE_TRANSFERS:-8}"
done
