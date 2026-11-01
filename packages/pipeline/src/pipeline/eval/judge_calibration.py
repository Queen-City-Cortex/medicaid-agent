"""Compare two judge models on the same stored answers before switching judges.

The judge's score thresholds were set with one model. Before another model's
scores are trusted, both judge the same released answers, with the same
question, reference and evidence, and this reports how often they agree.

Inputs are stored answer-level results (``per_question`` rows with the agent's
answer and evidence) and the dataset that holds their reference answers. The
evidence is the agent's own recorded evidence only: golden sections would need
Neo4j, and both judges see the identical blocks either way.

Usage, from packages/pipeline (paid: about $0.04 per row per judge):

    uv run python -m pipeline.eval.judge_calibration --max-usd 15 \\
        --results data/eval-results/milestones/2026-09-22-verified-release/final-gate-full.json \\
        --dataset data/eval-results/milestones/2026-09-22-verified-release/local-corpus-dataset.json

Exit status 0 means the candidate agrees closely enough to replace the
baseline (see ``verdict``); 1 means it does not; 2 means the run stopped.
"""

import argparse
import json
import os
import statistics
import sys
from pathlib import Path

from pipeline.eval import judge
from pipeline.eval.evidence import build_judge_evidence

DIMENSIONS = ("factual_accuracy", "completeness", "hallucination", "citation_quality", "overall")
# Worst-case dollars per judged row: two calls, evidence at its character
# budget, generous output. Used to stop before the cap, not to report spend.
ROW_BOUND_USD = {"claude-sonnet-4-6": 0.08, "claude-sonnet-5-5": 0.06}
# A candidate replaces the baseline only when, over all judged rows, each
# dimension's mean moves by at most this much and at least this share of
# release-relevant decisions (overall >= 2, hallucination >= 2) match.
MAX_MEAN_SHIFT = 0.15
MIN_DECISION_AGREEMENT = 0.9


def released_rows(results_paths: list[Path], dataset_path: Path, limit: int | None) -> list[dict]:
    references = {row["id"]: row["answer"] for row in json.loads(dataset_path.read_text())}
    rows = []
    for path in results_paths:
        for row in json.loads(path.read_text())["per_question"]:
            scores = row.get("scores") or {}
            if row.get("agent_error") or scores.get("outcome") == "withheld" or row["id"] not in references:
                continue
            if not row.get("agent_answer"):
                continue
            sources = (row.get("agent_evidence") or {}).get("sources") or []
            rows.append({
                "key": f"{path.stem}:{row['id']}",
                "question": row["question"],
                "golden_answer": references[row["id"]],
                "agent_answer": row["agent_answer"],
                "evidence_texts": build_judge_evidence(golden_sections=[], agent_sources=sources).blocks,
            })
    return rows[:limit] if limit else rows


def judge_with(model: str, row: dict) -> dict | None:
    judge.EVAL_JUDGE_MODEL = model
    try:
        scores = judge.judge_answer(row["question"], row["golden_answer"], row["agent_answer"], row["evidence_texts"])
    except judge.JudgeError as exc:
        print(f"  {model} {row['key']}: judge error: {str(exc)[:120]}", flush=True)
        return None
    return {dim: scores[dim] for dim in DIMENSIONS}


def compare(pairs: list[tuple[dict, dict]], baseline: str, candidate: str) -> bool:
    print(f"\nJudged by both: {len(pairs)} rows\n")
    print(f"{'dimension':<18}{baseline:>20}{candidate:>20}{'shift':>8}{'exact':>8}{'within 1':>10}")
    ok = True
    for dim in DIMENSIONS:
        a = [p[0][dim] for p in pairs]
        b = [p[1][dim] for p in pairs]
        shift = statistics.mean(b) - statistics.mean(a)
        exact = sum(x == y for x, y in zip(a, b)) / len(pairs)
        within = sum(abs(x - y) <= 1 for x, y in zip(a, b)) / len(pairs)
        ok &= abs(shift) <= MAX_MEAN_SHIFT
        print(f"{dim:<18}{statistics.mean(a):>20.3f}{statistics.mean(b):>20.3f}{shift:>+8.3f}{exact:>8.0%}{within:>10.0%}")
    for dim in ("overall", "hallucination"):
        agree = sum((p[0][dim] >= 2) == (p[1][dim] >= 2) for p in pairs) / len(pairs)
        ok &= agree >= MIN_DECISION_AGREEMENT
        print(f"{dim} >= 2 decisions agree: {agree:.0%} (need {MIN_DECISION_AGREEMENT:.0%})")
    print(f"\nverdict: {'candidate agrees with the baseline' if ok else 'candidate DISAGREES; do not switch judges'}"
          f" (mean shift limit {MAX_MEAN_SHIFT})")
    return ok


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", type=Path, action="append", required=True)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--baseline", default="claude-sonnet-4-6")
    parser.add_argument("--candidate", default="claude-sonnet-5-5")
    parser.add_argument("--max-usd", type=float, required=True)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    if os.environ.get("CI"):
        raise SystemExit("judge calibration makes paid calls and is refused under CI")
    if not judge.ANTHROPIC_API_KEY:
        raise SystemExit("ANTHROPIC_API_KEY is not set")
    rows = released_rows(args.results, args.dataset, args.limit)
    per_row = sum(ROW_BOUND_USD.get(m, 0.1) for m in (args.baseline, args.candidate))
    print(f"{len(rows)} released rows; worst case ${per_row * len(rows):.2f} for both judges, cap ${args.max_usd:.2f}")
    pairs, records, bound = [], [], 0.0
    for index, row in enumerate(rows, 1):
        if bound + per_row > args.max_usd:
            print(f"stopped at row {index}: the next row could pass --max-usd")
            break
        bound += per_row
        a, b = judge_with(args.baseline, row), judge_with(args.candidate, row)
        records.append({"key": row["key"], args.baseline: a, args.candidate: b})
        if a and b:
            pairs.append((a, b))
        print(f"  {index}/{len(rows)} {row['key']}: {a and a['overall']} vs {b and b['overall']}", flush=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(records, indent=2) + "\n")
    if len(pairs) < 20:
        print("fewer than 20 rows judged by both models: no verdict")
        return 2
    return 0 if compare(pairs, args.baseline, args.candidate) else 1


if __name__ == "__main__":
    sys.exit(main())
