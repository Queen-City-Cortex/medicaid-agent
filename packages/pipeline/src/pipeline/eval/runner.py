"""Eval orchestrator — selects level, iterates questions, collects results."""

from pipeline.eval.dataset import load_dataset, filter_dataset
from pipeline.eval.results import save_result


def run_eval(
    level: str,
    difficulty: str | None = None,
    reasoning_type: str | None = None,
    question_id: str | None = None,
    top_k: int | None = None,
) -> dict:
    """Run an evaluation at the specified level. Returns the result dict."""
    entries = load_dataset()
    entries = filter_dataset(
        entries,
        difficulty=difficulty,
        reasoning_type=reasoning_type,
        question_id=question_id,
    )

    if not entries:
        return {"error": "No matching entries found"}

    if level == "retrieval":
        from pipeline.eval.levels.retrieval import evaluate_retrieval
        per_question = evaluate_retrieval(entries, top_k=top_k)
    elif level == "cross-ref":
        from pipeline.eval.levels.cross_ref import evaluate_cross_refs
        per_question = evaluate_cross_refs(entries)
    else:
        return {"error": f"Unknown level: {level}. Available: retrieval, cross-ref"}

    # Save results
    config_overrides = {}
    if top_k:
        config_overrides["top_k"] = top_k

    path = save_result(level, per_question, config_overrides)

    # Load back to get the full result with aggregates
    from pipeline.eval.results import load_result
    return load_result(path)
