"""Comparable, complete evaluation evidence for the initial legacy cutover."""

import hashlib
import json
import math
import os
import shutil
import statistics
from collections.abc import Callable
from pathlib import Path
from pipeline.source_lifecycle import stable_hash

from pipeline.config import (
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
    EVAL_DEFAULT_TOP_K,
    EVAL_JUDGE_MODEL,
    GOLDEN_DATASET_PATH,
)
from pipeline.release import (
    REPO_ROOT,
    append_release_event,
    build_release_evaluation_results,
    record_release_stage,
)


def evaluation_fingerprint() -> dict:
    if os.environ.get("VERIFIER_ENABLED", "true").lower() == "false":
        raise ValueError("Release evaluations require answer verification")
    if not os.environ.get("EVAL_IDENTITY_CATALOG"):
        raise ValueError("Release evaluations require a frozen EVAL_IDENTITY_CATALOG")
    # The agent's dotenv loader must not override the release's verifier setting.
    os.environ["VERIFIER_ENABLED"] = "true"
    os.environ["MASTRA_OBSERVABILITY_PATH"] = ":memory:"
    sources = {}
    for package in ["agent", "contracts", "policy-corpus", "pipeline"]:
        for path in sorted((REPO_ROOT / "packages" / package / "src").rglob("*")):
            if path.is_file() and path.suffix in {".py", ".ts", ".json"}:
                sources[str(path.relative_to(REPO_ROOT))] = hashlib.sha256(
                    path.read_bytes()
                ).hexdigest()
    for rel in [
        "package-lock.json",
        "packages/pipeline/uv.lock",
        "corpus-manifest.json",
        "corpus-release-policy.json",
    ]:
        sources[rel] = hashlib.sha256((REPO_ROOT / rel).read_bytes()).hexdigest()
    return {
        "benchmarkHash": hashlib.sha256(GOLDEN_DATASET_PATH.read_bytes()).hexdigest(),
        "implementationHash": hashlib.sha256(
            json.dumps(sources, sort_keys=True).encode()
        ).hexdigest(),
        "embeddingModel": EMBEDDING_MODEL,
        "embeddingDimensions": EMBEDDING_DIMENSIONS,
        "topK": EVAL_DEFAULT_TOP_K,
        "judgeModel": EVAL_JUDGE_MODEL,
        **jev_evaluation_identity(),
        "modelEnvironment": {
            key: value
            for key, value in sorted(os.environ.items())
            if (
                key.endswith("_MODEL")
                or key.endswith("_TEMPERATURE")
                or key in {"VERIFIER_ENABLED", "VERIFIER_MAX_SOURCE_TOKENS"}
            )
            and not any(secret in key for secret in ["KEY", "TOKEN", "SECRET"])
        },
        **({"validationPricingHash": stable_hash(json.loads(Path(os.environ["JEV_VALIDATION_PRICING"]).read_text())),
            "validationCorpusHash": validation_corpus_hash()}
           if os.environ.get("JEV_VALIDATION_LEDGER") else {}),
        "verificationRequired": True,
        "evidenceNormalization": {
            "version": 1,
            "catalogHash": stable_hash(
                json.loads(Path(os.environ["EVAL_IDENTITY_CATALOG"]).read_text())[
                    "sections"
                ]
            )
            if os.environ.get("EVAL_IDENTITY_CATALOG")
            else None,
        },
    }


def infrastructure_error_rows(result: dict) -> list[str]:
    """IDs of rows that record an agent, judge or verifier outage, not a score."""
    return [
        str(row.get("id", row.get("question_id")))
        for row in result.get("per_question", [])
        if row.get("error") or (row.get("scores") or {}).get("error_type")
    ]


class VoidedAnswerRun(RuntimeError):
    """An answer run that measured an outage instead of the candidate graph."""


def collect_answer_runs(
    manifest_path: Path,
    release_dir: Path,
    run_answer_eval: Callable[[], dict],
    *,
    results_dir: Path,
    runs: int,
    max_voided: int,
) -> list[dict]:
    """Run the candidate answer evaluation until `runs` runs are valid.

    The gates read the mean of these runs. A run with an infrastructure error
    is voided: kept as evidence, recorded in the manifest, left out of the mean
    and run again. Only the first `runs` valid runs count, so a valid low run
    is never replaced. More than `max_voided` voided runs stops validation
    before any gate is evaluated, because each run is paid.
    """
    valid: list[dict] = []
    voided = 0

    def operation() -> dict:
        result = run_answer_eval()
        if "error" in result:
            raise RuntimeError(result["error"])
        errors = infrastructure_error_rows(result)
        destination = release_dir / (
            f"answer-evaluation-voided-{voided + 1}.json"
            if errors
            else f"answer-evaluation-{len(valid) + 1}.json"
        )
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(results_dir / f"{result['run_id']}_answer.json", destination)
        if errors:
            raise VoidedAnswerRun(
                f"answer run {result['run_id']} voided by infrastructure errors "
                f"on {len(errors)} question(s): {', '.join(errors)}; "
                f"evidence kept at {destination}"
            )
        valid.append(result)
        return {
            "runId": result["run_id"],
            "aggregate": result["aggregate"],
            "evidencePath": str(destination),
        }

    while len(valid) < runs:
        try:
            record_release_stage(
                manifest_path, f"answerEvaluation{len(valid) + 1}", operation
            )
        except VoidedAnswerRun as error:
            voided += 1
            append_release_event(
                manifest_path, "answer_run_voided", {"reason": str(error)[:2_000]}
            )
            if voided > max_voided:
                raise RuntimeError(
                    f"{voided} answer runs were voided by infrastructure errors "
                    f"and only {len(valid)} of {runs} were valid; no release gate "
                    "was evaluated. Fix the outage and validate again."
                ) from error
    return valid


def require_complete_results(retrieval: dict, answer: dict) -> None:
    from pipeline.eval.dataset import load_dataset

    expected = {row["id"] for row in load_dataset()}
    for result in [retrieval, answer]:
        rows = result.get("per_question", [])
        ids = [row.get("id", row.get("question_id")) for row in rows]
        if len(ids) != len(expected) or set(ids) != expected:
            raise ValueError(
                "Release evidence must cover the complete benchmark exactly once"
            )
        if infrastructure_error_rows(result):
            raise ValueError(
                "Evaluation infrastructure errors invalidate release evidence"
            )
    normalizations = [
        result.get("config", {}).get("evidence_normalization")
        for result in [retrieval, answer]
    ]
    if not all(normalizations) or any(
        n.get("version") != 1 or not n.get("mappingHash") for n in normalizations
    ):
        raise ValueError(
            "Release comparisons require evidence identity mappings for both evaluation levels"
        )
    if (
        normalizations[0]["catalogHash"] != normalizations[1]["catalogHash"]
        or normalizations[0]["mappingHash"] != normalizations[1]["mappingHash"]
    ):
        raise ValueError(
            "Evaluation graph identity changed between retrieval and answer runs"
        )
    for normalization in normalizations:
        if (
            not isinstance(normalization.get("mappings"), list)
            or stable_hash(normalization["mappings"]) != normalization["mappingHash"]
        ):
            raise ValueError("Evidence identity mapping hash mismatch")
        catalog_path = os.environ.get("EVAL_IDENTITY_CATALOG")
        if (
            catalog_path
            and stable_hash(json.loads(Path(catalog_path).read_text())["sections"])
            != normalization["catalogHash"]
        ):
            raise ValueError("Evaluation identity catalog mismatch")
    verification_summary(answer)


def verification_summary(answer: dict) -> dict:
    counts = {"passed": 0, "corrected": 0, "withheld": 0}
    latencies = []
    reasons = {}
    for row in answer.get("per_question", []):
        verifier = row.get("verifier") or {}
        outcome = verifier.get("outcome") or {}
        status = outcome.get("status")
        latency = verifier.get("latency_ms")
        passes = verifier.get("pass_count")
        if (
            status not in counts
            or passes not in {0, 1, 2}
            or (status != "withheld" and passes == 0)
            or not isinstance(latency, (int, float))
            or not math.isfinite(latency)
            or latency < 0
        ):
            raise ValueError("Every answer needs valid server verification telemetry")
        counts[status] += 1
        latencies.append(latency)
        if status == "withheld":
            reason = verifier.get("withholding_reason")
            if not reason:
                raise ValueError("Withheld answers need a reason")
            reasons[reason] = reasons.get(reason, 0) + 1
    if not latencies:
        raise ValueError("No answer verification evidence")
    return {
        "outcomes": counts,
        "withholdingRate": counts["withheld"] / len(latencies),
        "withholdingReasons": reasons,
        "latencyMsMedian": statistics.median(latencies),
        "latencyMsP95": sorted(latencies)[math.ceil(len(latencies) * 0.95) - 1],
    }


def baseline_metrics(evidence: dict) -> dict:
    if (
        evidence.get("schemaVersion") != 1
        or evidence.get("fingerprint") != evaluation_fingerprint()
    ):
        raise ValueError(
            "Baseline benchmark or implementation/model configuration mismatch"
        )
    require_complete_results(evidence["retrieval"], evidence["answer"])
    return build_release_evaluation_results(
        evidence["retrieval"], [evidence["answer"]], None
    )


def jev_evaluation_identity() -> dict:
    roles = os.environ.get("JEV_SECTION_ROLES_ENABLED") == "true"
    scope = os.environ.get("SCOPE_GATE_PROVIDER", "").strip() or "openai"
    if not roles and scope == "openai":
        return {}
    annotation_digest = None
    if roles:
        from pipeline.graph.connection import get_session
        with get_session() as session:
            record = session.run("MATCH (m:JevAnnotation {id: 'current'}) RETURN m.digest AS digest").single()
            annotation_digest = record["digest"] if record else None
        if not annotation_digest:
            raise ValueError("Jev section evaluation requires a frozen graph annotation digest")
        from pipeline.jev.sections import validate_graph_labels
        validate_graph_labels(annotation_digest)
    return {"jev": {"sectionRolesEnabled": roles, "scopeProvider": scope,
                    "annotationDigest": annotation_digest, "model": "jev-1.13.0",
                    "allowedRoles": sorted(set(filter(None, (r.strip() for r in os.environ.get("JEV_SECTION_ROLE_ALLOWLIST", "").split(",")))))}}


def validation_corpus_hash() -> str:
    from pipeline.jev.sections import iter_graph_sections, section_input
    from pipeline.jev.client import digest
    return digest([{ "id": r["id"], "documentId": r["documentId"], "inputHash": digest(section_input(r))}
                   for r in iter_graph_sections()])
