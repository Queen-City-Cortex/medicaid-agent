"""Eval result storage, loading, and comparison."""

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from pipeline.config import EVAL_RESULTS_DIR, EMBEDDING_MODEL, EVAL_DEFAULT_TOP_K

ANSWER_SCORE_DIMENSIONS = (
    "factual_accuracy",
    "completeness",
    "hallucination",
    "citation_quality",
    "overall",
)


_RETRIEVAL_METRIC_KEYS = ("precision", "recall", "mrr")


def _metric_mean(rows: list[dict], key: str) -> float | None:
    """Mean of a metric over the rows where it is present (not None)."""
    values = [q.get(key) for q in rows if q.get(key) is not None]
    return sum(values) / len(values) if values else None


def _compute_retrieval_rollup(rows: list[dict]) -> tuple[dict, int, int]:
    """Compute retrieval-style aggregates for a run subset.

    Scorability is per-metric, not keyed solely on precision: zero-citation
    answers legitimately produce precision=None with recall=0.0, and keying
    on precision silently dropped them — inflating recall and
    primary_hit_rate. Rows with no retrieval metric at all (judge/agent
    errors) are excluded and counted.
    """
    scorable = [
        q for q in rows
        if any(q.get(key) is not None for key in _RETRIEVAL_METRIC_KEYS)
    ]
    unscored = len(rows) - len(scorable)

    rollup: dict = {}
    if scorable:
        for out_key, key in (
            ("precision_at_k", "precision"),
            ("recall_at_k", "recall"),
            ("mrr", "mrr"),
        ):
            value = _metric_mean(scorable, key)
            if value is not None:
                rollup[out_key] = value
        rollup["primary_hit_rate"] = sum(1 for q in scorable if q.get("primary_hit")) / len(scorable)

    return rollup, len(scorable), unscored


def _compute_answer_rollup(rows: list[dict]) -> dict:
    """Compute answer-score aggregates for a run subset when score data exists."""
    rollup: dict = {}
    for dim in ANSWER_SCORE_DIMENSIONS:
        values = [
            q["scores"].get(dim)
            for q in rows
            if q.get("scores") and q["scores"].get(dim) is not None
        ]
        if values:
            rollup[dim] = sum(values) / len(values)

    # Withheld rows score overall 0 and carry no hallucination score, so the
    # means above already charge withholding to the answer dimensions and keep
    # `hallucination` to released answers. Report the released-only means and
    # the withheld count beside them so neither is recomputed by hand.
    if rollup:
        released = [q for q in rows if (q.get("scores") or {}).get("outcome") != "withheld"]
        for dim in ANSWER_SCORE_DIMENSIONS:
            values = [
                q["scores"].get(dim)
                for q in released
                if q.get("scores") and q["scores"].get(dim) is not None
            ]
            if values and dim != "hallucination":
                rollup[f"{dim}_released"] = sum(values) / len(values)
        rollup["withheld_count"] = len(rows) - len(released)

    return rollup


def _section_document(section_id: str) -> str | None:
    """Document id inside a section id of the form `sec:<document id>:<part>`."""
    if not section_id.startswith("sec:") or section_id.count(":") < 2:
        return None
    return section_id[len("sec:"):].rsplit(":", 1)[0]


def route_first_document_role(row: dict, entry: dict) -> str | None:
    """Whether the first document the router chose is a golden document.

    `primary` or `supporting` when the routed document holds a golden section
    of that kind, `none` when it holds neither, and None when the run recorded
    no routed document. A golden section names its document in `document_id`
    and, on graphs whose ids differ from the dataset's, inside the graph's own
    section id; either match counts. Reported only: no score or gate reads it.
    """
    routed = (row.get("route_authoritative_document") or {}).get("id")
    if not routed:
        return None
    evidence = entry.get("evidence") or {}
    for role, key in (("primary", "primary_sections"), ("supporting", "supporting_sections")):
        for section in evidence.get(key) or []:
            if routed in (section.get("document_id"), _section_document(section.get("section_id") or "")):
                return role
    return "none"


def route_first_document_summary(rows: list[dict]) -> dict | None:
    """Per-run counts of `route_first_document`, or None for runs without it."""
    if not any("route_first_document" in row for row in rows):
        return None
    counts = {"primary": 0, "supporting": 0, "none": 0, "unknown": 0}
    for row in rows:
        counts[row.get("route_first_document") or "unknown"] += 1
    golden = counts["primary"] + counts["supporting"]
    known = golden + counts["none"]
    return {
        **counts,
        "golden": golden,
        "golden_rate": golden / known if known else None,
        "not_golden_ids": sorted(
            str(row.get("id")) for row in rows if row.get("route_first_document") == "none"
        ),
    }


def _error_counts(rows: list[dict]) -> dict:
    """Count rows excluded from aggregates, keyed by error type.

    Agent/judge errors carry `scores.error_type`; counting them separately
    keeps availability visible without letting infra failures pollute the
    quality means.
    """
    counts: dict[str, int] = {}
    for q in rows:
        error_type = (q.get("scores") or {}).get("error_type")
        if error_type:
            key = f"{error_type}_errors"
            counts[key] = counts.get(key, 0) + 1
    return counts


_NON_METRIC_KEYS = {"judge_errors", "agent_errors", "scorable_count", "withheld_count"}


def compute_rollup(rows: list[dict]) -> dict:
    """Compute all persisted aggregates for a run subset."""
    retrieval_rollup, scorable_count, retrieval_unscored = _compute_retrieval_rollup(rows)
    answer_rollup = _compute_answer_rollup(rows)

    rollup = {**retrieval_rollup, **answer_rollup}
    # Only meaningful for retrieval-style runs: for answer-level runs no row
    # has retrieval metrics, and the old unconditional counter stamped every
    # answer aggregate with judge_errors=N / scorable_count=0.
    if retrieval_rollup and retrieval_unscored:
        rollup["judge_errors"] = retrieval_unscored
        rollup["scorable_count"] = scorable_count
    rollup.update(_error_counts(rows))

    return rollup


def _has_metric_values(rollup: dict) -> bool:
    """Whether a rollup contains actual score metrics, not just error counters."""
    return any(key not in _NON_METRIC_KEYS for key in rollup)


def save_result(level: str, per_question: list[dict], config_overrides: dict | None = None) -> Path:
    """Save eval results to a timestamped JSON file. Returns the file path."""
    EVAL_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    run_id = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

    aggregate = compute_rollup(per_question)

    # Compute by_difficulty
    by_difficulty: dict[str, dict] = {}
    for diff in ["simple", "moderate", "complex"]:
        subset = [q for q in per_question if q.get("difficulty") == diff]
        rollup = compute_rollup(subset)
        if _has_metric_values(rollup):
            by_difficulty[diff] = {
                **rollup,
                "count": len(subset),
            }

    # Compute by_category (reasoning_type)
    by_category: dict[str, dict] = {}
    categories = set(q.get("reasoning_type", "") for q in per_question)
    for cat in categories:
        if not cat:
            continue
        subset = [q for q in per_question if q.get("reasoning_type") == cat]
        rollup = compute_rollup(subset)
        if _has_metric_values(rollup):
            by_category[cat] = {
                **rollup,
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
    # Beside `aggregate`, not inside it: eval-compare and the release gates
    # read every aggregate key as a score.
    route_summary = route_first_document_summary(per_question)
    if route_summary is not None:
        result["route_first_document"] = route_summary

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
