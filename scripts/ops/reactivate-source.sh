#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${CORPUS_DATA_ROOT:?Existing corpus root required}"
[[ -f "$CORPUS_DATA_ROOT/crawler/crawler.db" ]] || exit 66
mkdir -p "$CORPUS_DATA_ROOT/.locks"
export CORPUS_OPERATOR_LOCK_HELD=1
exec flock -n "$CORPUS_DATA_ROOT/.locks/corpus-job.lock" \
  node "$REPO_ROOT/node_modules/tsx/dist/cli.mjs" \
  "$REPO_ROOT/packages/crawler/src/index.ts" reactivate-source "$@"
