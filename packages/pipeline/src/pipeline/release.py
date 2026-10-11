"""Versioned corpus release manifests and non-bypassable promotion gates."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import statistics
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, TypeVar

from pipeline.config import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL
from pipeline.crawler_registry import PAYLOAD_RETAINED_STATUSES


REPO_ROOT = Path(__file__).resolve().parents[4]
POLICY_PATH = REPO_ROOT / "corpus-release-policy.json"
_COMMIT_SHA = re.compile(r"^[0-9a-f]{7,40}$")
_COLORS = frozenset({"blue", "green"})
_T = TypeVar("_T")


def utc_now() -> datetime:
    return datetime.now(UTC)


def format_timestamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def load_json_object(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text())
    if not isinstance(payload, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return payload


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    """Write JSON atomically so a killed job cannot corrupt its manifest."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        "w",
        dir=path.parent,
        prefix=f".{path.name}.",
        delete=False,
    ) as temporary:
        json.dump(payload, temporary, indent=2, allow_nan=False)
        temporary.write("\n")
        temporary_path = Path(temporary.name)
    os.replace(temporary_path, path)


def load_release_policy(path: Path = POLICY_PATH) -> dict[str, Any]:
    policy = load_json_object(path)
    if policy.get("policyVersion") != 3:
        raise ValueError("Unsupported corpus release policy version")
    for section in ("mandatory", "overridable", "evaluation", "operations"):
        if not isinstance(policy.get(section), dict):
            raise ValueError(f"Release policy is missing {section}")
    cap = policy["evaluation"].get("withheldAnswers")
    if (
        not isinstance(cap, dict)
        or not all(type(cap.get(key)) is int for key in ("max", "benchmarkSize"))
        or not 0 <= cap["max"] < cap["benchmarkSize"]
    ):
        raise ValueError(
            "Release policy needs a withheld-answer cap with max and benchmarkSize"
        )
    limits = policy["evaluation"].get("maxRegression")
    if (
        not isinstance(limits, dict)
        or set(limits) != set(_BASELINE_COMPARISON_METRICS)
        or any(_finite_number(limit) is None for limit in limits.values())
    ):
        raise ValueError(
            "Release policy needs one regression limit for each of: "
            + ", ".join(_BASELINE_COMPARISON_METRICS)
        )
    minimums = policy["mandatory"].get("minimumLoadedDocuments")
    families = minimums.get("families") if isinstance(minimums, dict) else None
    if (
        not isinstance(families, dict)
        or not families
        or any(type(count) is not int or count < 1 for count in families.values())
    ):
        raise ValueError(
            "Release policy needs a positive minimum document count per source family"
        )
    return policy


def release_policy_hash(path: Path = POLICY_PATH) -> str:
    """Identify the gate thresholds a manifest was validated against."""
    return f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"


def _normalized_hash(value: str) -> str:
    normalized = value.removeprefix("sha256:").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", normalized):
        raise ValueError("source snapshot hash must be a SHA-256 digest")
    return f"sha256:{normalized}"


def create_release_manifest(
    *,
    release_id: str,
    commit_sha: str,
    target_color: str,
    source_snapshot_hash: str,
    previous_manifest: dict[str, Any] | None = None,
    embedding_model: str = EMBEDDING_MODEL,
    embedding_dimensions: int = EMBEDDING_DIMENSIONS,
    created_at: datetime | None = None,
) -> dict[str, Any]:
    release_id = release_id.strip()
    if not release_id or len(release_id) > 128:
        raise ValueError("release ID must contain 1-128 characters")
    if not _COMMIT_SHA.fullmatch(commit_sha):
        raise ValueError("commit SHA must contain 7-40 lowercase hex characters")
    if target_color not in _COLORS:
        raise ValueError("target color must be blue or green")
    if embedding_dimensions < 1:
        raise ValueError("embedding dimensions must be positive")

    previous_release_id = (
        str(previous_manifest["releaseId"])
        if previous_manifest
        else None
    )
    return {
        "schemaVersion": 1,
        "releaseId": release_id,
        "commitSha": commit_sha,
        "targetColor": target_color,
        "previousReleaseId": previous_release_id,
        "sourceSnapshotHash": _normalized_hash(source_snapshot_hash),
        "embeddingModel": embedding_model,
        "embeddingDimensions": embedding_dimensions,
        "counts": {},
        "auditResults": {},
        "evaluationResults": {},
        "gates": [],
        "stageResults": {},
        "events": [],
        "promotionState": "building",
        "createdAt": format_timestamp(created_at or utc_now()),
        "validatedAt": None,
        "promotedAt": None,
        "rolledBackAt": None,
        "rollbackWindowEndsAt": None,
    }


def source_snapshot_hash(snapshot: dict[str, Any]) -> str:
    value = snapshot.get("snapshot_hash")
    if not isinstance(value, str):
        encoded = json.dumps(
            snapshot,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        value = hashlib.sha256(encoded).hexdigest()
    return _normalized_hash(value)


def record_release_stage(
    manifest_path: Path,
    name: str,
    operation: Callable[[], _T],
    *,
    now: Callable[[], datetime] = utc_now,
) -> _T:
    """Run one idempotent stage and durably record success or failure."""
    manifest = load_json_object(manifest_path)
    stage_results = manifest.setdefault("stageResults", {})
    previous = stage_results.get(name, {})
    attempt = int(previous.get("attempt", 0)) + 1
    started_at = format_timestamp(now())
    stage_results[name] = {
        "status": "running",
        "attempt": attempt,
        "startedAt": started_at,
        "finishedAt": None,
        "result": None,
        "error": None,
    }
    atomic_write_json(manifest_path, manifest)

    try:
        result = operation()
    except BaseException as exc:
        manifest = load_json_object(manifest_path)
        manifest["stageResults"][name] = {
            "status": "failed",
            "attempt": attempt,
            "startedAt": started_at,
            "finishedAt": format_timestamp(now()),
            "result": None,
            "error": f"{type(exc).__name__}: {exc}"[:2_000],
        }
        atomic_write_json(manifest_path, manifest)
        raise

    manifest = load_json_object(manifest_path)
    manifest["stageResults"][name] = {
        "status": "passed",
        "attempt": attempt,
        "startedAt": started_at,
        "finishedAt": format_timestamp(now()),
        "result": result,
        "error": None,
    }
    atomic_write_json(manifest_path, manifest)
    return result


def _require_zero_errors(stage: str, result: dict[str, Any]) -> dict[str, Any]:
    errors = int(result.get("errors", 0))
    timed_out = int(result.get("timed_out", 0))
    if errors or timed_out:
        raise RuntimeError(
            f"{stage} reported {errors} errors and {timed_out} timeouts"
        )
    return result


def build_release_graph(manifest_path: Path, *, refresh_federal: bool = True) -> None:
    """Reset and fully rebuild only the graph selected by runtime config."""
    from pipeline.concepts.linker import link_concepts
    from pipeline.concepts.seed import seed_concepts
    from pipeline.embeddings.generator import embed_all
    from pipeline.embeddings.indexer import ensure_vector_index
    from pipeline.federal.loader import load_all_cfr, load_ssa
    from pipeline.graph.loader import load_all
    from pipeline.graph.schema import ensure_schema
    from pipeline.graph.schema_version import write_schema_version
    from pipeline.references.amendments import detect_amendments
    from pipeline.references.resolver import extract_and_resolve_all

    record_release_stage(
        manifest_path,
        "schema",
        lambda: (ensure_schema(), ensure_vector_index(), {"ensured": True})[-1],
    )
    record_release_stage(
        manifest_path,
        "load",
        lambda: _require_zero_errors(
            "load",
            load_all(reset=True),
        ),
    )
    record_release_stage(
        manifest_path,
        "cfr",
        lambda: _require_zero_errors(
            "CFR ingest",
            load_all_cfr(refresh=refresh_federal),
        ),
    )
    record_release_stage(
        manifest_path,
        "ssa",
        lambda: _require_zero_errors(
            "SSA ingest",
            load_ssa(refresh=refresh_federal),
        ),
    )
    record_release_stage(
        manifest_path,
        "references",
        lambda: extract_and_resolve_all(),
    )
    record_release_stage(
        manifest_path,
        "amendments",
        detect_amendments,
    )
    record_release_stage(
        manifest_path,
        "embeddings",
        lambda: _require_zero_errors("embedding", embed_all()),
    )

    def concepts() -> dict[str, Any]:
        seeded = seed_concepts()
        linked = link_concepts()
        return {"seeded": seeded, **linked}

    record_release_stage(manifest_path, "concepts", concepts)
    if os.environ.get("JEV_SECTION_ROLES_ENABLED") == "true":
        from pipeline.jev.sections import enrich_graph
        record_release_stage(manifest_path, "jevSections", lambda: enrich_graph(cache_only=True))
    record_release_stage(manifest_path, "schemaVersion", write_schema_version)


def mark_graph_release(
    manifest: dict[str, Any],
    *,
    promotion_state: str = "validated",
) -> dict[str, Any]:
    """Stamp the target graph so readiness verifies the graph, not only env."""
    from pipeline.graph.connection import get_session

    from pipeline.graph import queries

    enabled = os.environ.get("JEV_SECTION_ROLES_ENABLED") == "true"
    stage = (manifest.get("stageResults") or {}).get("jevSections") or {}
    annotation_digest = (stage.get("result") or {}).get("digest") if enabled else None
    if enabled and not annotation_digest:
        raise ValueError("Release stage and live Jev annotation identity mismatch; enrichment required")
    marked_at = format_timestamp(utc_now())

    def stamp(tx):
        tx.run(queries.LOCK_CORPUS_MUTATION).consume()
        existing = tx.run("MATCH (r:CorpusRelease {id: 'current'}) RETURN r.jev_annotation_digest AS digest").single()
        if existing and existing["digest"] and existing["digest"] != annotation_digest:
            raise ValueError("Cannot clear or change an annotated release identity")
        if enabled:
            marker = tx.run("MATCH (m:JevAnnotation {id: 'current'}) RETURN m.digest AS digest").single()
            if not marker or marker["digest"] != annotation_digest:
                raise ValueError("Release stage and live Jev annotation identity mismatch; record enrichment before stamping")
            from pipeline.jev.sections import validate_graph_labels
            validate_graph_labels(annotation_digest)
        tx.run(
            """
            MERGE (release:CorpusRelease {id: 'current'})
            SET release.release_id = $release_id,
                release.commit_sha = $commit_sha,
                release.target_color = $target_color,
                release.source_snapshot_hash = $source_snapshot_hash,
                release.promotion_state = $promotion_state,
                release.marked_at = $marked_at,
                release.jev_annotation_digest = $jev_annotation_digest
            """,
            {
                "release_id": manifest["releaseId"],
                "commit_sha": manifest["commitSha"],
                "target_color": manifest["targetColor"],
                "source_snapshot_hash": manifest["sourceSnapshotHash"],
                "promotion_state": promotion_state,
                "marked_at": marked_at,
                "jev_annotation_digest": annotation_digest,
            },
        )
    with get_session() as session:
        session.execute_write(stamp)

    return {"releaseId": manifest["releaseId"], "markedAt": marked_at}


def inspect_release_graph(expected_dimensions: int, expected_model: str = EMBEDDING_MODEL) -> dict[str, Any]:
    """Collect identity, source-family, and embedding gate metrics."""
    from pipeline.corpus_manifest import CORPUS_MANIFEST
    from pipeline.graph.connection import get_session
    from pipeline.embeddings.plan_graph import embedding_coverage

    coverage_row = embedding_coverage(model=expected_model, dimensions=expected_dimensions)
    required_types = sorted(
        {
            family.source_type
            for family in CORPUS_MANIFEST.source_families
            if family.required_for_answering
        }
        | {
            source.source_type
            for source in CORPUS_MANIFEST.federal_sources
            if source.required_for_answering
        }
    )

    with get_session() as session:
        document_row = session.run(
            """
            MATCH (document:Document)
            WITH count(document) AS total,
                 count(document.id) AS with_id,
                 count(DISTINCT document.id) AS distinct_ids,
                 collect(DISTINCT document.document_type) AS source_types
            RETURN total, with_id, distinct_ids, source_types
            """
        ).single()
        invalid_dimensions_row = session.run(
            """
            MATCH (node)
            WHERE (node:Section OR node:Chunk)
              AND node.embedding IS NOT NULL
              AND size(node.embedding) <> $dimensions
            RETURN count(node) AS invalid
            """,
            {"dimensions": expected_dimensions},
        ).single()

    total_documents = int(document_row["total"]) if document_row else 0
    with_id = int(document_row["with_id"]) if document_row else 0
    distinct_ids = int(document_row["distinct_ids"]) if document_row else 0
    source_types = set(document_row["source_types"] or []) if document_row else set()
    total_sections = int(coverage_row["total"]) if coverage_row else 0
    covered_sections = int(coverage_row["covered"]) if coverage_row else 0
    missing_required = sorted(set(required_types) - source_types)

    return {
        "documentCount": total_documents,
        "duplicateIdentities": (total_documents - with_id) + (with_id - distinct_ids),
        "requiredSourceFamiliesPresent": 0 if missing_required else 1,
        "missingRequiredSourceFamilies": missing_required,
        "embeddingSections": total_sections,
        "embeddedSections": covered_sections,
        "embeddingCoverage": (
            covered_sections / total_sections
            if total_sections
            else 0
        ),
        "invalidEmbeddingDimensions": (
            int(invalid_dimensions_row["invalid"])
            if invalid_dimensions_row
            else 0
        ),
    }


def _drop_fraction(previous: float | int | None, current: float | int) -> float:
    if previous is None or previous <= 0:
        return 0.0
    return max(0.0, (float(previous) - float(current)) / float(previous))


def build_release_counts(
    audit_report: dict[str, Any],
    previous_manifest: dict[str, Any] | None,
) -> dict[str, float | int]:
    counts: dict[str, float | int] = {}
    documents_total = 0
    answer_ready_total = 0
    family_document_keys: list[str] = []
    active_documents_by_family: dict[str, int] = {}
    for document in audit_report.get("documents", []):
        if document.get("registry_status") not in PAYLOAD_RETAINED_STATUSES:
            continue
        source_type = str(document.get("source_type", ""))
        if source_type:
            active_documents_by_family[source_type] = (
                active_documents_by_family.get(source_type, 0) + 1
            )

    for family in audit_report.get("source_families", []):
        source_type = str(family["source_type"])
        family_counts = family.get("counts", {})
        documents = active_documents_by_family.get(source_type, 0)
        answer_ready = int(family_counts.get("answer_ready", 0))
        document_key = f"sourceFamily.{source_type}.documents"
        answer_ready_key = f"sourceFamily.{source_type}.answerReady"
        counts[document_key] = documents
        counts[answer_ready_key] = answer_ready
        # Documents this build loaded into the candidate graph.
        counts[f"sourceFamily.{source_type}.loaded"] = int(family_counts.get("loaded", 0))
        family_document_keys.append(document_key)
        documents_total += documents
        answer_ready_total += answer_ready

    counts["documentsTotal"] = documents_total
    counts["answerReadyTotal"] = answer_ready_total
    previous_counts = (
        previous_manifest.get("counts", {})
        if previous_manifest
        else {}
    )
    counts["maxSourceFamilyDocumentDrop"] = max(
        (
            _drop_fraction(previous_counts.get(key), counts[key])
            for key in family_document_keys
        ),
        default=0.0,
    )
    counts["answerReadyDrop"] = _drop_fraction(
        previous_counts.get("answerReadyTotal"),
        answer_ready_total,
    )
    return counts


def build_release_audit_results(
    audit_report: dict[str, Any],
    graph_metrics: dict[str, Any],
) -> dict[str, Any]:
    summary = audit_report.get("summary", {})
    failures = summary.get("by_failure_reason", {})
    required_parse_exceptions = sum(
        1
        for document in audit_report.get("documents", [])
        if document.get("required_for_answering")
        and not document.get("scope_limitation_id")
        and document.get("registry_status") in PAYLOAD_RETAINED_STATUSES
        and document.get("parse_status") == "parse_exception"
    )
    stale_required = sorted(
        str(family["source_type"])
        for family in audit_report.get("source_families", [])
        if family.get("required_for_answering")
        and family.get("freshness_status") != "fresh"
    )
    return {
        "answerScopeAcceptancePassed": 0 if audit_report.get("answer_scope_limitations") else 1,
        "duplicateIdentities": max(
            int(summary.get("duplicate_document_ids", 0)),
            int(graph_metrics.get("duplicateIdentities", 0)),
        ),
        "missingAnswerReadyLoads": int(failures.get("missing_graph_load", 0)),
        "requiredCurrentParseExceptions": required_parse_exceptions,
        "embeddingCoverage": float(graph_metrics.get("embeddingCoverage", 0)),
        "invalidEmbeddingDimensions": int(
            graph_metrics.get("invalidEmbeddingDimensions", 0)
        ),
        "requiredSourceFamiliesPresent": int(
            graph_metrics.get("requiredSourceFamiliesPresent", 0)
        ),
        "missingRequiredSourceFamilies": list(
            graph_metrics.get("missingRequiredSourceFamilies", [])
        ),
        "freshnessSlaMet": 0 if stale_required else 1,
        "staleSourceFamilies": stale_required,
        "graphDocumentCount": int(graph_metrics.get("documentCount", 0)),
        "embeddingSections": int(graph_metrics.get("embeddingSections", 0)),
        "embeddedSections": int(graph_metrics.get("embeddedSections", 0)),
    }


def _finite_number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    converted = float(value)
    return converted if math.isfinite(converted) else None


# The baseline comparison scores every row, a withheld answer counting 0, so a
# build cannot improve it by withholding its weakest answers. The released-rows
# answer score and the withheld count have their own gates and stay out of it.
_BASELINE_COMPARISON_METRICS = (
    "retrievalPrecision",
    "retrievalRecall",
    "primaryDocumentHitRate",
    "answerScoreAllRows",
    "hallucinationScore",
)


# Gates that read paid agent answers: the scope acceptance cases and the answer
# runs. Every other gate is decided once the audit and the retrieval evaluation
# exist, before either is paid for.
_ANSWER_GATES = frozenset({
    "answerScopeAcceptancePassed",
    "answerScore",
    "hallucinationScore",
    "answerRuns",
    "withheldAnswers",
    "answerScoreAllRowsRegression",
    "hallucinationScoreRegression",
})
# Gates that compare document counts with the previous release: with none to
# compare with they read 0.0 and pass, having measured nothing.
_PREVIOUS_RELEASE_GATES = frozenset({"sourceFamilyDocumentDrop", "answerReadyDrop"})


def _mean_across_runs(values: list[Any]) -> float | None:
    """Mean of one metric over the answer runs; absent from any run, absent."""
    numbers = [_finite_number(value) for value in values]
    if not numbers or any(number is None for number in numbers):
        return None
    # Exact, so three runs at a floor average to the floor and not just under.
    return statistics.mean(numbers)


def _question_id(row: dict[str, Any]) -> Any:
    return row.get("id", row.get("question_id"))


def uncovered_question_ids(result: dict[str, Any]) -> set[str]:
    """Questions with labelled evidence the evaluated graph does not hold.

    The evaluation scores such a section as a miss whatever retrieval does, so
    these questions measure the graph's coverage and not its quality.
    """
    uncovered = set()
    for row in result.get("per_question", []):
        identity = row.get("evidence_identity") or {}
        expected = [
            *identity.get("raw_expected_primary", []),
            *identity.get("raw_expected_supporting", []),
        ]
        if any(str(section).startswith("missing:") for section in expected):
            uncovered.add(_question_id(row))
    return uncovered


def without_questions(result: dict[str, Any], excluded: set[str]) -> dict[str, Any]:
    """The same evaluation result, aggregated over the remaining questions."""
    if not excluded:
        return result
    from pipeline.eval.results import compute_rollup

    rows = [
        row for row in result.get("per_question", [])
        if _question_id(row) not in excluded
    ]
    return {**result, "per_question": rows, "aggregate": compute_rollup(rows)}


def build_release_evaluation_results(
    retrieval_result: dict[str, Any],
    answer_results: list[dict[str, Any]],
    previous_manifest: dict[str, Any] | None,
    *,
    excluded_questions: set[str] | None = None,
) -> dict[str, float]:
    """Reduce one retrieval run and the answer runs to the gated metrics.

    Every answer metric is the mean of the per-run values, so no single run
    decides a gate. Each compared metric gets its own regression value against
    the baseline; with no baseline, or a baseline lacking the metric, there is
    none and its gate fails. `excluded_questions` are the questions the
    baseline graph could not answer: the baseline metrics were computed
    without them, so the candidate is compared without them too. The floors
    read every question regardless.
    """
    evaluation = _gated_metrics(retrieval_result, answer_results)
    if previous_manifest is None:
        return evaluation
    compared = (
        _gated_metrics(
            without_questions(retrieval_result, excluded_questions),
            [without_questions(result, excluded_questions) for result in answer_results],
        )
        if excluded_questions
        else evaluation
    )
    previous_evaluation = previous_manifest.get("evaluationResults", {})
    for key in _BASELINE_COMPARISON_METRICS:
        previous = _finite_number(previous_evaluation.get(key))
        if key in compared and previous is not None:
            evaluation[f"{key}Regression"] = max(0.0, previous - compared[key])
    return evaluation


def _gated_metrics(
    retrieval_result: dict[str, Any],
    answer_results: list[dict[str, Any]],
) -> dict[str, float]:
    retrieval = retrieval_result.get("aggregate", {})
    answers = [result.get("aggregate", {}) for result in answer_results]
    benchmark_sizes = {
        result.get("config", {}).get("dataset_count") for result in answer_results
    }
    candidates = {
        "retrievalPrecision": retrieval.get("precision_at_k"),
        "retrievalRecall": retrieval.get("recall_at_k"),
        "primaryDocumentHitRate": retrieval.get("primary_hit_rate"),
        # Reported, not gated: `primaryDocumentHitRate` counts the exact primary
        # section despite its name; this counts any section of its document.
        "documentHitRate": retrieval.get("document_hit_rate"),
        # The floors read released answers: the harness reports their mean
        # beside the all-rows mean, and scores hallucination on them only.
        "answerScore": _mean_across_runs(
            [answer.get("overall_released") for answer in answers]
        ),
        "answerScoreAllRows": _mean_across_runs(
            [answer.get("overall") for answer in answers]
        ),
        "hallucinationScore": _mean_across_runs(
            [answer.get("hallucination") for answer in answers]
        ),
        "withheldAnswers": _mean_across_runs(
            [answer.get("withheld_count") for answer in answers]
        ),
        "benchmarkQuestions": (
            benchmark_sizes.pop() if len(benchmark_sizes) == 1 else None
        ),
        "answerRuns": len(answer_results),
    }
    return {
        key: value
        for key, raw_value in candidates.items()
        if (value := _finite_number(raw_value)) is not None
    }


def require_withheld_cap_for(
    benchmark_size: int, policy: dict[str, Any] | None = None
) -> None:
    """Refuse a validation the withheld-answer gate is certain to fail."""
    cap = (policy or load_release_policy())["evaluation"]["withheldAnswers"]
    if cap["benchmarkSize"] != benchmark_size:
        raise ValueError(
            f"The withheld-answer cap ({cap['max']} of {cap['benchmarkSize']}) was set "
            f"for another benchmark: the golden dataset now scores {benchmark_size} "
            "validated questions. The owner must re-set evaluation.withheldAnswers in "
            "corpus-release-policy.json for that size (issue #259) before a release "
            "can be validated."
        )


def _gate(
    name: str,
    actual: Any,
    threshold: float,
    *,
    minimum: bool,
    overridable: bool,
) -> dict[str, Any]:
    number = _finite_number(actual)
    passed = (
        False
        if number is None
        else number >= threshold
        if minimum
        else number <= threshold
    )
    return {
        "name": name,
        "passed": passed,
        "actual": number,
        "threshold": float(threshold),
        "overridable": overridable,
        "overrideReason": None,
    }


def evaluate_release_manifest(
    manifest: dict[str, Any],
    policy: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Evaluate every release gate; absent or non-finite metrics fail closed."""
    policy = policy or load_release_policy()
    audit = manifest.get("auditResults", {})
    evaluation = manifest.get("evaluationResults", {})
    counts = manifest.get("counts", {})
    mandatory = policy["mandatory"]
    evaluation_policy = policy["evaluation"]
    overridable = policy["overridable"]

    gates = [
        _gate(
            "duplicateIdentities",
            audit.get("duplicateIdentities"),
            mandatory["duplicateIdentities"],
            minimum=False,
            overridable=False,
        ),
        _gate(
            "missingAnswerReadyLoads",
            audit.get("missingAnswerReadyLoads"),
            mandatory["missingAnswerReadyLoads"],
            minimum=False,
            overridable=False,
        ),
        _gate(
            "requiredCurrentParseExceptions",
            audit.get("requiredCurrentParseExceptions"),
            mandatory["requiredCurrentParseExceptions"],
            minimum=False,
            overridable=False,
        ),
        _gate(
            "embeddingCoverage",
            audit.get("embeddingCoverage"),
            mandatory["embeddingCoverage"],
            minimum=True,
            overridable=False,
        ),
        _gate(
            "invalidEmbeddingDimensions",
            audit.get("invalidEmbeddingDimensions"),
            mandatory["invalidEmbeddingDimensions"],
            minimum=False,
            overridable=False,
        ),
        _gate(
            "requiredSourceFamiliesPresent",
            audit.get("requiredSourceFamiliesPresent"),
            mandatory["requiredSourceFamiliesPresent"],
            minimum=True,
            overridable=False,
        ),
    ]
    # The drop gates below compare only with the previous release, so losses
    # under their limits compound and an override waives them. These floors do
    # not move: a family that has really shrunk needs a deliberate policy edit.
    for family, minimum_documents in sorted(
        mandatory["minimumLoadedDocuments"]["families"].items()
    ):
        gates.append(
            _gate(
                f"sourceFamilyMinimum.{family}",
                counts.get(f"sourceFamily.{family}.loaded"),
                minimum_documents,
                minimum=True,
                overridable=False,
            )
        )
    if manifest.get("answerScopePolicyHash") or audit.get("answerScopeAcceptancePassed") == 0:
        stage = manifest.get("stageResults", {}).get("answerScopeAcceptance", {})
        receipt = stage.get("result") or {}
        from pipeline.answer_scope import scope_policy
        expected_cases = {(case, repeat) for case in scope_policy()["qualification_cases"] for repeat in [1, 2]}
        runs = receipt.get("runs", [])
        qualified = (
            stage.get("status") == "passed" and receipt.get("all_passed") is True
            and receipt.get("policy_hash") == manifest.get("answerScopePolicyHash")
            and receipt.get("implementation_hash") == manifest.get("answerScopeImplementationHash")
            and receipt.get("source_snapshot_hash") == manifest.get("sourceSnapshotHash")
            and receipt.get("evaluation_fingerprint") == manifest.get("evaluationFingerprint")
            and len(runs) == len(expected_cases)
            and {(run.get("case_id"), run.get("repeat")) for run in runs} == expected_cases
            and all(run.get("passed") is True for run in runs)
        )
        gates.append(_gate("answerScopeAcceptancePassed", int(qualified), 1, minimum=True, overridable=False))
    # Sparse golden relevance labels cannot support an absolute precision@10
    # threshold. Precision remains reported and compared against the baseline.
    for name in (
        "retrievalRecall",
        "primaryDocumentHitRate",
        "answerScore",
        "hallucinationScore",
    ):
        gates.append(
            _gate(
                name,
                evaluation.get(name),
                evaluation_policy[name],
                minimum=True,
                overridable=False,
            )
        )
    gates.append(
        _gate(
            "answerRuns",
            evaluation.get("answerRuns"),
            evaluation_policy["answerRuns"],
            minimum=True,
            overridable=False,
        )
    )
    # The cap is a count set against one benchmark size. A run of any other
    # size fails it until the cap is set again for that benchmark.
    withheld_cap = evaluation_policy["withheldAnswers"]
    gates.append(
        _gate(
            "withheldAnswers",
            evaluation.get("withheldAnswers")
            if evaluation.get("benchmarkQuestions") == withheld_cap["benchmarkSize"]
            else None,
            withheld_cap["max"],
            minimum=False,
            overridable=False,
        )
    )
    # One limit per metric: the retrieval rates run from 0 to 1 and the answer
    # scores from 0 to 3. No baseline means no value, and the gate fails.
    for name in _BASELINE_COMPARISON_METRICS:
        gates.append(
            _gate(
                f"{name}Regression",
                evaluation.get(f"{name}Regression"),
                evaluation_policy["maxRegression"][name],
                minimum=False,
                overridable=False,
            )
        )
    gates.extend(
        [
            _gate(
                "sourceFamilyDocumentDrop",
                counts.get("maxSourceFamilyDocumentDrop"),
                overridable["maxSourceFamilyDocumentDrop"],
                minimum=False,
                overridable=True,
            ),
            _gate(
                "answerReadyDrop",
                counts.get("answerReadyDrop"),
                overridable["maxAnswerReadyDrop"],
                minimum=False,
                overridable=True,
            ),
            _gate(
                "freshnessSla",
                audit.get("freshnessSlaMet"),
                overridable["freshnessSlaMet"],
                minimum=True,
                overridable=True,
            ),
        ]
    )
    return gates


def snapshot_bound_reasons(
    overrides: dict[str, Any],
    source_snapshot_hash: str,
) -> dict[str, str]:
    """Check every override was written for this source snapshot; return the reasons.

    An override is an operator's decision about one candidate. Each entry names
    the snapshot it was made for, so a file left in place cannot waive a gate
    for any later release.
    """
    reasons = {}
    for name, entry in overrides.items():
        if (
            not isinstance(entry, dict)
            or set(entry) != {"reason", "sourceSnapshotHash"}
            or not all(isinstance(value, str) for value in entry.values())
        ):
            raise ValueError(
                f"Override for {name} must be an object with exactly a reason "
                "and the sourceSnapshotHash it was written for"
            )
        bound_to = _normalized_hash(entry["sourceSnapshotHash"])
        if bound_to != source_snapshot_hash:
            raise ValueError(
                f"Override for {name} is bound to source snapshot {bound_to}, "
                f"not this release's {source_snapshot_hash}"
            )
        reasons[name] = entry["reason"].strip()
        if len(reasons[name]) < 10:
            raise ValueError(
                f"Override reason for {name} must contain at least 10 characters"
            )
    return reasons


def apply_overrides(
    gates: list[dict[str, Any]],
    overrides: dict[str, Any],
    source_snapshot_hash: str,
) -> list[dict[str, Any]]:
    """Apply snapshot-bound reasons only to the three explicitly overridable gates."""
    by_name = {gate["name"]: gate for gate in gates}
    unknown = sorted(set(overrides) - set(by_name))
    if unknown:
        raise ValueError(f"Unknown release gate override(s): {', '.join(unknown)}")
    for name in overrides:
        if not by_name[name]["overridable"]:
            raise ValueError(f"Release gate {name} cannot be overridden")

    updated = [dict(gate) for gate in gates]
    updated_by_name = {gate["name"]: gate for gate in updated}
    for name, reason in snapshot_bound_reasons(overrides, source_snapshot_hash).items():
        gate = updated_by_name[name]
        if not gate["passed"]:
            gate["overrideReason"] = reason[:2_000]
    return updated


def release_is_promotable(gates: list[dict[str, Any]]) -> bool:
    return all(
        gate["passed"]
        or (
            gate["overridable"]
            and isinstance(gate.get("overrideReason"), str)
            and bool(gate["overrideReason"])
        )
        for gate in gates
    )


def _gated_manifest(
    manifest_path: Path,
    *,
    audit_report: dict[str, Any],
    graph_metrics: dict[str, Any],
    retrieval_result: dict[str, Any],
    answer_results: list[dict[str, Any]],
    previous_manifest: dict[str, Any] | None,
    overrides: dict[str, Any] | None = None,
    baseline_evaluation: dict[str, float] | None = None,
    baseline_excluded_questions: set[str] | None = None,
) -> dict[str, Any]:
    """The manifest with its metrics and every gate evaluated; nothing written."""
    manifest = load_json_object(manifest_path)
    manifest["counts"] = build_release_counts(audit_report, previous_manifest)
    manifest["auditResults"] = build_release_audit_results(
        audit_report,
        graph_metrics,
    )
    manifest["evaluationResults"] = build_release_evaluation_results(
        retrieval_result,
        answer_results,
        {"evaluationResults": baseline_evaluation} if baseline_evaluation is not None else previous_manifest,
        excluded_questions=baseline_excluded_questions,
    )
    manifest["baselineComparisonExcludedQuestions"] = sorted(
        baseline_excluded_questions or ()
    )
    manifest["releasePolicyHash"] = release_policy_hash()
    gates = evaluate_release_manifest(manifest)
    manifest["gateOverrides"] = overrides or {}
    manifest["gates"] = apply_overrides(
        gates, manifest["gateOverrides"], manifest["sourceSnapshotHash"]
    )
    return manifest


def reject_before_answer_runs(
    manifest_path: Path,
    *,
    now: datetime | None = None,
    **evidence: Any,
) -> list[str]:
    """Reject the release now if a gate that needs no agent answer has failed.

    Returns the failed gates. An empty list leaves the manifest untouched and
    the answer stage may start; otherwise the manifest is written as rejected
    with the gates decided so far, and no answer should be paid for.
    """
    manifest = _gated_manifest(manifest_path, answer_results=[], **evidence)
    decided = [gate for gate in manifest["gates"] if gate["name"] not in _ANSWER_GATES]
    if release_is_promotable(decided):
        return []
    manifest["gates"] = decided
    manifest["promotionState"] = "rejected"
    manifest["validatedAt"] = format_timestamp(now or utc_now())
    atomic_write_json(manifest_path, manifest)
    return [
        gate["name"]
        for gate in decided
        if not gate["passed"] and not gate["overrideReason"]
    ]


def measured_gates(
    manifest_path: Path,
    *,
    audit_report: dict[str, Any],
    graph_metrics: dict[str, Any],
    retrieval_result: dict[str, Any],
) -> list[dict[str, Any]]:
    """The gates a built graph can be read against with no answer run and no baseline.

    Nothing is written and nothing is decided: the manifest keeps its state.
    """
    manifest = _gated_manifest(
        manifest_path,
        audit_report=audit_report,
        graph_metrics=graph_metrics,
        retrieval_result=retrieval_result,
        answer_results=[],
        previous_manifest=None,
    )
    return [
        gate
        for gate in manifest["gates"]
        if gate["name"] not in _ANSWER_GATES
        and gate["name"] not in _PREVIOUS_RELEASE_GATES
        and not gate["name"].endswith("Regression")
    ]


def finalize_release_manifest(
    manifest_path: Path,
    *,
    now: datetime | None = None,
    **evidence: Any,
) -> dict[str, Any]:
    manifest = _gated_manifest(manifest_path, **evidence)
    promotable = release_is_promotable(manifest["gates"])
    manifest["promotionState"] = "validated" if promotable else "rejected"
    manifest["validatedAt"] = format_timestamp(now or utc_now())
    atomic_write_json(manifest_path, manifest)
    return manifest


def append_release_event(
    manifest_path: Path,
    event_type: str,
    details: dict[str, Any] | None = None,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    manifest = load_json_object(manifest_path)
    event = {
        "type": event_type,
        "at": format_timestamp(now or utc_now()),
        "details": details or {},
    }
    manifest.setdefault("events", []).append(event)
    atomic_write_json(manifest_path, manifest)
    return manifest


def mark_release_service_stopped(
    manifest_path: Path,
    service: str,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    effective_now = now or utc_now()
    manifest = load_json_object(manifest_path)
    manifest["serviceStoppedAt"] = format_timestamp(effective_now)
    manifest.setdefault("events", []).append(
        {
            "type": "graph_service_stopped",
            "at": format_timestamp(effective_now),
            "details": {"service": service},
        }
    )
    atomic_write_json(manifest_path, manifest)
    return manifest


def _stamp_superseded(
    previous_manifest_path: Path,
    release_id: str,
    now: datetime,
    policy: dict[str, Any],
) -> None:
    """Record on the previous release what replaces it and until when it can return."""
    previous = load_json_object(previous_manifest_path)
    previous["supersededByReleaseId"] = release_id
    previous["rollbackWindowEndsAt"] = format_timestamp(
        now + timedelta(hours=policy["operations"]["rollbackWindowHours"])
    )
    atomic_write_json(previous_manifest_path, previous)


def mark_manifest_cutover_started(
    manifest_path: Path,
    previous_manifest_path: Path,
    *,
    now: datetime | None = None,
    policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Record the cutover before the agent is switched.

    From here until `mark_manifest_promoted`, a validated manifest the agent
    names is an unfinished cutover. The previous release already carries its
    rollback window, so a run that finds this state can restore it.
    """
    effective_now = now or utc_now()
    manifest = load_json_object(manifest_path)
    if manifest.get("promotionState") != "validated":
        raise ValueError("Only a validated release can be cut over to")
    _stamp_superseded(
        previous_manifest_path,
        manifest["releaseId"],
        effective_now,
        policy or load_release_policy(),
    )
    return append_release_event(
        manifest_path,
        "cutover_started",
        {"previousReleaseId": load_json_object(previous_manifest_path)["releaseId"]},
        now=effective_now,
    )


def mark_manifest_promoted(
    manifest_path: Path,
    *,
    previous_manifest_path: Path | None = None,
    now: datetime | None = None,
    policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    effective_now = now or utc_now()
    policy = policy or load_release_policy()
    manifest = load_json_object(manifest_path)
    if manifest.get("promotionState") != "validated":
        raise ValueError("Only a validated release can be promoted")

    # The window was first recorded before the switch; it now runs from the
    # verified promotion.
    if previous_manifest_path:
        _stamp_superseded(
            previous_manifest_path, manifest["releaseId"], effective_now, policy
        )

    manifest["promotionState"] = "promoted"
    manifest["promotedAt"] = format_timestamp(effective_now)
    atomic_write_json(manifest_path, manifest)
    return manifest


def mark_manifest_rolled_back(
    current_manifest_path: Path,
    previous_manifest_path: Path,
    *,
    now: datetime | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    effective_now = now or utc_now()
    previous = load_json_object(previous_manifest_path)
    require_rollback_available(previous, now=effective_now)
    return mark_manifest_cutover_restored(
        current_manifest_path,
        previous_manifest_path,
        now=effective_now,
    )


def mark_manifest_cutover_restored(
    current_manifest_path: Path,
    previous_manifest_path: Path,
    *,
    now: datetime | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Record an already-verified target restoration without a window check."""
    effective_now = now or utc_now()
    current = load_json_object(current_manifest_path)
    previous = load_json_object(previous_manifest_path)
    current["promotionState"] = "rolled_back"
    current["rolledBackAt"] = format_timestamp(effective_now)
    current["rolledBackToReleaseId"] = previous["releaseId"]
    previous["promotionState"] = "promoted"
    previous["rollbackRestoredAt"] = format_timestamp(effective_now)
    previous["rollbackFromReleaseId"] = current["releaseId"]
    if previous.get("supersededByReleaseId") == current["releaseId"]:
        previous.pop("supersededByReleaseId")
        previous["rollbackWindowEndsAt"] = None
    atomic_write_json(previous_manifest_path, previous)
    atomic_write_json(current_manifest_path, current)
    return current, previous


def mark_manifest_recovery_pending(
    manifest_path: Path,
    previous_release_id: str,
    reason: str,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Durably record that the previous serving target must be restored."""
    normalized_reason = reason.strip()
    if not normalized_reason:
        raise ValueError("Cutover recovery reason is required")
    manifest = load_json_object(manifest_path)
    manifest["promotionState"] = "recovery_pending"
    manifest["recoveryTargetReleaseId"] = previous_release_id
    manifest.setdefault("events", []).append(
        {
            "type": "cutover_recovery_pending",
            "at": format_timestamp(now or utc_now()),
            "details": {
                "reason": normalized_reason[:2_000],
                "previousReleaseId": previous_release_id,
            },
        }
    )
    atomic_write_json(manifest_path, manifest)
    return manifest


def _parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def require_rollback_available(
    previous_manifest: dict[str, Any],
    *,
    now: datetime | None = None,
) -> None:
    deadline = _parse_timestamp(previous_manifest.get("rollbackWindowEndsAt"))
    if deadline is None:
        raise ValueError("The corpus rollback window is not recorded")
    if (now or utc_now()).astimezone(UTC) > deadline:
        raise ValueError("The 24-hour corpus rollback window has expired")


# `release-retention-check` exits with this status when the target colour still
# holds a release inside its rollback window. The reset is deferred, not failed:
# the corpus job (RELEASE_DEFERRED_EXIT in scripts/ops/railway-corpus-job.sh)
# leaves the snapshot unacknowledged and finishes its other work. 75 is taken:
# the job script exits 75 when another run holds the volume lock.
RESET_DEFERRED_EXIT_CODE = 20


def find_color_retention_blocker(
    releases_dir: Path,
    target_color: str,
    *,
    now: datetime | None = None,
) -> dict[str, Any] | None:
    """Return the release still inside its rollback window on a graph color.

    The rollback window is the only reset deadline: while it is open the
    superseded graph must stay intact, and once it has closed (or a restore
    has cleared it) the color may be rebuilt.
    """
    effective_now = (now or utc_now()).astimezone(UTC)
    blockers: list[dict[str, Any]] = []
    for path in sorted(releases_dir.glob("*.json")):
        try:
            manifest = load_json_object(path)
        except (OSError, ValueError, json.JSONDecodeError):
            continue
        rollback_ends = _parse_timestamp(manifest.get("rollbackWindowEndsAt"))
        if (
            manifest.get("targetColor") == target_color
            and rollback_ends
            and rollback_ends > effective_now
        ):
            blockers.append(
                {
                    "releaseId": manifest.get("releaseId"),
                    "manifestPath": str(path),
                    "rollbackWindowEndsAt": format_timestamp(rollback_ends),
                }
            )
    return max(blockers, key=lambda item: item["rollbackWindowEndsAt"], default=None)


def find_cleanup_candidate(
    releases_dir: Path,
    *,
    current_release_id: str,
    inactive_color: str,
    now: datetime | None = None,
) -> dict[str, Any] | None:
    """Find a superseded graph whose 24-hour rollback window has elapsed."""
    effective_now = (now or utc_now()).astimezone(UTC)
    candidates: list[dict[str, Any]] = []
    for path in sorted(releases_dir.glob("*.json")):
        try:
            manifest = load_json_object(path)
        except (OSError, ValueError, json.JSONDecodeError):
            continue
        rollback_ends = _parse_timestamp(manifest.get("rollbackWindowEndsAt"))
        if (
            manifest.get("targetColor") == inactive_color
            and manifest.get("supersededByReleaseId") == current_release_id
            and not manifest.get("serviceStoppedAt")
            and rollback_ends
            and rollback_ends <= effective_now
        ):
            candidates.append(
                {
                    "releaseId": manifest.get("releaseId"),
                    "manifestPath": str(path),
                    "rollbackWindowEndsAt": format_timestamp(rollback_ends),
                }
            )
    return max(
        candidates,
        key=lambda item: item["rollbackWindowEndsAt"],
        default=None,
    )


def baseline_comparison_gaps(previous_manifest: dict[str, Any]) -> list[str]:
    """Compared metrics a previous manifest lacks; each fails its regression gate."""
    evaluation = previous_manifest.get("evaluationResults") or {}
    return [
        name
        for name in _BASELINE_COMPARISON_METRICS
        if _finite_number(evaluation.get(name)) is None
    ]


def unresolved_gate_failures(gates: Any) -> list[str]:
    """Names of the recorded gates that failed without an accepted override."""
    return [
        str(gate.get("name"))
        for gate in (gates if isinstance(gates, list) else [])
        if isinstance(gate, dict)
        and not gate.get("passed")
        and not gate.get("overrideReason")
    ]


def validated_manifest_is_promotable(manifest: dict[str, Any]) -> bool:
    """Re-evaluate a manifest's gates against the current policy.

    The overrides accepted when it was validated are applied again, and are
    again refused unless each is bound to this manifest's source snapshot and
    names a gate that may be overridden.
    """
    gates = apply_overrides(
        evaluate_release_manifest(manifest),
        manifest.get("gateOverrides") or {},
        manifest["sourceSnapshotHash"],
    )
    return release_is_promotable(gates)
