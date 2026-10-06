#!/usr/bin/env bash
# Sources a copy of scripts/ops/lib.sh against fakes only: the copy sits in a
# temp checkout so each case writes its own .nvmrc, HOME and OPS_ENV are temp
# paths, and `node` is a stub that prints a fixed version. PATH holds the
# stubs and the system directories only, so no real Node is ever consulted.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TEMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEMP_ROOT"' EXIT
SYSTEM_PATH="/usr/bin:/bin"
TESTS=0

fail() {
  printf 'not ok - %s\n' "$*" >&2
  [[ -f "${CASE_DIR:-}/output" ]] && sed 's/^/    /' "$CASE_DIR/output" >&2
  exit 1
}

pass() {
  TESTS=$((TESTS + 1))
  printf 'ok %s - %s\n' "$TESTS" "$1"
}

# make_node <dir> <version>: a node stub that reports that version.
make_node() {
  mkdir -p "$1"
  printf '#!/bin/sh\necho "v%s"\n' "$2" > "$1/node"
  chmod +x "$1/node"
}

# new_case <name> [nvmrc]: a temp checkout holding lib.sh and, when given, a
# .nvmrc with that content.
new_case() {
  CASE_DIR="$TEMP_ROOT/$1"
  mkdir -p "$CASE_DIR/checkout/scripts/ops" "$CASE_DIR/home"
  cp "$REPO_ROOT/scripts/ops/lib.sh" "$CASE_DIR/checkout/scripts/ops/lib.sh"
  [[ $# -lt 2 ]] || printf '%s\n' "$2" > "$CASE_DIR/checkout/.nvmrc"
}

# source_lib <path> [VAR=value ...]: source the copy and print the node it
# leaves first on PATH. Sets STATUS; stdout and stderr land in $CASE_DIR.
source_lib() {
  local path="$1"
  shift
  STATUS=0
  env -i "$@" HOME="$CASE_DIR/home" OPS_ENV="$CASE_DIR/ops.env" PATH="$path" \
    /bin/bash -c 'source "$1/scripts/ops/lib.sh"; printf "node=%s\n" "$(command -v node || true)"' \
    _ "$CASE_DIR/checkout" > "$CASE_DIR/stdout" 2> "$CASE_DIR/stderr" || STATUS=$?
  cat "$CASE_DIR/stdout" "$CASE_DIR/stderr" > "$CASE_DIR/output"
}

new_case wrong-major 22.23.3
make_node "$CASE_DIR/brew" 26.9.0
source_lib "$CASE_DIR/brew:$SYSTEM_PATH"
[[ "$STATUS" -eq 1 ]] || fail "wrong-major: expected exit 1, got $STATUS"
grep -q "node 26.9.0 at $CASE_DIR/brew/node does not match .nvmrc (22.23.3): Node 22 is required" "$CASE_DIR/stderr" \
  || fail "wrong-major: the failure does not name the found and pinned versions"
grep -q "OPS_NODE_BIN" "$CASE_DIR/stderr" || fail "wrong-major: the failure does not say how to fix it"
[[ ! -s "$CASE_DIR/stdout" ]] || fail "wrong-major: the failure wrote to stdout or the script carried on"
pass "a node of another major stops the script with a logged failure on stderr"

new_case exact 22.23.3
make_node "$CASE_DIR/image" 22.23.3
source_lib "$CASE_DIR/image:$SYSTEM_PATH"
[[ "$STATUS" -eq 0 ]] || fail "exact: expected success, got $STATUS"
[[ "$(<"$CASE_DIR/stdout")" == "node=$CASE_DIR/image/node" ]] || fail "exact: unexpected stdout"
[[ ! -s "$CASE_DIR/stderr" ]] || fail "exact: a passing check wrote to stderr"
pass "the pinned node passes silently with PATH unchanged (image, CI)"

new_case same-major 22.23.3
make_node "$CASE_DIR/image" 22.23.2
source_lib "$CASE_DIR/image:$SYSTEM_PATH"
[[ "$STATUS" -eq 0 ]] || fail "same-major: expected success, got $STATUS"
pass "another patch of the pinned major passes"

new_case default-dir 22.23.3
make_node "$CASE_DIR/brew" 26.9.0
make_node "$CASE_DIR/home/.hermes/node/bin" 22.23.3
source_lib "$CASE_DIR/brew:$SYSTEM_PATH"
[[ "$STATUS" -eq 0 ]] || fail "default-dir: expected success, got $STATUS"
[[ "$(<"$CASE_DIR/stdout")" == "node=$CASE_DIR/home/.hermes/node/bin/node" ]] \
  || fail "default-dir: the default Node directory is not first on PATH"
pass "the default Node directory goes ahead of a newer node on PATH"

new_case override 22.23.3
make_node "$CASE_DIR/brew" 26.9.0
make_node "$CASE_DIR/home/.hermes/node/bin" 26.9.0
make_node "$CASE_DIR/node22/bin" 22.23.3
printf 'OPS_NODE_BIN=%s\n' "$CASE_DIR/node22/bin" > "$CASE_DIR/ops.env"
source_lib "$CASE_DIR/brew:$SYSTEM_PATH"
[[ "$STATUS" -eq 0 ]] || fail "override: expected success, got $STATUS"
[[ "$(<"$CASE_DIR/stdout")" == "node=$CASE_DIR/node22/bin/node" ]] \
  || fail "override: OPS_NODE_BIN from ops.env is not first on PATH"
pass "OPS_NODE_BIN set in ops.env replaces the default directory"

new_case override-wrong 22.23.3
make_node "$CASE_DIR/image" 22.23.3
make_node "$CASE_DIR/node26/bin" 26.9.0
source_lib "$CASE_DIR/image:$SYSTEM_PATH" OPS_NODE_BIN="$CASE_DIR/node26/bin"
[[ "$STATUS" -eq 1 ]] || fail "override-wrong: expected exit 1, got $STATUS"
grep -q "node 26.9.0 at $CASE_DIR/node26/bin/node does not match" "$CASE_DIR/stderr" \
  || fail "override-wrong: the failure does not name the overriding node"
pass "an OPS_NODE_BIN holding the wrong major is checked, not trusted"

new_case no-nvmrc
make_node "$CASE_DIR/image" 26.9.0
source_lib "$CASE_DIR/image:$SYSTEM_PATH"
[[ "$STATUS" -eq 0 ]] || fail "no-nvmrc: expected success, got $STATUS"
[[ ! -s "$CASE_DIR/stderr" ]] || fail "no-nvmrc: a passing check wrote to stderr"
pass "a checkout without .nvmrc (the corpus image) is not checked"

# PATH here holds only the two tools lib.sh needs to load, so a node installed
# in a system directory cannot be found.
new_case no-node 22.23.3
mkdir -p "$CASE_DIR/tools"
ln -s "$(PATH="$SYSTEM_PATH" command -v dirname)" "$(PATH="$SYSTEM_PATH" command -v mkdir)" "$CASE_DIR/tools/"
source_lib "$CASE_DIR/tools"
[[ "$STATUS" -eq 0 ]] || fail "no-node: expected success, got $STATUS"
[[ "$(<"$CASE_DIR/stdout")" == "node=" ]] || fail "no-node: a node was found on PATH"
pass "a host with no node on PATH is not stopped"

new_case silent-node 22.23.3
mkdir -p "$CASE_DIR/broken"
printf '#!/bin/sh\nexit 1\n' > "$CASE_DIR/broken/node"
chmod +x "$CASE_DIR/broken/node"
source_lib "$CASE_DIR/broken:$SYSTEM_PATH"
[[ "$STATUS" -eq 1 ]] || fail "silent-node: expected exit 1, got $STATUS"
grep -q "node (no version reported) at $CASE_DIR/broken/node" "$CASE_DIR/stderr" \
  || fail "silent-node: the failure does not say the node reported no version"
pass "a node that reports no version stops the script"

printf '1..%s\n' "$TESTS"
