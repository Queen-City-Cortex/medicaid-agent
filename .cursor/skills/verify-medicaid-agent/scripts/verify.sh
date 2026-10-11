#!/usr/bin/env bash
# Verification harness for NC Medicaid Navigator (web chat, hermetic mode).
#
#   verify.sh launch              start jwks stub + Next.js dev server for this run
#   verify.sh doctor              read-only health check of the instance this run started
#   verify.sh drive <target> [-- <playwright args>]
#                                 target: a skill recipe name (ask-question) or e2e:<path under e2e/>
#   verify.sh evidence            list this run's evidence and write MANIFEST.sha256
#   verify.sh cleanup             stop only this run's processes; keep evidence
#
# Everything is local: the browser mocks the agent API at its HTTP boundary,
# sign-in is a locally minted test session checked against a local JWKS stub.
# Nothing here reaches WorkOS, OpenAI, Voyage, Neo4j, Railway or production.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
STATE_ROOT="${TMPDIR:-/tmp}/verify-medicaid-agent"
EVIDENCE_ROOT="${VERIFY_EVIDENCE_ROOT:-$REPO_ROOT/.verify-evidence}"
WEB_PORT=3000      # fixed by the hermetic session (cookie domain + redirect URI)
JWKS_PORT=8719     # fixed by e2e/helpers/hermetic-env.ts
AGENT_PORT=4111    # NEXT_PUBLIC_MASTRA_URL in the hermetic env; must stay unused (agent is mocked in the browser)
RUN_ID_RE='^[0-9]{8}T[0-9]{6}-[0-9]+$'   # what launch generates: date +%Y%m%dT%H%M%S-<pid>
BASE_URL="http://localhost:$WEB_PORT"

die() { echo "verify: $*" >&2; exit 1; }
log() { echo "verify: $*"; }

run_id() { # the run to act on; only ever a launch-generated id, never a path
  local id
  if [[ -n "${VERIFY_RUN_ID:-}" ]]; then
    id="$VERIFY_RUN_ID"
  else
    [[ -f "$STATE_ROOT/current" ]] || die "no current run; run 'verify.sh launch' first (or set VERIFY_RUN_ID)"
    id="$(cat "$STATE_ROOT/current")"
  fi
  [[ "$id" =~ $RUN_ID_RE ]] || die "invalid run id '$id': expected the id launch printed (YYYYMMDDTHHMMSS-<pid>, e.g. 20261010T182934-1543937), not a path"
  echo "$id"
}

guard_run_dirs() { # $1 = run id. Refuse if this run's state or evidence dir is a symlink or resolves outside its root.
  local id="$1"
  if [[ -e "$STATE_ROOT/$id" || -L "$STATE_ROOT/$id" ]]; then
    inside_root "$STATE_ROOT/$id" "$STATE_ROOT" "$id" || die "refusing: run state $STATE_ROOT/$id is a symlink or resolves outside $STATE_ROOT. Nothing was stopped or deleted; inspect it by hand"
  fi
  if [[ -e "$EVIDENCE_ROOT/$id" || -L "$EVIDENCE_ROOT/$id" ]]; then
    inside_root "$EVIDENCE_ROOT/$id" "$EVIDENCE_ROOT" "$id" || die "refusing: evidence dir $EVIDENCE_ROOT/$id is a symlink or resolves outside $EVIDENCE_ROOT. Nothing was stopped, written or deleted; inspect it by hand"
  fi
}

# Resolve dir $1 (must exist, must not itself be a symlink) and require it to be
# exactly <real path of root $2>/<name $3>. Guards every write/rm under the roots.
inside_root() {
  local dir="$1" root="$2" name="$3" real_root real_dir
  [[ -d "$dir" && ! -L "$dir" ]] || return 1
  real_root="$(cd "$root" 2>/dev/null && pwd -P)" || return 1
  real_dir="$(cd "$dir" 2>/dev/null && pwd -P)" || return 1
  [[ "$real_dir" == "$real_root/$name" ]]
}

# Port ownership needs ss (iproute2) or, as a fallback, lsof. Neither is a Node/npm
# dependency, so check for one up front instead of failing mid-command.
PORT_TOOL_MISSING="neither 'ss' (iproute2) nor 'lsof' is on PATH; verify.sh needs one of them to check port ownership. Install one (e.g. 'apt-get install iproute2' or 'apt-get install lsof') and retry"

port_tool() { # prints ss or lsof, whichever is available (ss preferred); empty if neither
  if command -v ss >/dev/null 2>&1; then echo ss
  elif command -v lsof >/dev/null 2>&1; then echo lsof
  fi
}

require_port_tool() { [[ -n "$(port_tool)" ]] || die "$PORT_TOOL_MISSING"; }

port_pid() { # pid listening on TCP port $1, empty if none (call require_port_tool first)
  case "$(port_tool)" in
    ss)   { ss -ltnpH "sport = :$1" 2>/dev/null || true; } | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1 ;;
    lsof)
      local pid; pid="$({ lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true; } | head -1)"
      # lsof (seen with 4.99.4) skips processes whose name has a space or parenthesis,
      # and next dev's listener is named "next-server (vXX...)". On Linux, fill the gap
      # by matching the listening socket's inode in /proc.
      [[ -n "$pid" ]] || pid="$(proc_port_pid "$1")"
      echo "$pid" ;;
  esac
}

port_listening() { # true if anything listens on TCP port $1, even a process whose pid we can't read
  case "$(port_tool)" in
    ss)   [[ -n "$(ss -ltnH "sport = :$1" 2>/dev/null || true)" ]] ;;
    lsof) [[ -n "$({ lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true; } | head -1)" ]] || proc_port_listening "$1" ;;
    *)    return 1 ;;
  esac
}

proc_port_listening() { # Linux only
  [[ -r /proc/net/tcp ]] || return 1
  awk -v p=":$(printf '%04X' "$1")" '$4 == "0A" && substr($2, length($2) - 4) == p { found = 1 } END { exit !found }' /proc/net/tcp /proc/net/tcp6 2>/dev/null
}

refuse_if_agent_port_busy() { # $1 = what we refuse to do
  port_listening "$AGENT_PORT" || return 0
  local owner; owner="$(port_pid "$AGENT_PORT")"
  die "something is listening on :$AGENT_PORT (pid ${owner:-unknown}), the agent port the web app calls. Drives must never reach a real agent (it can query a real Neo4j), so refusing to $1. Stop it if it is yours (e.g. 'npm run dev:agent'), or wait for it to finish."
}

proc_port_pid() { # Linux only: pid owning the listening TCP socket on port $1, empty if none/unreadable
  [[ -r /proc/net/tcp ]] || return 0
  local hex inode fd
  hex="$(printf '%04X' "$1")"
  inode="$(awk -v p=":$hex" '$4 == "0A" && substr($2, length($2) - 4) == p { print $10; exit }' /proc/net/tcp /proc/net/tcp6 2>/dev/null || true)"
  [[ -n "$inode" ]] || return 0
  fd="$(find /proc/[0-9]*/fd -lname "socket:\[$inode\]" -print -quit 2>/dev/null || true)"
  [[ -z "$fd" ]] || { fd="${fd#/proc/}"; echo "${fd%%/*}"; }
}

pgid_of() { ps -o pgid= -p "$1" 2>/dev/null | tr -d ' '; }

proc_identity() { # start-time fingerprint of pid $1 (empty if gone); guards cleanup against PID reuse
  local stat
  if [[ -r "/proc/$1/stat" ]]; then
    stat="$(cat "/proc/$1/stat" 2>/dev/null || true)"
    [[ -n "$stat" ]] || return 0
    # Field 22 (starttime, clock ticks since boot). Cut after the last ')' so a
    # command name with spaces or parentheses can't shift the fields.
    stat="${stat##*) }"; echo "linux-starttime:$(echo "$stat" | awk '{print $20}')"
  else
    stat="$({ ps -o lstart= -p "$1" 2>/dev/null || true; } | sed 's/^ *//')"
    [[ -z "$stat" ]] || echo "ps-lstart:$stat"
  fi
}

check_node() {
  local want have
  want="$(cat "$REPO_ROOT/.nvmrc")"
  have="$(node --version 2>/dev/null | sed 's/^v//')"
  if [[ "$have" != "$want" ]]; then
    [[ "${VERIFY_ALLOW_NODE_MISMATCH:-}" == 1 ]] && { log "WARNING node $have != .nvmrc $want (allowed)"; return; }
    die "node $have on PATH, .nvmrc pins $want. Put Node $want first on PATH (nvm use), or set VERIFY_ALLOW_NODE_MISMATCH=1"
  fi
}

hermetic_env() { # prints export lines from the single source of truth
  node --input-type=module -e "
    const m = await import('$REPO_ROOT/e2e/helpers/hermetic-env.ts');
    for (const [k, v] of Object.entries(m.HERMETIC_ENV)) console.log('export ' + k + '=' + JSON.stringify(v));
  " 2>/dev/null
}

cmd_launch() {
  require_port_tool
  check_node
  [[ -x "$REPO_ROOT/node_modules/.bin/next" ]] || die "root deps missing: run 'npm ci' in $REPO_ROOT"
  [[ -d "$REPO_ROOT/e2e/node_modules/@playwright/test" ]] || die "e2e deps missing: run 'npm ci' in $REPO_ROOT/e2e, then 'npx playwright install chromium'"
  if [[ -f "$STATE_ROOT/current" ]] && [[ -d "$STATE_ROOT/$(cat "$STATE_ROOT/current")" ]]; then
    die "run $(cat "$STATE_ROOT/current") is still active; run 'verify.sh cleanup' first"
  fi
  for p in $WEB_PORT $JWKS_PORT; do
    # Presence decides; the pid (unreadable for other users' processes) is only for the message.
    port_listening "$p" || continue
    local owner; owner="$(port_pid "$p")"
    die "port $p is already in use (pid ${owner:-unknown, owned by another user?}). Not ours: refusing to start or drive it. Stop that instance yourself or wait for it."
  done
  refuse_if_agent_port_busy launch
  local env_lines; env_lines="$(hermetic_env)" || true
  [[ "$env_lines" == *WORKOS_COOKIE_PASSWORD* ]] || die "could not read e2e/helpers/hermetic-env.ts (needs Node >= 22.18 type stripping)"

  local id; id="$(date +%Y%m%dT%H%M%S)-$$"
  local run="$STATE_ROOT/$id" ev="$EVIDENCE_ROOT/$id"
  mkdir -p "$run" "$ev"
  echo "$id" > "$STATE_ROOT/current"
  {
    echo "run_id=$id"
    echo "git_rev=$(git -C "$REPO_ROOT" rev-parse HEAD)"
    echo "git_dirty=$([[ -z "$(git -C "$REPO_ROOT" status --porcelain)" ]] && echo no || echo yes)"
    echo "node=$(node --version)"
    echo "base_url=$BASE_URL"
    echo "launched_at=$(date -Iseconds)"
  } > "$ev/run-info.txt"

  log "starting JWKS stub on 127.0.0.1:$JWKS_PORT"
  ( cd "$REPO_ROOT/e2e" && JWKS_STUB_PORT=$JWKS_PORT exec setsid node helpers/jwks-stub.mjs ) > "$run/jwks.log" 2>&1 &
  echo $! > "$run/jwks.pid"
  proc_identity "$(cat "$run/jwks.pid")" > "$run/jwks.start"

  log "starting Next.js dev server on $BASE_URL (hermetic WorkOS env)"
  (
    eval "$env_lines"
    export NEXT_TELEMETRY_DISABLED=1
    cd "$REPO_ROOT/packages/web" && exec setsid "$REPO_ROOT/node_modules/.bin/next" dev -p "$WEB_PORT"
  ) > "$run/web.log" 2>&1 &
  echo $! > "$run/web.pid"
  proc_identity "$(cat "$run/web.pid")" > "$run/web.start"

  local budget="${VERIFY_LAUNCH_TIMEOUT:-240}" deadline
  deadline=$((SECONDS + budget))
  # Every probe is bounded by what is left of the launch budget, so a server that accepts
  # connections but never answers cannot hang launch past VERIFY_LAUNCH_TIMEOUT.
  probe() { # curl args...; one request capped by the remaining budget
    local rem=$((deadline - SECONDS)); (( rem >= 1 )) || rem=1
    curl --connect-timeout "$(( rem < 5 ? rem : 5 ))" --max-time "$rem" "$@"
  }
  until probe -fsS -o /dev/null "http://127.0.0.1:$JWKS_PORT/sso/jwks/ready-check" 2>/dev/null; do
    kill -0 "$(cat "$run/jwks.pid")" 2>/dev/null || { tail -20 "$run/jwks.log"; die "JWKS stub exited (see $run/jwks.log)"; }
    (( SECONDS < deadline )) || { tail -20 "$run/jwks.log"; die "JWKS stub not ready within ${budget}s (see $run/jwks.log); run 'verify.sh cleanup'"; }
    sleep 1
  done
  until [[ "$(probe -s -o /dev/null -w '%{http_code}' "$BASE_URL/" 2>/dev/null || true)" == 200 ]]; do
    kill -0 "$(cat "$run/web.pid")" 2>/dev/null || { tail -40 "$run/web.log"; die "web server exited (see $run/web.log)"; }
    (( SECONDS < deadline )) || { tail -40 "$run/web.log"; die "web server not ready within ${budget}s (see $run/web.log); run 'verify.sh cleanup'"; }
    sleep 2
  done
  # A 200 only counts if it came from us: both started processes are alive and each
  # port's listener belongs to the process group we started (never a foreign instance).
  local pair svc port owner
  for pair in "jwks:$JWKS_PORT" "web:$WEB_PORT"; do
    svc="${pair%%:*}"; port="${pair##*:}"
    kill -0 "$(cat "$run/$svc.pid")" 2>/dev/null || { tail -40 "$run/$svc.log"; die "$svc exited after answering on :$port; something else answered (see $run/$svc.log); run 'verify.sh cleanup'"; }
    owner="$(port_pid "$port")"
    [[ -n "$owner" && "$(pgid_of "$owner")" == "$(cat "$run/$svc.pid")" ]] || die "the listener on :$port (pid ${owner:-unknown}) is not the $svc process this run started; refusing to report ready against a foreign instance. Run 'verify.sh cleanup'"
  done
  # Warm the protected route's middleware compile so the first drive does not time out (best effort).
  local rem=$((deadline - SECONDS)); (( rem >= 1 )) || rem=1
  curl -s -o /dev/null --connect-timeout 5 --max-time "$(( rem < 120 ? rem : 120 ))" "$BASE_URL/chat" || true
  log "ready: run $id, web $BASE_URL, evidence $ev"
}

cmd_doctor() {
  local id run ev ok=1; id="$(run_id)"; run="$STATE_ROOT/$id"; ev="$EVIDENCE_ROOT/$id"
  guard_run_dirs "$id"
  [[ -d "$run" ]] || die "run $id has no state dir ($run); it was cleaned up or never launched"
  require_port_tool
  echo "run:        $id"
  echo "checkout:   $(git -C "$REPO_ROOT" rev-parse --short HEAD) (launched at $(sed -n 's/^git_rev=//p' "$ev/run-info.txt" | cut -c1-7))"
  echo "node:       $(node --version) (.nvmrc $(cat "$REPO_ROOT/.nvmrc"))"
  for svc in jwks web; do
    local pid; pid="$(cat "$run/$svc.pid")"
    if kill -0 "$pid" 2>/dev/null; then printf "%-12spid %s alive\n" "$svc:" "$pid"; else printf "%-12spid %s NOT running\n" "$svc:" "$pid"; ok=0; fi
  done
  for pair in "$JWKS_PORT:jwks" "$WEB_PORT:web"; do
    local port="${pair%%:*}" svc="${pair##*:}" owner want
    owner="$(port_pid "$port")"; want="$(cat "$run/$svc.pid")"
    if [[ -n "$owner" && "$(pgid_of "$owner")" == "$want" ]]; then
      echo "port $port:  owned by this run ($svc, pid $owner)"
    else
      echo "port $port:  NOT owned by this run (listener pid: ${owner:-none})"; ok=0
    fi
  done
  local home; home="$(curl -s --max-time 30 "$BASE_URL/")"
  if [[ "$home" == *"NC Medicaid Navigator"* ]]; then echo "GET /:      200, NC Medicaid Navigator"; else echo "GET /:      unexpected response"; ok=0; fi
  if curl -fsS --max-time 5 "http://127.0.0.1:$JWKS_PORT/sso/jwks/client_e2e_test" | grep -q '"keys"'; then
    echo "jwks:       serving the test public key"; else echo "jwks:       NOT serving keys"; ok=0; fi
  local loc; loc="$(curl -s -o /dev/null --max-time 120 -w '%{redirect_url}' "$BASE_URL/chat")"
  if [[ "$loc" == http://127.0.0.1:$JWKS_PORT/* ]]; then
    echo "auth:       logged-out /chat redirects to the local stub (hermetic WorkOS env active)"
  else
    echo "auth:       logged-out /chat redirects to '${loc:-nothing}' (expected the local stub; real WorkOS env?)"; ok=0
  fi
  if port_listening "$AGENT_PORT"; then
    local agent; agent="$(port_pid "$AGENT_PORT")"
    echo "port $AGENT_PORT:  something is listening (pid ${agent:-unknown}); drives would be refused. Stop it or wait"; ok=0
  else
    echo "port $AGENT_PORT:  free (agent is mocked in the browser)"
  fi
  echo "evidence:   $ev"
  (( ok )) && { echo "doctor: OK"; return 0; } || { echo "doctor: FAILED"; return 1; }
}

cmd_drive() {
  local id ev target spec project label; id="$(run_id)"; ev="$EVIDENCE_ROOT/$id"
  guard_run_dirs "$id"
  [[ -d "$STATE_ROOT/$id" ]] || die "run $id is not active; launch first"
  target="${1:-}"; [[ -n "$target" ]] || die "usage: verify.sh drive <recipe|e2e:path> [-- playwright args]"; shift
  [[ "${1:-}" == "--" ]] && shift
  require_port_tool
  refuse_if_agent_port_busy drive
  if [[ "$target" == e2e:* ]]; then
    spec="$REPO_ROOT/e2e/${target#e2e:}"; project=e2e-mocked
    label="e2e-$(basename "${target#e2e:}" .spec.ts)"
  else
    [[ "$target" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "invalid recipe name '$target': use a name from drive/<name>.verify.ts (e.g. ask-question)"
    spec="$SKILL_DIR/drive/$target.verify.ts"; project=verify; label="$target"
  fi
  [[ -f "$spec" ]] || die "no such drive target: $spec"
  local out="$ev/$label"; mkdir -p "$out"
  # drive/ is an ES module dir (like e2e/), and ESM ignores NODE_PATH, so give it e2e's node_modules.
  [[ -e "$SKILL_DIR/drive/node_modules" ]] || ln -s "../../../../e2e/node_modules" "$SKILL_DIR/drive/node_modules"
  log "driving $label (project $project); evidence -> $out"
  set +e
  ( cd "$REPO_ROOT/e2e" && VERIFY_AUTH_FILE="$STATE_ROOT/$id/session.json" VERIFY_EVIDENCE_DIR="$out" VERIFY_BASE_URL="$BASE_URL" \
      npx playwright test -c "$SKILL_DIR/drive/verify.config.ts" --project="$project" "$spec" "$@" ) 2>&1 | tee "$out/runner.log"
  local code=${PIPESTATUS[0]}
  set -e
  echo "$code" > "$out/exit-code"
  log "drive $label exit code $code"
  return "$code"
}

cmd_evidence() {
  local id ev; id="$(run_id)"; ev="$EVIDENCE_ROOT/$id"
  guard_run_dirs "$id"
  [[ -d "$ev" ]] || die "no evidence for run $id at $ev"
  ( cd "$ev" && find . -type f ! -name MANIFEST.sha256 -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256 )
  echo "evidence: $ev"
  ( cd "$ev" && find . -type f | sort )
}

cmd_cleanup() {
  local id run ev; id="$(run_id)"; run="$STATE_ROOT/$id"; ev="$EVIDENCE_ROOT/$id"
  guard_run_dirs "$id"   # before reading pid files, signalling, writing evidence or rm -rf
  if [[ -d "$run" ]]; then
    for svc in web jwks; do
      [[ -f "$run/$svc.pid" ]] || continue
      local pid recorded current; pid="$(cat "$run/$svc.pid")"
      if kill -0 "$pid" 2>/dev/null; then
        # Only signal the group if pid is still the process launch started (PID reuse guard).
        recorded="$(cat "$run/$svc.start" 2>/dev/null || true)"; current="$(proc_identity "$pid")"
        if [[ -z "$recorded" || "$recorded" != "$current" ]]; then
          log "NOT stopping $svc: pid $pid is no longer the process this run started (recorded '${recorded:-none}', now '${current:-gone}'); our server already exited and the pid was reused. Leaving it alone."
          continue
        fi
        log "stopping $svc (process group $pid)"
        kill -TERM -- "-$pid" 2>/dev/null || true
        for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
        kill -KILL -- "-$pid" 2>/dev/null || true
      fi
    done
    mkdir -p "$ev/server-logs"
    cp "$run"/*.log "$ev/server-logs/" 2>/dev/null || true
    inside_root "$run" "$STATE_ROOT" "$id" || die "refusing to delete $run: it no longer resolves to $STATE_ROOT/$id"
    rm -rf -- "$run"
  fi
  [[ "$(cat "$STATE_ROOT/current" 2>/dev/null)" == "$id" ]] && rm -f "$STATE_ROOT/current"
  # Stopping our process groups and keeping the evidence need no port tool, so they
  # always run; only the final port check depends on ss/lsof.
  local port_check=1
  if [[ -n "$(port_tool)" ]]; then
    for p in $WEB_PORT $JWKS_PORT; do
      local owner; owner="$(port_pid "$p")"
      [[ -z "$owner" ]] || log "WARNING port $p still has a listener (pid $owner); not ours to kill if it was not started by this run"
    done
  else
    port_check=0
  fi
  [[ -d "$ev" ]] && { echo "cleaned_at=$(date -Iseconds)" >> "$ev/run-info.txt"; VERIFY_RUN_ID="$id" cmd_evidence >/dev/null; log "evidence kept at $ev"; }
  (( port_check )) || die "processes stopped and evidence kept, but could not confirm ports $WEB_PORT/$JWKS_PORT are free: $PORT_TOOL_MISSING"
}

case "${1:-}" in
  launch)   cmd_launch ;;
  doctor)   cmd_doctor ;;
  drive)    shift; cmd_drive "$@" ;;
  evidence) cmd_evidence ;;
  cleanup)  cmd_cleanup ;;
  *) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
