"""Eval orchestrator — selects level, iterates questions, collects results."""

import json
from pathlib import Path

from pipeline.eval.dataset import load_dataset, filter_dataset
from pipeline.eval.results import save_result


def _dataset_from_cached_result(from_result: str) -> Path | None:
    """Resolve the dataset a cached answer run was produced from, if recorded.

    Older runs (no `config.dataset`) return None → the golden default.
    Relative paths were recorded relative to the pipeline package root, so
    anchor them there rather than trusting the current working directory.
    """
    config = json.loads(Path(from_result).read_text()).get("config", {})
    recorded = config.get("dataset")
    if not recorded:
        return None
    path = Path(recorded)
    if not path.is_absolute():
        from pipeline.config import PROJECT_ROOT

        path = PROJECT_ROOT / path
    return path


def run_eval(
    level: str,
    difficulty: str | None = None,
    reasoning_type: str | None = None,
    question_id: str | None = None,
    top_k: int | None = None,
    from_result: str | None = None,
    legacy_evidence: bool = False,
    dataset_path: Path | None = None,
) -> dict:
    """Run an evaluation at the specified level. Returns the result dict."""
    if level == "citation" and from_result and dataset_path is None:
        # The citation level grades a cached answer run. Grading it against a
        # different dataset than the one that produced the answers makes every
        # ID lookup miss (q-* golden IDs vs h-* held-out IDs) and nulls the
        # whole run — inherit the cached run's dataset unless one was
        # explicitly passed.
        dataset_path = _dataset_from_cached_result(from_result)

    entries = load_dataset(dataset_path)
    entries = filter_dataset(
        entries,
        difficulty=difficulty,
        reasoning_type=reasoning_type,
        question_id=question_id,
    )

    if not entries:
        return {"error": "No matching entries found"}

    from pipeline.eval.identity import load_normalizer
    normalizer = load_normalizer() if level in {"retrieval", "answer"} else None
    raw_entries = normalizer.graph_entries(entries) if normalizer else entries

    if level == "retrieval":
        from pipeline.eval.levels.retrieval import evaluate_retrieval
        per_question = evaluate_retrieval(raw_entries, top_k=top_k)
    elif level == "cross-ref":
        from pipeline.eval.levels.cross_ref import evaluate_cross_refs
        per_question = evaluate_cross_refs(entries)
    elif level == "answer":
        from pipeline.eval.levels.answer import evaluate_answers
        per_question = evaluate_answers(raw_entries, use_unified_evidence=not legacy_evidence)
    elif level == "citation":
        from pipeline.eval.levels.citation import evaluate_citations
        per_question = evaluate_citations(entries, from_result=from_result)
    else:
        return {"error": f"Unknown level: {level}. Available: retrieval, cross-ref, answer, citation"}

    # Save results
    config_overrides = {}
    if normalizer:
        config_overrides["evidence_normalization"] = normalizer.evidence()
        for row, entry, raw_entry in zip(per_question, entries, raw_entries, strict=True):
            row["evidence_identity"] = {
                "raw_retrieved": row.get("retrieved", []),
                "normalized_retrieved": [normalizer.normalized(raw) for raw in row.get("retrieved", [])],
                "raw_expected_primary": [s["section_id"] for s in raw_entry["evidence"].get("primary_sections", [])],
                "raw_expected_supporting": [s["section_id"] for s in raw_entry["evidence"].get("supporting_sections", [])],
                "canonical_expected_supporting": [s["section_id"] for s in entry["evidence"].get("supporting_sections", [])],
                "canonical_expected_primary": [s["section_id"] for s in entry["evidence"].get("primary_sections", [])],
                "mapping_hash": normalizer.mapping_hash,
            }
    if dataset_path:
        # Recorded so eval-compare and eval-runs can tell held-out runs apart
        # from main-dataset runs.
        config_overrides["dataset"] = str(dataset_path)
    if top_k:
        config_overrides["top_k"] = top_k
    if level == "answer":
        from pipeline.config import EVAL_JUDGE_MODEL
        config_overrides["judge_model"] = EVAL_JUDGE_MODEL
        config_overrides["evidence_mode"] = "legacy" if legacy_evidence else "unified-v2"
    if level == "citation" and from_result:
        config_overrides["from_result"] = str(from_result)

    # Stamp model/infra provenance so eval-compare can distinguish A/B arms.
    # Without this, two retrieval runs over different embedding corpora
    # produce indistinguishable result files.
    from pipeline.config import EMBEDDING_DIMENSIONS, NEO4J_URI

    config_overrides["embedding_dimensions"] = EMBEDDING_DIMENSIONS
    config_overrides["neo4j_uri"] = NEO4J_URI

    path = save_result(level, per_question, config_overrides)

    # Load back to get the full result with aggregates
    from pipeline.eval.results import load_result
    return load_result(path)
