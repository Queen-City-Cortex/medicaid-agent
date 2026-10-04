"""Versioned corpus release manifests and non-bypassable promotion gates."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, TypeVar

from pipeline.config import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL


REPO_ROOT = Path(__file__).resolve().parents[4]
POLICY_PATH = REPO_ROOT / "corpus-release-policy.json"
_COMMIT_SHA = re.compile(r"^[0-9a-f]{7,40}$")
_COLORS = frozenset({"blue", "green"})
_ACTIVE_REGISTRY_STATUSES = frozenset({"downloaded", "updated", "unchanged"})
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
    if policy.get("policyVersion") != 2:
        raise ValueError("Unsupported corpus release policy version")
    for section in ("mandatory", "overridable", "evaluation", "operations"):
        if not isinstance(policy.get(section), dict):
            raise ValueError(f"Release policy is missing {section}")
    return policy


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
        "volumeRetainUntil": None,
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
        if document.get("registry_status") not in _ACTIVE_REGISTRY_STATUSES:
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
        and document.get("registry_status") in _ACTIVE_REGISTRY_STATUSES
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


def build_release_evaluation_results(
    retrieval_result: dict[str, Any],
    answer_result: dict[str, Any],
    previous_manifest: dict[str, Any] | None,
) -> dict[str, float]:
    retrieval = retrieval_result.get("aggregate", {})
    answer = answer_result.get("aggregate", {})
    candidates = {
        "retrievalPrecision": retrieval.get("precision_at_k"),
        "retrievalRecall": retrieval.get("recall_at_k"),
        "primaryDocumentHitRate": retrieval.get("primary_hit_rate"),
        "answerScore": answer.get("overall"),
        "hallucinationScore": answer.get("hallucination"),
    }
    evaluation = {
        key: value
        for key, raw_value in candidates.items()
        if (value := _finite_number(raw_value)) is not None
    }

    previous_evaluation = (
        previous_manifest.get("evaluationResults", {})
        if previous_manifest
        else {}
    )
    regressions = [
        max(0.0, float(previous_evaluation[key]) - current)
        for key, current in evaluation.items()
        if _finite_number(previous_evaluation.get(key)) is not None
    ]
    evaluation["aggregateRegression"] = max(regressions, default=0.0)
    return evaluation


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
            "aggregateRegression",
            evaluation.get("aggregateRegression"),
            evaluation_policy["maxAggregateRegression"],
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


def apply_overrides(
    gates: list[dict[str, Any]],
    overrides: dict[str, str],
) -> list[dict[str, Any]]:
    """Apply documented reasons only to the three explicitly overridable gates."""
    by_name = {gate["name"]: gate for gate in gates}
    unknown = sorted(set(overrides) - set(by_name))
    if unknown:
        raise ValueError(f"Unknown release gate override(s): {', '.join(unknown)}")

    updated = [dict(gate) for gate in gates]
    updated_by_name = {gate["name"]: gate for gate in updated}
    for name, reason in overrides.items():
        gate = updated_by_name[name]
        if not gate["overridable"]:
            raise ValueError(f"Release gate {name} cannot be overridden")
        normalized = reason.strip()
        if len(normalized) < 10:
            raise ValueError(
                f"Override reason for {name} must contain at least 10 characters"
            )
        if not gate["passed"]:
            gate["overrideReason"] = normalized[:2_000]
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


def finalize_release_manifest(
    manifest_path: Path,
    *,
    audit_report: dict[str, Any],
    graph_metrics: dict[str, Any],
    retrieval_result: dict[str, Any],
    answer_result: dict[str, Any],
    previous_manifest: dict[str, Any] | None,
    overrides: dict[str, str] | None = None,
    baseline_evaluation: dict[str, float] | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    manifest = load_json_object(manifest_path)
    manifest["counts"] = build_release_counts(audit_report, previous_manifest)
    manifest["auditResults"] = build_release_audit_results(
        audit_report,
        graph_metrics,
    )
    manifest["evaluationResults"] = build_release_evaluation_results(
        retrieval_result,
        answer_result,
        {"evaluationResults": baseline_evaluation} if baseline_evaluation is not None else previous_manifest,
    )
    gates = evaluate_release_manifest(manifest)
    manifest["gates"] = apply_overrides(gates, overrides or {})
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
            "details": {
                "service": service,
                "volumeRetainUntil": manifest.get("volumeRetainUntil"),
            },
        }
    )
    atomic_write_json(manifest_path, manifest)
    return manifest


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

    if previous_manifest_path:
        previous = load_json_object(previous_manifest_path)
        previous["supersededByReleaseId"] = manifest["releaseId"]
        previous["rollbackWindowEndsAt"] = format_timestamp(
            effective_now
            + timedelta(hours=policy["operations"]["rollbackWindowHours"])
        )
        previous["volumeRetainUntil"] = format_timestamp(
            effective_now
            + timedelta(days=policy["operations"]["volumeRetentionDays"])
        )
        atomic_write_json(previous_manifest_path, previous)

    # Record the rollback window before declaring the new release promoted.
    # If the second write fails, the shell orchestrator restores the previous
    # target and can still reason about its rollback/retention deadlines.
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
        previous["volumeRetainUntil"] = None
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


def find_color_retention_blocker(
    releases_dir: Path,
    target_color: str,
    *,
    now: datetime | None = None,
) -> dict[str, Any] | None:
    """Return the retained release that prevents resetting a graph color."""
    effective_now = (now or utc_now()).astimezone(UTC)
    blockers: list[dict[str, Any]] = []
    for path in sorted(releases_dir.glob("*.json")):
        try:
            manifest = load_json_object(path)
        except (OSError, ValueError, json.JSONDecodeError):
            continue
        retain_until = _parse_timestamp(manifest.get("volumeRetainUntil"))
        if (
            manifest.get("targetColor") == target_color
            and retain_until
            and retain_until > effective_now
        ):
            blockers.append(
                {
                    "releaseId": manifest.get("releaseId"),
                    "manifestPath": str(path),
                    "volumeRetainUntil": format_timestamp(retain_until),
                }
            )
    return max(blockers, key=lambda item: item["volumeRetainUntil"], default=None)


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
                    "volumeRetainUntil": manifest.get("volumeRetainUntil"),
                }
            )
    return max(
        candidates,
        key=lambda item: item["rollbackWindowEndsAt"],
        default=None,
    )
