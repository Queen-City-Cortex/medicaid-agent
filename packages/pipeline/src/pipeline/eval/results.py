"""Eval result storage, loading, and comparison."""

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from pipeline.config import EVAL_RESULTS_DIR, EMBEDDING_MODEL, EVAL_DEFAULT_TOP_K, EVAL_REGRESSION_THRESHOLD
from pipeline.eval.metrics import precision_at_k, recall_at_k, mrr, primary_hit_rate, compare_runs


def save_result(level: str, per_question: list[dict], config_overrides: dict | None = None) -> Path:
    """Save eval results to a timestamped JSON file. Returns the file path."""
    EVAL_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    run_id = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

    # Compute aggregates
    aggregate = {}
    if per_question:
        aggregate["precision_at_k"] = sum(q["precision"] for q in per_question) / len(per_question)
        aggregate["recall_at_k"] = sum(q["recall"] for q in per_question) / len(per_question)
        aggregate["mrr"] = sum(q["mrr"] for q in per_question) / len(per_question)
        aggregate["primary_hit_rate"] = sum(1 for q in per_question if q.get("primary_hit")) / len(per_question)

    # Compute by_difficulty
    by_difficulty: dict[str, dict] = {}
    for diff in ["simple", "moderate", "complex"]:
        subset = [q for q in per_question if q.get("difficulty") == diff]
        if subset:
            by_difficulty[diff] = {
                "precision_at_k": sum(q["precision"] for q in subset) / len(subset),
                "recall_at_k": sum(q["recall"] for q in subset) / len(subset),
                "mrr": sum(q["mrr"] for q in subset) / len(subset),
                "primary_hit_rate": sum(1 for q in subset if q.get("primary_hit")) / len(subset),
                "count": len(subset),
            }

    # Compute by_category (reasoning_type)
    by_category: dict[str, dict] = {}
    categories = set(q.get("reasoning_type", "") for q in per_question)
    for cat in categories:
        if not cat:
            continue
        subset = [q for q in per_question if q.get("reasoning_type") == cat]
        if subset:
            by_category[cat] = {
                "precision_at_k": sum(q["precision"] for q in subset) / len(subset),
                "recall_at_k": sum(q["recall"] for q in subset) / len(subset),
                "mrr": sum(q["mrr"] for q in subset) / len(subset),
                "primary_hit_rate": sum(1 for q in subset if q.get("primary_hit")) / len(subset),
                "count": len(subset),
            }

    # Get git SHA
    try:
        git_sha = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True
        ).strip()
    except Exception:
        git_sha = "unknown"

    result = {
        "run_id": run_id,
        "level": level,
        "config": {
            "embedding_model": EMBEDDING_MODEL,
            "top_k": EVAL_DEFAULT_TOP_K,
            "dataset_count": len(per_question),
            "git_sha": git_sha,
            **(config_overrides or {}),
        },
        "aggregate": aggregate,
        "by_difficulty": by_difficulty,
        "by_category": by_category,
        "per_question": per_question,
    }

    filename = f"{run_id}_{level}.json"
    path = EVAL_RESULTS_DIR / filename
    path.write_text(json.dumps(result, indent=2, default=str))

    return path


def load_result(path: Path) -> dict:
    """Load a saved eval result."""
    return json.loads(path.read_text())


def list_results(level: str | None = None, last: int | None = None) -> list[Path]:
    """List saved eval result files, newest first."""
    if not EVAL_RESULTS_DIR.exists():
        return []

    files = sorted(EVAL_RESULTS_DIR.glob("*.json"), reverse=True)
    if level:
        files = [f for f in files if f.stem.endswith(f"_{level}")]
    if last:
        files = files[:last]
    return files
