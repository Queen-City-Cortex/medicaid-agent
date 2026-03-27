"""Metric computation for eval levels."""


def precision_at_k(retrieved: list[str], relevant: set[str]) -> float:
    """Precision: fraction of retrieved items that are relevant."""
    if not retrieved:
        return 0.0
    hits = sum(1 for r in retrieved if r in relevant)
    return hits / len(retrieved)


def recall_at_k(retrieved: list[str], relevant: set[str]) -> float:
    """Recall: fraction of relevant items that appear in retrieved."""
    if not relevant:
        return 0.0
    hits = sum(1 for r in retrieved if r in relevant)
    return hits / len(relevant)


def mrr(retrieved: list[str], relevant: set[str]) -> float:
    """Mean Reciprocal Rank: 1/rank of first relevant result."""
    for i, r in enumerate(retrieved):
        if r in relevant:
            return 1.0 / (i + 1)
    return 0.0


def primary_hit_rate(results: list[dict]) -> float:
    """Fraction of questions where at least one primary section was retrieved."""
    if not results:
        return 0.0
    hits = sum(
        1 for r in results
        if any(p in r["retrieved"] for p in r["primary"])
    )
    return hits / len(results)


def compare_runs(
    run_a: dict,
    run_b: dict,
    threshold: float = 0.05,
) -> list[dict]:
    """Compare two eval runs and flag regressions."""
    diffs: list[dict] = []
    agg_a = run_a.get("aggregate", {})
    agg_b = run_b.get("aggregate", {})

    all_metrics = set(agg_a.keys()) | set(agg_b.keys())
    for metric in sorted(all_metrics):
        val_a = agg_a.get(metric, 0.0)
        val_b = agg_b.get(metric, 0.0)
        delta = val_b - val_a
        diffs.append({
            "metric": metric,
            "before": val_a,
            "after": val_b,
            "delta": delta,
            "regression": delta < -threshold,
        })

    return diffs
