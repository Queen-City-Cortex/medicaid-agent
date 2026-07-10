#!/usr/bin/env bash
# Install (or reinstall) the launchd agents for the scheduled ops jobs:
# daily document check, weekly refresh, daily prod chat-store backup.
#
# Substitutes this checkout's path + $HOME into the plists, copies them to
# ~/Library/LaunchAgents, and (re)bootstraps them.
#
# Usage: scripts/ops/install-launchd.sh [--uninstall]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLIST_SRC="$REPO_ROOT/scripts/ops/launchd"
AGENT_DIR="$HOME/Library/LaunchAgents"
DOMAIN="gui/$(id -u)"
LABELS=(com.ncmedicaid.daily-check com.ncmedicaid.weekly-refresh com.ncmedicaid.backup-mastra)

mkdir -p "$AGENT_DIR" "$HOME/Library/Logs/nc-medicaid"

for label in "${LABELS[@]}"; do
  target="$AGENT_DIR/$label.plist"
  if launchctl print "$DOMAIN/$label" >/dev/null 2>&1; then
    launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
  fi
  if [[ "${1:-}" == "--uninstall" ]]; then
    rm -f "$target"
    echo "uninstalled $label"
    continue
  fi
  sed -e "s|__REPO_ROOT__|$REPO_ROOT|g" -e "s|__HOME__|$HOME|g" \
    "$PLIST_SRC/$label.plist" > "$target"
  launchctl bootstrap "$DOMAIN" "$target"
  echo "installed $label ($(launchctl print "$DOMAIN/$label" | grep -m1 'state =' | xargs))"
done

if [[ "${1:-}" != "--uninstall" ]]; then
  cat <<'EOF'

Next steps:
  1. Create three checks at https://healthchecks.io (daily-check: period 1d
     grace 12h; weekly-refresh: period 7d grace 24h; backup-mastra: period 1d
     grace 12h) and put their ping URLs in ~/.config/nc-medicaid/ops.env as
     HC_URL_DAILY / HC_URL_WEEKLY / HC_URL_MASTRA_BACKUP (+ HC_URL_BACKUP for
     the corpus backup).
  2. Kick a supervised first run:
       launchctl kickstart -k gui/$(id -u)/com.ncmedicaid.weekly-refresh
     and watch ~/Library/Logs/nc-medicaid/.
EOF
fi
