#!/usr/bin/env bash
set -euo pipefail

# A/B model-comparison eval runner.
#
# Wraps the existing pipeline eval harness to compare a candidate model against
# the current baseline for three swaps from the mid-2026 model-cost research:
#
#   embeddings  voyage-law-2  vs  a candidate embedder (deterministic retrieval)
#   reranker    LLM reranker  vs  none / another reranker (deterministic retrieval)
#   verifier    gpt-5.4-mini  vs  gpt-5.4-nano (stochastic answer+citation, 3-run)
#
# All comparisons run against the held-out paraphrase split — the only honest
# baseline per the 2026-06-11 de-contamination review. A swap is adopted only if
# its gate shows no regression (metric drop > EVAL_REGRESSION_THRESHOLD, 0.05).
#
# Usage:
#   scripts/eval-ab.sh embeddings           # needs candidate corpus on the AB container
#   scripts/eval-ab.sh reranker
#   scripts/eval-ab.sh verifier
#
# Key env knobs (all have defaults):
#   DATASET            golden dataset (default: held-out paraphrases)
#   RUNS               repeats for the stochastic verifier gate (default: 3)
#   AB_BOLT            bolt URI of the isolated candidate Neo4j (default: bolt://localhost:7688)
#   CANDIDATE_MODEL    candidate embedding model       (default: voyage-4-large)
#   CANDIDATE_DIMS     candidate embedding dimensions  (default: 2048)
#   BASELINE_VERIFIER  (default: gpt-5.4-mini)
#   CANDIDATE_VERIFIER (default: gpt-5.4-nano)
#   RERANK_BASELINE_MODEL (default: gpt-5-mini)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIPELINE_DIR="$REPO_ROOT/packages/pipeline"
PY=(.venv/bin/python -m pipeline.cli)
RESULTS_DIR="$PIPELINE_DIR/data/eval-results"

DATASET="${DATASET:-data/golden/heldout-paraphrase.json}"
RUNS="${RUNS:-3}"
AB_BOLT="${AB_BOLT:-bolt://localhost:7688}"
CANDIDATE_MODEL="${CANDIDATE_MODEL:-voyage-4-large}"
# voyage-4-large returns 1024-dim by DEFAULT (verified against the live API).
# The pipeline's voyage_client posts no output_dimension, so the model emits its
# native default — CANDIDATE_DIMS MUST equal that or the index/vector widths
# mismatch and retrieval silently breaks. 1024 also matches voyage-law-2, so the
# A/B is a clean same-dimension quality comparison. To try a Matryoshka 2048 dim
# you must first teach voyage_client.embed() to send output_dimension.
CANDIDATE_DIMS="${CANDIDATE_DIMS:-1024}"
BASELINE_VERIFIER="${BASELINE_VERIFIER:-gpt-5.4-mini}"
CANDIDATE_VERIFIER="${CANDIDATE_VERIFIER:-gpt-5.4-nano}"
RERANK_BASELINE_MODEL="${RERANK_BASELINE_MODEL:-gpt-5-mini}"

cd "$PIPELINE_DIR"

# ── Helpers ───────────────────────────────────────────────────────────────────

# Newest result file for a level — that's the run we just produced (runs are
# sequential, so no race). Echoes the run_id (filename minus _<level>.json).
latest_run_id() {
  local level="$1"
  local newest
  newest="$(ls -t "$RESULTS_DIR"/*_"$level".json 2>/dev/null | head -1 || true)"
  [ -n "$newest" ] || { echo "no $level result files found" >&2; return 1; }
  basename "$newest" "_$level.json"
}

# Mean ± sample-std of one aggregate metric across the newest N runs of a level.
summarize_metric() {
  local level="$1" metric="$2" n="$3"
  .venv/bin/python - "$RESULTS_DIR" "$level" "$metric" "$n" <<'PY'
import json, sys, glob, os, statistics
results_dir, level, metric, n = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
files = sorted(glob.glob(os.path.join(results_dir, f"*_{level}.json")),
               key=os.path.getmtime, reverse=True)[:n]
vals = []
for f in files:
    agg = json.load(open(f)).get("aggregate", {})
    if metric in agg and agg[metric] is not None:
        vals.append(agg[metric])
if not vals:
    print(f"  {metric}: no values"); sys.exit(0)
mean = statistics.mean(vals)
std = statistics.stdev(vals) if len(vals) > 1 else 0.0
print(f"  {metric}: {mean:.3f} ± {std:.3f}  (n={len(vals)}: {', '.join(f'{v:.3f}' for v in vals)})")
PY
}

banner() { echo; echo "── $* ──────────────────────────────────────────────"; }

# Run RUNS answer-level evals for one arm under the given env assignments, then
# print that arm's mean ± std for the key judge dimensions over its own runs.
# Used by the reranker and verifier gates — both vary behaviour only inside the
# full agent, so they must be measured via the (stochastic) answer eval, not the
# deterministic retrieval eval.
answer_arm() {
  local label="$1"; shift   # remaining args are VAR=value assignments
  echo "[$label] $RUNS answer runs — env: $*"
  for i in $(seq 1 "$RUNS"); do
    echo "  run $i/$RUNS"
    env "$@" "${PY[@]}" eval --level answer --dataset "$DATASET"
  done
  echo "[$label] summary (this arm's $RUNS runs):"
  for m in overall factual_accuracy hallucination citation_quality; do
    summarize_metric answer "$m" "$RUNS"
  done
}

# ── Gates ─────────────────────────────────────────────────────────────────────

# Build the controlled mixed corpus on the AB container at a given embedding
# model/dims, then run the deterministic retrieval eval against it. Echoes the
# retrieval run_id. --skip-parse reuses the local parsed JSON (data/parsed).
# Runs inside $(...) — ALL progress/report output must go to stderr so the only
# thing on stdout is the run_id echoed by latest_run_id.
embeddings_arm() {
  local model="$1" dims="$2"
  echo "[$model] building mixed corpus on $AB_BOLT (model=$model dims=$dims)" >&2
  NEO4J_URI="$AB_BOLT" EMBEDDING_MODEL="$model" EMBEDDING_DIMENSIONS="$dims" VOYAGE_MODEL="$model" \
    "${PY[@]}" build-mixed-corpus --reset --skip-parse >&2
  echo "[$model] retrieval eval" >&2
  NEO4J_URI="$AB_BOLT" VOYAGE_MODEL="$model" \
    "${PY[@]}" eval --level retrieval --dataset "$DATASET" >&2
  latest_run_id retrieval
}

gate_embeddings() {
  banner "Gate: embeddings — voyage-law-2 (1024) vs $CANDIDATE_MODEL ($CANDIDATE_DIMS)"
  # Both arms build the SAME mixed corpus on the isolated AB container, differing
  # ONLY in embedding model/dims — apples-to-apples. Comparing the candidate
  # against the full PRODUCTION graph would confound embedding model with corpus
  # content (production carries change-notices/bulletins/fee-schedules the mixed
  # corpus omits), so the baseline arm is rebuilt here on matched content. The
  # mixed-corpus baseline numbers therefore differ from production retrieval.
  docker compose -f "$REPO_ROOT/docker-compose.ab.yml" up -d --wait neo4j-ab

  local run_a; run_a="$(embeddings_arm voyage-law-2 1024)"
  local run_b; run_b="$(embeddings_arm "$CANDIDATE_MODEL" "$CANDIDATE_DIMS")"

  banner "eval-compare $run_a (voyage-law-2) vs $run_b ($CANDIDATE_MODEL) — matched mixed corpus"
  "${PY[@]}" eval-compare "$run_a" "$run_b"
}

gate_reranker() {
  banner "Gate: reranker — $RERANK_BASELINE_MODEL (on) vs disabled"
  # IMPORTANT: reranking is gated by shouldAttemptRerank(), which only fires for
  # "hard"/"ambiguous" queries using the route analysis built in the FULL AGENT
  # path. The standalone retrieval CLI carries no such analysis, so a retrieval-
  # level A/B skips with reason=not_hard_query and shows a misleading 0.000 delta.
  # We therefore measure the reranker through the answer eval, where it engages.
  answer_arm "rerank-on ($RERANK_BASELINE_MODEL)" \
    POLICY_CORPUS_RERANK_ENABLED=true "POLICY_CORPUS_RERANK_MODEL=$RERANK_BASELINE_MODEL"
  answer_arm "rerank-off" POLICY_CORPUS_RERANK_ENABLED=false

  banner "Stability across all $((RUNS * 2)) runs"
  "${PY[@]}" eval-answer-stability --last "$((RUNS * 2))" || true
  echo "Compare the two arms' summaries above (printed after each arm)."
  echo "(To A/B Voyage rerank-2.5 once implemented: set RERANK_BASELINE_MODEL to it and re-run.)"
}

gate_verifier() {
  banner "Gate: verifier — $BASELINE_VERIFIER vs $CANDIDATE_VERIFIER ($RUNS runs each, stochastic)"

  answer_arm "verifier-baseline ($BASELINE_VERIFIER)" "VERIFIER_MODEL=$BASELINE_VERIFIER"
  answer_arm "verifier-candidate ($CANDIDATE_VERIFIER)" "VERIFIER_MODEL=$CANDIDATE_VERIFIER"

  banner "Stability across all $((RUNS * 2)) runs"
  "${PY[@]}" eval-answer-stability --last "$((RUNS * 2))" || true
  echo "Compare the two arms' summaries above (printed after each arm)."
  echo "Citation gate for the newest (candidate) answer run:"
  local newest_answer; newest_answer="$(ls -t "$RESULTS_DIR"/*_answer.json | head -1)"
  "${PY[@]}" eval --level citation --from-result "$newest_answer"
}

# ── Dispatch ──────────────────────────────────────────────────────────────────

case "${1:-}" in
  embeddings) gate_embeddings ;;
  reranker)   gate_reranker ;;
  verifier)   gate_verifier ;;
  *)
    echo "usage: scripts/eval-ab.sh {embeddings|reranker|verifier}" >&2
    echo "  embeddings: builds BOTH arms as a matched mixed corpus on the AB container (~slow)" >&2
    echo "  reranker/verifier: stochastic answer eval, RUNS repeats per arm" >&2
    exit 2
    ;;
esac
