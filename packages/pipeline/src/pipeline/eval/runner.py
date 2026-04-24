"""Eval orchestrator — selects level, iterates questions, collects results."""

from pipeline.eval.dataset import load_dataset, filter_dataset
from pipeline.eval.results import save_result


def run_eval(
    level: str,
    difficulty: str | None = None,
    reasoning_type: str | None = None,
    question_id: str | None = None,
    top_k: int | None = None,
    from_result: str | None = None,
    legacy_evidence: bool = False,
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
    elif level == "answer":
        from pipeline.eval.levels.answer import evaluate_answers
        per_question = evaluate_answers(entries, use_unified_evidence=not legacy_evidence)
    elif level == "citation":
        from pipeline.eval.levels.citation import evaluate_citations
        per_question = evaluate_citations(entries, from_result=from_result)
    else:
        return {"error": f"Unknown level: {level}. Available: retrieval, cross-ref, answer, citation"}

    # Save results
    config_overrides = {}
    if top_k:
        config_overrides["top_k"] = top_k
    if level == "answer":
        from pipeline.config import EVAL_JUDGE_MODEL
        config_overrides["judge_model"] = EVAL_JUDGE_MODEL
        config_overrides["evidence_mode"] = "legacy" if legacy_evidence else "unified"
    if level == "citation" and from_result:
        config_overrides["from_result"] = str(from_result)

    path = save_result(level, per_question, config_overrides)

    # Load back to get the full result with aggregates
    from pipeline.eval.results import load_result
    return load_result(path)
