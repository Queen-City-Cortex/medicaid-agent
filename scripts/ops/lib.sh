#!/usr/bin/env bash
# Shared helpers for the ops scripts (backups, corpus jobs). Sourced, not run.
#
# Conventions:
# - Secrets/config live in ~/.config/nc-medicaid/ops.env (chmod 600), NOT in
#   the repo: BACKUP_REMOTE, BACKUP_BUCKET, HC_URL_* healthchecks ping URLs,
#   optional RAILWAY_TOKEN.
# - Every railway CLI call must strip the stale shell RAILWAY_API_TOKEN:
#   use the `railway_cli` wrapper below.
# - Logs go to ~/Library/Logs/nc-medicaid/<script>-<date>.log (launchd also
#   captures stdout/stderr there).

set -euo pipefail

OPS_ENV="${OPS_ENV:-$HOME/.config/nc-medicaid/ops.env}"
if [[ -f "$OPS_ENV" ]]; then
  # shellcheck disable=SC1090
  source "$OPS_ENV"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="$HOME/Library/Logs/nc-medicaid"
CACHE_DIR="$HOME/.cache/nc-medicaid"
mkdir -p "$LOG_DIR" "$CACHE_DIR"

# ── Logging ──────────────────────────────────────────────────────────────────

log() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*"; }

# ── Node runtime ─────────────────────────────────────────────────────────────
# launchd puts Homebrew first on PATH, and Homebrew's node moves to each new
# major, where native modules built for the pinned one (better-sqlite3) no
# longer load. OPS_NODE_BIN is the directory holding the pinned Node; set it
# in ops.env when it is not the default below. Where that directory has no
# node (the Railway image, CI) PATH is left alone and the node already on it
# is the one checked.
#
# The check runs when this file is sourced, before any script does work, and
# compares the major version with .nvmrc: the native-module ABI changes per
# major, and a patch-exact check would stop every laptop job each time the
# pin moves. It passes when there is no node on PATH (some scripts never run
# one) or no .nvmrc beside the scripts (the corpus image does not copy it; its
# Node comes from the pinned base image). Passing is silent, and the failure
# goes to stderr, because callers capture the stdout of scripts that source
# this file.

OPS_NODE_BIN="${OPS_NODE_BIN:-$HOME/.hermes/node/bin}"
if [[ -x "$OPS_NODE_BIN/node" ]]; then
  export PATH="$OPS_NODE_BIN:$PATH"
fi

require_pinned_node() {
  local pinned found
  [[ -f "$REPO_ROOT/.nvmrc" ]] || return 0
  command -v node >/dev/null 2>&1 || return 0
  pinned="$(tr -d '[:space:]' < "$REPO_ROOT/.nvmrc")"
  pinned="${pinned#v}"
  found="$(node --version 2>/dev/null || true)"
  found="${found#v}"
  if [[ "${found%%.*}" != "${pinned%%.*}" ]]; then
    log "node ${found:-(no version reported)} at $(command -v node) does not match .nvmrc ($pinned): Node ${pinned%%.*} is required. Install it and set OPS_NODE_BIN in $OPS_ENV to the directory that holds it (default \$HOME/.hermes/node/bin)." >&2
    return 1
  fi
}
require_pinned_node || exit 1

# ── healthchecks.io dead-man's-switch pings ─────────────────────────────────
# Each script sets HC_URL before using these (from an HC_URL_* in ops.env).
# All pings are best-effort: a healthchecks outage must never fail a backup.

hc_start() { [[ -n "${HC_URL:-}" ]] && curl -fsS -m 10 --retry 3 "$HC_URL/start" >/dev/null || true; }
hc_ok()    { [[ -n "${HC_URL:-}" ]] && curl -fsS -m 10 --retry 3 "$HC_URL" >/dev/null || true; }
hc_fail()  {
  # Attach the tail of the current log (if any) so the alert email carries
  # the failure context.
  [[ -n "${HC_URL:-}" ]] || return 0
  local body=""
  [[ -n "${LOG_FILE:-}" && -f "$LOG_FILE" ]] && body="$(tail -c 8000 "$LOG_FILE")"
  curl -fsS -m 10 --retry 3 --data-raw "$body" "$HC_URL/fail" >/dev/null || true
}

# ── Composable EXIT hooks ────────────────────────────────────────────────────
# bash `trap ... EXIT` REPLACES any previous trap, so helpers that each need
# exit-time work (healthcheck fail ping, lock cleanup) must
# register through one dispatcher instead of setting their own traps —
# otherwise whichever helper ran last silently disables the others.

_EXIT_HOOKS=()
_EXIT_CODE=0
_run_exit_hooks() {
  _EXIT_CODE=$?
  # LIFO (like `defer`): later-registered cleanup (e.g. a lock release)
  # runs BEFORE the earlier-registered healthcheck fail ping, so a failing
  # cleanup can still mark the run failed and be reported.
  local i hook
  for ((i = ${#_EXIT_HOOKS[@]} - 1; i >= 0; i--)); do
    hook="${_EXIT_HOOKS[$i]}"
    if ! eval "$hook"; then
      log "exit hook failed: $hook"
      _hc_failed=1
    fi
  done
  # A run whose cleanup failed must not report success to its caller
  # (launchd, Railway). Every hook has run by now, including the fail ping.
  if [[ $_EXIT_CODE -eq 0 && $_hc_failed -ne 0 ]]; then exit 1; fi
}
add_exit_hook() {
  _EXIT_HOOKS+=("$1")
  trap _run_exit_hooks EXIT
}

# Wire ERR/EXIT so any failure pings /fail exactly once. Scripts call
# `hc_trap` after setting HC_URL/LOG_FILE — and BEFORE registering cleanup
# hooks that must be able to fail the run (LIFO ordering above).
_hc_failed=0
_hc_on_err() { _hc_failed=1; }
_hc_on_exit() {
  if [[ ${_EXIT_CODE:-0} -ne 0 || $_hc_failed -ne 0 ]]; then hc_fail; fi
  # rmdir_lock and friends registered before hc_trap still run after this.
  return 0
}
hc_trap() {
  trap _hc_on_err ERR
  add_exit_hook '_hc_on_exit'
}

# ── Locking (macOS has no flock(1); mkdir is atomic) ─────────────────────────

acquire_lock() {
  local name="$1"
  local lock_dir="$CACHE_DIR/$name.lock"
  if ! mkdir "$lock_dir" 2>/dev/null; then
    log "lock $name held ($(cat "$lock_dir/pid" 2>/dev/null || echo '?')) — exiting"
    return 1
  fi
  echo $$ > "$lock_dir/pid"
  add_exit_hook "rmdir_lock '$lock_dir'"
}

rmdir_lock() { rm -f "$1/pid" 2>/dev/null; rmdir "$1" 2>/dev/null || true; }

# Acquire a non-blocking advisory lock at an explicit path. Unlike acquire_lock,
# this is suitable for a Railway persistent volume: the kernel releases flock
# automatically after TERM, INT, or a hard container stop, while the lock file
# remains as useful owner metadata. The caller must ensure flock(1) is present.
acquire_path_lock() {
  local lock_file="$1"
  local name="${2:-$(basename "$lock_file")}" lock_fd owner

  mkdir -p "$(dirname "$lock_file")"
  exec {lock_fd}>>"$lock_file"
  if ! flock -n "$lock_fd"; then
    owner="$(tr '\n' ' ' < "$lock_file" 2>/dev/null || true)"
    log "lock $name held (${owner:-owner unknown}) — refusing overlap"
    eval "exec ${lock_fd}>&-"
    return 1
  fi

  printf 'pid=%s started_at=%s\n' "$$" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$lock_file"
  add_exit_hook "release_path_lock '$lock_fd'"
}

release_path_lock() {
  local lock_fd="$1"
  flock -u "$lock_fd" 2>/dev/null || true
  eval "exec ${lock_fd}>&-"
}

# ── Tools ────────────────────────────────────────────────────────────────────

railway_cli() { env -u RAILWAY_API_TOKEN railway "$@"; }

require_tool() {
  command -v "$1" >/dev/null 2>&1 || { log "missing required tool: $1"; return 1; }
}

# Remote path helper: bucket-qualified rclone destination.
bucket_path() { printf '%s:%s/%s' "${BACKUP_REMOTE:?set in ops.env}" "${BACKUP_BUCKET:?set in ops.env}" "$1"; }
