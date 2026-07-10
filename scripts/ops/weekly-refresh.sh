#!/usr/bin/env bash
# Weekly corpus refresh: crawl → pipeline → audit → eval gate → deploy to
# prod → verify → backup. Scheduled via launchd (Saturdays); safe to run
# manually any time.
#
# Design notes:
# - The eval gate BLOCKS the prod push on retrieval regression: prod keeps
#   last week's graph (healthy) and the failure alerts via healthchecks.
# - The change gate skips the destructive deploy when nothing changed: a
#   deploy-data run wipes prod and re-embeds everything against the Voyage
#   API — pointless spend and risk on a no-change week. FORCE_DEPLOY=1
#   overrides.
# - The Neo4j TCP proxy is deleted in an EXIT trap so a mid-run failure never
#   leaves bolt exposed publicly.
#
# Env: FORCE_DEPLOY=1 (deploy even without changes), SKIP_DEPLOY=1 (refresh
# local only, never touch prod).

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

HC_URL="${HC_URL_WEEKLY:-}"
LOG_FILE="$LOG_DIR/weekly-refresh-$(date +%F).log"
exec > >(tee -a "$LOG_FILE") 2>&1

acquire_lock refresh || exit 0
hc_trap
hc_start

require_docker
require_tool jq
require_tool rclone

PIPELINE_DIR="$REPO_ROOT/packages/pipeline"
CRAWLER_DIR="$REPO_ROOT/packages/crawler"
MANIFEST_FILE="$CACHE_DIR/last-deploy.manifest"
PY="$PIPELINE_DIR/.venv/bin/python"

log "weekly refresh starting"

# 1. Local infra (idempotent — creates the volume if missing).
(cd "$REPO_ROOT" && npm run dev:infra >/dev/null)

# 2. Full discovery crawl (~40 min). The crawler prints per-source stats;
#    keep them in the log for the freshness audit trail.
log "[1/7] crawling"
(cd "$CRAWLER_DIR" && npx tsx src/index.ts crawl)

# 3. Pipeline: parse changed PDFs, load, refs, amendments, embeddings, concepts.
log "[2/7] pipeline run-all"
(cd "$PIPELINE_DIR" && "$PY" -m pipeline.cli run-all)

# 4. Fresh corpus audit (also keeps latest-corpus-audit.* current in-repo).
log "[3/7] corpus audit"
(cd "$PIPELINE_DIR" && "$PY" -m pipeline.cli audit-corpus)

# 5. Eval gate — a retrieval regression aborts before prod is touched.
log "[4/7] eval gate"
"$REPO_ROOT/scripts/ops/eval-gate.sh"

# 6. Change gate: hash the parsed-artifact tree (names + sizes + mtimes).
#    Deploy only when it moved since the last successful deploy.
MANIFEST="$(cd "$PIPELINE_DIR/data/parsed" && find . -type f -name '*.json' -print0 | xargs -0 stat -f '%N %z %m' | sort | shasum -a 256 | cut -d' ' -f1)"
LAST_MANIFEST="$(cat "$MANIFEST_FILE" 2>/dev/null || echo none)"

if [[ "${SKIP_DEPLOY:-0}" == "1" ]]; then
  log "[5/7] SKIP_DEPLOY=1 — local refresh only"
elif [[ "$MANIFEST" == "$LAST_MANIFEST" && "${FORCE_DEPLOY:-0}" != "1" ]]; then
  log "[5/7] no corpus changes since last deploy — skipping prod push (FORCE_DEPLOY=1 to override)"
else
  log "[5/7] deploying data to production Neo4j"
  PROXY_HOST="$("$REPO_ROOT/scripts/ops/railway-tcp-proxy.sh" create)"
  # Delete the proxy no matter how the deploy ends (the delete subcommand
  # post-checks that zero proxies remain). Registered via the shared
  # exit-hook dispatcher so it composes with lock cleanup + the hc fail ping.
  add_exit_hook "'$REPO_ROOT/scripts/ops/railway-tcp-proxy.sh' delete"
  log "proxy up at $PROXY_HOST"
  (cd "$REPO_ROOT" && NEO4J_HOST="$PROXY_HOST" env -u RAILWAY_API_TOKEN npm run deploy-data -- --yes)

  log "[6/7] verifying production"
  curl -fsS -m 15 https://medicaid-agent-backend.up.railway.app/healthz | tee /dev/stderr | jq -e '.status == "ok"' >/dev/null
  (cd "$REPO_ROOT" && npm run smoke:prod)

  # Record the deployed manifest only after verification: a deploy that never
  # reached verified-good must be retried by the next run, not skipped by the
  # change gate.
  printf '%s\n' "$MANIFEST" > "$MANIFEST_FILE"
fi

# 7. Backup the (possibly refreshed) corpus.
log "[7/7] corpus backup"
"$REPO_ROOT/scripts/ops/backup-corpus.sh"

log "weekly refresh complete"
hc_ok
