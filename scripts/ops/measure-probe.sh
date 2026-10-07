#!/usr/bin/env bash
# What an operator must see in the maintenance container before starting a
# measurement (docs/operations/blue-green-corpus-releases.md). Reads only, and
# prints whether a secret is present, never its value.
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
echo "directory=$(pwd)"
echo "repository=$REPO_ROOT"
echo "measure_mode_lines=$(grep -c measure_candidate "$REPO_ROOT/scripts/ops/railway-corpus-job.sh")"
echo "commit=${RAILWAY_GIT_COMMIT_SHA:-unset}"
for key in VOYAGE_API_KEY NEO4J_BLUE_URI NEO4J_BLUE_PASSWORD NEO4J_GREEN_URI \
  NEO4J_GREEN_PASSWORD RAILWAY_TOKEN BUCKET ACCESS_KEY_ID SECRET_ACCESS_KEY; do
  if [[ -n "${!key:-}" ]]; then echo "secret $key=present"; else echo "secret $key=MISSING"; fi
done
for tool in flock setsid jq railway rclone node; do
  echo "tool $tool=$(command -v "$tool" || echo MISSING)"
done
# Stored settings a run started by hand would inherit.
for key in CORPUS_JOB_MODE CORPUS_DATA_ROOT BOOTSTRAP_TARGET_COLOR BOOTSTRAP_RESET_CONFIRM \
  MEASURE_SKIP_CRAWL MEASURE_REUSE_GRAPH REQUESTED_CORPUS_RELEASE_ID RELEASE_OVERRIDE_FILE \
  EVAL_IDENTITY_CATALOG JEV_SECTION_ROLES_ENABLED; do
  echo "setting $key=${!key:-unset}"
done
