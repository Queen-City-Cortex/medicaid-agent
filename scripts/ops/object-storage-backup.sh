#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/scripts/ops/object-storage-lib.sh"

: "${CORPUS_DATA_ROOT:?CORPUS_DATA_ROOT must be the corpus-job volume mount}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required}"
configure_release_remote

STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
TEMP_DIR="$(mktemp -d)"
ARCHIVE="$TEMP_DIR/corpus-$STAMP.tar.gz.age"
cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT

for required in \
  "$CORPUS_DATA_ROOT/crawler/crawler.db" \
  "$CORPUS_DATA_ROOT/crawler/documents" \
  "$CORPUS_DATA_ROOT/pipeline/parsed" \
  "$CORPUS_DATA_ROOT/pipeline/releases"; do
  [[ -e "$required" ]] || {
    echo "Refusing incomplete corpus backup; missing $required" >&2
    exit 66
  }
done

python3 "$REPO_ROOT/scripts/ops/snapshot-corpus-databases.py" \
  "$CORPUS_DATA_ROOT" "$TEMP_DIR/_sqlite_snapshots"
# Archive captured SQLite and label bytes under their original names; omit live files.
tar --exclude='*/section-labels/*.json' --exclude='section-labels-backup.json' --exclude='*.db' --exclude='*.db-wal' --exclude='*.db-shm' \
  --transform='s,^_sqlite_snapshots/,,' --transform='s,\.sqlite-snapshot$,,' \
  -C "$CORPUS_DATA_ROOT" -czf - crawler pipeline \
  -C "$TEMP_DIR" _sqlite_snapshots \
  | age -r "$BACKUP_AGE_RECIPIENT" -o "$ARCHIVE"

rclone copyto "$ARCHIVE" \
  "$(release_object_path "backups/corpus/$(basename "$ARCHIVE")")" \
  --checksum
rclone delete --min-age "${BACKUP_RETENTION_DAYS:-400}d" \
  "$(release_object_path 'backups/corpus')" || true

if [[ -n "${SECONDARY_RCLONE_TARGET:-}" ]]; then
  rclone copyto "$ARCHIVE" \
    "${SECONDARY_RCLONE_TARGET%/}/corpus/$(basename "$ARCHIVE")" \
    --checksum
fi
