"""Eval orchestrator — selects level, iterates questions, collects results."""

import json
import os
from pathlib import Path

from pipeline.eval.dataset import (
    benchmark_entries,
    catalog_sections,
    check_supporting_quotes,
    dataset_version,
    filter_dataset,
    load_dataset,
)
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
    # Only entries whose key is backed by quotes are scored, at every level:
    # the release evidence needs the same question set from each of them.
    matched = len(entries)
    entries = benchmark_entries(entries)
    skipped = matched - len(entries)
    print(
        f"[eval] scoring {len(entries)} validated questions; "
        f"skipped {skipped} that need validation",
        flush=True,
    )

    if not entries:
        return {"error": "No matching validated entries found"}

    catalog_path = os.environ.get("EVAL_IDENTITY_CATALOG")
    if catalog_path:
        # Same frozen catalog the identity preflight uses; no graph involved.
        quote_errors = check_supporting_quotes(entries, catalog_sections(Path(catalog_path)))
        if quote_errors:
            raise ValueError(
                "Golden answer keys failed the supporting-quote preflight: "
                + "; ".join(quote_errors)
            )

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

    if level == "answer":
        from pipeline.eval.results import route_first_document_role

        # Graph ids, as the router reports them.
        for row, raw_entry in zip(per_question, raw_entries, strict=True):
            row["route_first_document"] = route_first_document_role(row, raw_entry)

    # Save results
    config_overrides = {
        # Runs on different dataset versions answer to different keys and are
        # not comparable; eval-compare refuses the pair.
        "dataset_version": dataset_version(dataset_path),
        "skipped_unvalidated": skipped,
    }
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
        # Reported by the agent itself: stamping from this process's environment
        # would record nothing on a default run and miss the agent's own .env.
        agent_configs = [row["agent_config"] for row in per_question if row.get("agent_config")]
        if agent_configs:
            config_overrides["agent_config"] = agent_configs[0]
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
