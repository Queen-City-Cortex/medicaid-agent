"""Comparable, complete evaluation evidence for the initial legacy cutover."""

import hashlib
import json
import math
import os
import statistics

from pipeline.config import (
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
    EVAL_DEFAULT_TOP_K,
    EVAL_JUDGE_MODEL,
    GOLDEN_DATASET_PATH,
)
from pipeline.release import REPO_ROOT, build_release_evaluation_results


def evaluation_fingerprint() -> dict:
    if os.environ.get("VERIFIER_ENABLED", "true").lower() == "false":
        raise ValueError("Release evaluations require answer verification")
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
        "modelEnvironment": {
            key: value
            for key, value in sorted(os.environ.items())
            if (
                key.endswith("_MODEL")
                or key.endswith("_TEMPERATURE")
                or key.startswith("VERIFIER_")
            )
            and not any(secret in key for secret in ["KEY", "TOKEN", "SECRET"])
        },
        "verificationRequired": True,
    }


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
        if any(
            row.get("error") or (row.get("scores") or {}).get("error_type")
            for row in rows
        ):
            raise ValueError(
                "Evaluation infrastructure errors invalidate release evidence"
            )
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
        evidence["retrieval"], evidence["answer"], None
    )
