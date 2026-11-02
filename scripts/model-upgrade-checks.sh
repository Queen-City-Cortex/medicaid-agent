#!/usr/bin/env bash
set -euo pipefail

# Paid quality checks for the November 2026 model upgrade
# (docs/validation/model-upgrade-2026-11/README.md). Every stage spends money
# and is run by the owner, never by CI.
#
#   scripts/model-upgrade-checks.sh classifiers   # gpt-5-mini vs gpt-6-luna, under $1
#   scripts/model-upgrade-checks.sh judge         # claude-sonnet-4-6 vs claude-sonnet-5-5, cap $15
#   scripts/model-upgrade-checks.sh verifier      # gpt-5.6-terra vs gpt-6.1-terra, $5 trials then arms stopped at $60 each
#   scripts/model-upgrade-checks.sh agent         # gpt-5.6-terra vs gpt-6.1-terra and gpt-6.1-sol, 3 x 50 questions per arm, about $50
#   scripts/model-upgrade-checks.sh all           # the four in that order
#
# Needs OPENAI_API_KEY and ANTHROPIC_API_KEY (from packages/agent/.env or the
# shell); the agent stage also needs VOYAGE_API_KEY and a Neo4j holding the
# corpus at NEO4J_URI (default bolt://localhost:7687). Output goes to
# model-upgrade-results/ (gitignored); keep it outside Git with the commit.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO_ROOT/model-upgrade-results"
MILESTONE="data/eval-results/milestones/2026-09-22-verified-release"
mkdir -p "$OUT"
[ -z "${CI:-}" ] || { echo "paid checks are refused under CI" >&2; exit 2; }

log() { echo; echo "== $* ($(date -u +%FT%TZ), commit $(git -C "$REPO_ROOT" rev-parse --short HEAD))"; }

classifiers() {
  log "classifiers: gpt-5-mini vs gpt-6-luna"
  (cd "$REPO_ROOT/packages/agent" && npx tsx scripts/classifier-compare.ts --live --max-usd 2 \
    --baseline gpt-5-mini --candidate gpt-6-luna) 2>/dev/null | tee "$OUT/classifiers.txt"
}

judge() {
  log "judge: claude-sonnet-4-6 vs claude-sonnet-5-5 on stored answers"
  (cd "$REPO_ROOT/packages/pipeline" && uv run python -m pipeline.eval.judge_calibration --max-usd 15 \
    --results "$MILESTONE/final-gate-full.json" --results "$MILESTONE/baseline.json" \
    --dataset "$MILESTONE/local-corpus-dataset.json" --out "$OUT/judge-calibration.json") | tee "$OUT/judge.txt"
}

verifier_arm() {
  local model="$1" label="$2"
  (cd "$REPO_ROOT/packages/agent" && VERIFIER_MODEL="$model" VERIFIER_REASONING_EFFORT=low \
    npx tsx scripts/verifier-benchmark.ts --live --arms seeded,original "${@:3}" \
    --out "$OUT/verifier-$label.json") | tee "$OUT/verifier-$label.txt"
}

verifier() {
  log "verifier trials (\$5 each)"
  # Explicit returns: errexit does not hold inside a function called from a
  # `||` list, and a full arm must never start without a finished trial.
  verifier_arm gpt-5.6-terra trial-baseline --limit 5 --repeats 1 --max-usd 5 || return 1
  verifier_arm gpt-6.1-terra trial-candidate --limit 5 --repeats 1 --max-usd 5 || return 1
  # The runbook's rule: forecast each full arm from its trial (spend per run
  # times 546 runs) and run it only when the forecast is under $60. The
  # measured spend still stops it at $60; --max-usd only has to cover the
  # printed worst-case bound.
  for pair in "gpt-5.6-terra baseline" "gpt-6.1-terra candidate"; do
    set -- $pair
    local forecast
    forecast="$(node -e 'const r=require(process.argv[1]);const f=r.spentUsd/r.bound.runs*546;if(!Number.isFinite(f)||f<=0)process.exit(1);console.log(f.toFixed(2))' "$OUT/verifier-trial-$2.json")" \
      || { echo "no valid forecast for $1: not starting its full arm" >&2; return 1; }
    log "verifier full arm $1: forecast \$$forecast"
    if node -e 'process.exit(Number(process.argv[1]) < 60 ? 0 : 1)' "$forecast"; then
      verifier_arm "$1" "$2" --max-usd 170 --stop-usd 60 || return 1
    else
      echo "SKIPPED: forecast \$$forecast is not under \$60" | tee "$OUT/verifier-$2.txt"
    fi
  done
}

agent() {
  log "agent A/B: gpt-5.6-terra vs gpt-6.1-terra and gpt-6.1-sol (judge and verifier held fixed)"
  # Both arms keep the old verifier and the calibrated judge, so the agent
  # model is the only thing that changes.
  (cd "$REPO_ROOT" && RUNS=3 BASELINE_AGENT=gpt-5.6-terra CANDIDATE_AGENT=gpt-6.1-terra SECOND_CANDIDATE_AGENT=gpt-6.1-sol \
    VERIFIER_MODEL=gpt-5.6-terra VERIFIER_REASONING_EFFORT=low EVAL_JUDGE_MODEL=claude-sonnet-4-6 \
    MASTRA_OBSERVABILITY_PATH=:memory: TRACE_STORE=off scripts/eval-ab.sh agent) | tee "$OUT/agent.txt"
}

case "${1:-}" in
  classifiers) classifiers ;;
  judge) judge ;;
  verifier) verifier ;;
  agent) agent ;;
  all) status=0
       # Each stage in its own process, so errexit holds inside it.
       for stage in classifiers judge verifier agent; do bash "$0" "$stage" || status=1; done
       exit "$status" ;;
  *) sed -n '4,17p' "$0"; exit 2 ;;
esac
