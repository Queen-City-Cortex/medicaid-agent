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
    """Compare two eval runs and flag regressions.

    Raises ValueError when the runs were judged under different evidence modes,
    scored against different golden dataset versions,
    or are different eval levels: their aggregate
    shapes don't overlap, so the union comparison would report every
    baseline-only metric as a drop to 0.0 — noise, not signal, and fatal to a
    --fail-on-regression gate.
    """
    level_a = run_a.get("level")
    level_b = run_b.get("level")
    if level_a and level_b and level_a != level_b:
        raise ValueError(
            f"cannot compare runs of different levels ({level_a} vs {level_b})"
        )
    # Answer runs judged under different evidence modes differ in judge prompt,
    # evidence budget and withheld-row scoring, so their deltas mean nothing.
    mode_a = (run_a.get("config") or {}).get("evidence_mode")
    mode_b = (run_b.get("config") or {}).get("evidence_mode")
    if mode_a and mode_b and mode_a != mode_b:
        raise ValueError(
            f"cannot compare runs judged under different evidence modes ({mode_a} vs {mode_b})"
        )

    version_a = (run_a.get("config") or {}).get("dataset_version")
    version_b = (run_b.get("config") or {}).get("dataset_version")
    if version_a != version_b:
        raise ValueError(
            "cannot compare runs scored against different golden dataset versions "
            f"({version_a or 'unversioned'} vs {version_b or 'unversioned'})"
        )

    # A different judge is a different scale, and an answer run that does not
    # record its judge cannot show it shares one. Other levels use no judge.
    judge_a = (run_a.get("config") or {}).get("judge_model")
    judge_b = (run_b.get("config") or {}).get("judge_model")
    judged = "answer" in {level_a, level_b}
    if (judged and not (judge_a and judge_b)) or judge_a != judge_b:
        raise ValueError(
            "cannot compare runs scored by different judges "
            f"({judge_a or 'not recorded'} vs {judge_b or 'not recorded'})"
        )

    diffs: list[dict] = []
    agg_a = run_a.get("aggregate", {})
    agg_b = run_b.get("aggregate", {})

    all_metrics = set(agg_a.keys()) | set(agg_b.keys())
    for metric in sorted(all_metrics):
        val_a = agg_a.get(metric, 0.0)
        val_b = agg_b.get(metric, 0.0)
        delta = val_b - val_a
        if metric.endswith("_errors") or metric == "withheld_count":
            # Error and withheld counters are higher-is-worse: any increase is
            # a regression, and a decrease is an improvement — the score-metric
            # rule would get both exactly backwards.
            regression = delta > 0
        elif metric == "scorable_count":
            # Informational; a shrunken denominator shows up in the score
            # metrics themselves.
            regression = False
        else:
            regression = delta < -threshold
        diffs.append({
            "metric": metric,
            "before": val_a,
            "after": val_b,
            "delta": delta,
            "regression": regression,
        })

    return diffs


def summarize_answer_stability(
    runs: list[dict],
    *,
    pass_threshold: int = 3,
    stable_miss_threshold: int = 2,
    high_variance_threshold: int = 1,
    hard_failure_threshold: int = 2,
) -> dict:
    """Summarize question-level answer stability across recent answer runs."""
    answer_runs = sorted(
        [
            run for run in runs
            if run.get("level") == "answer"
            or any("scores" in question for question in run.get("per_question", []))
        ],
        key=lambda run: run.get("run_id", ""),
        reverse=True,
    )

    question_rollups: dict[str, dict] = {}
    for run in answer_runs:
        run_id = run.get("run_id", "unknown")
        for question in run.get("per_question", []):
            question_id = question.get("id")
            if not question_id:
                continue

            rollup = question_rollups.setdefault(
                question_id,
                {
                    "id": question_id,
                    "difficulty": question.get("difficulty"),
                    "reasoning_type": question.get("reasoning_type"),
                    "runs_seen": 0,
                    "scorable_runs": 0,
                    "judge_error_count": 0,
                    "miss_count": 0,
                    "green_count": 0,
                    "hard_failure_count": 0,
                    "score_values": [],
                    "latest_run_id": None,
                    "latest_overall": None,
                    "latest_lane": None,
                    "latest_widening_policy": None,
                    "latest_explanation": "",
                },
            )

            rollup["runs_seen"] += 1
            scores = question.get("scores") or {}
            overall = scores.get("overall")

            if rollup["latest_run_id"] is None:
                rollup["latest_run_id"] = run_id
                rollup["latest_overall"] = overall
                rollup["latest_lane"] = question.get("route_lane")
                rollup["latest_widening_policy"] = question.get("route_widening_policy")
                rollup["latest_explanation"] = scores.get("explanation", "")

            if overall is None:
                rollup["judge_error_count"] += 1
                continue

            rollup["scorable_runs"] += 1
            rollup["score_values"].append(overall)
            if overall < pass_threshold:
                rollup["miss_count"] += 1
            else:
                rollup["green_count"] += 1
            if overall < hard_failure_threshold:
                rollup["hard_failure_count"] += 1

    questions: list[dict] = []
    for rollup in question_rollups.values():
        scores = rollup.pop("score_values")
        mean_overall = sum(scores) / len(scores) if scores else None
        min_overall = min(scores) if scores else None
        max_overall = max(scores) if scores else None
        score_range = (max_overall - min_overall) if scores else None

        questions.append(
            {
                **rollup,
                "mean_overall": mean_overall,
                "min_overall": min_overall,
                "max_overall": max_overall,
                "score_range": score_range,
                "miss_rate": (
                    rollup["miss_count"] / rollup["scorable_runs"]
                    if rollup["scorable_runs"]
                    else None
                ),
                "stable_miss": rollup["miss_count"] >= stable_miss_threshold,
                "high_variance": (
                    score_range is not None and score_range >= high_variance_threshold
                ),
            }
        )

    questions.sort(
        key=lambda question: (
            not question["stable_miss"],
            not question["high_variance"],
            -question["miss_count"],
            -(question["score_range"] or 0),
            question["id"],
        )
    )

    latest_run_id = answer_runs[0].get("run_id") if answer_runs else None
    latest_miss_ids = sorted(
        question["id"]
        for question in questions
        if question.get("latest_run_id") == latest_run_id
        and question.get("latest_overall") is not None
        and question["latest_overall"] < pass_threshold
    )

    return {
        "run_count": len(answer_runs),
        "run_ids": [run.get("run_id", "unknown") for run in answer_runs],
        "latest_run_id": latest_run_id,
        "pass_threshold": pass_threshold,
        "stable_miss_threshold": stable_miss_threshold,
        "high_variance_threshold": high_variance_threshold,
        "hard_failure_threshold": hard_failure_threshold,
        "questions": questions,
        "stable_miss_ids": sorted(question["id"] for question in questions if question["stable_miss"]),
        "high_variance_ids": sorted(question["id"] for question in questions if question["high_variance"]),
        "latest_miss_ids": latest_miss_ids,
    }
