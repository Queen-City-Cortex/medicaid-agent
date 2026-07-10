#!/usr/bin/env bash
# Eval gate for the weekly refresh: block the (destructive) prod data push
# when the freshly built local graph regresses against the last-known-good
# retrieval eval.
#
# Gates on the RETRIEVAL level only — it's deterministic and cheap. Answer-
# level judge scores are documented as noisy (see RUNBOOK "Separating Eval
# Signal From Judge Noise") and would spuriously block a weekly push.
#
# State: ~/.cache/nc-medicaid/last-good-eval holds the last passing run id.
# First run (no baseline) records one and passes.
#
# Usage: scripts/ops/eval-gate.sh    (exit 0 = safe to deploy)

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PIPELINE_DIR="$REPO_ROOT/packages/pipeline"
BASELINE_FILE="$CACHE_DIR/last-good-eval"
PY="$PIPELINE_DIR/.venv/bin/python"

cd "$PIPELINE_DIR"

log "eval gate: validating dataset references against the graph"
"$PY" -m pipeline.cli eval-validate

log "eval gate: running retrieval eval"
"$PY" -m pipeline.cli eval --level retrieval

# The runner names results by UTC timestamp; the newest retrieval file is the
# run we just produced.
NEW_RUN="$(ls -t data/eval-results/*_retrieval.json | head -1 | xargs basename | sed 's/_retrieval.json//')"
[[ -n "$NEW_RUN" ]] || { log "eval gate: could not locate the new retrieval run"; exit 1; }

if [[ ! -f "$BASELINE_FILE" ]]; then
  log "eval gate: no baseline yet — recording $NEW_RUN as last-known-good and passing"
  printf '%s\n' "$NEW_RUN" > "$BASELINE_FILE"
  exit 0
fi

BASELINE="$(cat "$BASELINE_FILE")"
log "eval gate: comparing $BASELINE (baseline) → $NEW_RUN"
if "$PY" -m pipeline.cli eval-compare "$BASELINE" "$NEW_RUN" --fail-on-regression; then
  printf '%s\n' "$NEW_RUN" > "$BASELINE_FILE"
  log "eval gate: PASS — baseline advanced to $NEW_RUN"
else
  log "eval gate: FAIL — retrieval regression vs $BASELINE; NOT deploying"
  exit 1
fi
