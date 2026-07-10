#!/usr/bin/env bash
# Daily conditional-request check for changed policy documents (~10 min).
# ETag/If-Modified-Since only — downloads happen in the weekly crawl.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

HC_URL="${HC_URL_DAILY:-}"
LOG_FILE="$LOG_DIR/daily-check-$(date +%F).log"
exec > >(tee -a "$LOG_FILE") 2>&1
hc_trap
hc_start

# The weekly refresh subsumes the daily check; don't fight it for the
# crawler DB. Ping success with a note so the dead-man's switch stays green.
if is_locked refresh; then
  log "weekly refresh in progress — skipping daily check"
  hc_ok
  exit 0
fi

acquire_lock daily-check || exit 0

log "daily document check starting"
(cd "$REPO_ROOT/packages/crawler" && npx tsx src/index.ts check)
log "daily document check complete"
hc_ok
