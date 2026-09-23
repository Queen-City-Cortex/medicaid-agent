import pytest

from pipeline import evaluation_evidence as evidence
from pipeline.eval.dataset import load_dataset


def complete_result():
    return {
        "config": {
            "evidence_normalization": {
                "version": 1,
                "catalogHash": "c",
                "mappingHash": evidence.stable_hash([]),
                "mappings": [],
            }
        },
        "per_question": [
            {
                "question_id": item["id"],
                "verifier": {
                    "outcome": {"status": "passed"},
                    "pass_count": 1,
                    "latency_ms": 1000,
                },
            }
            for item in load_dataset()
        ],
        "aggregate": {
            "precision_at_k": 0.2,
            "recall_at_k": 0.95,
            "primary_hit_rate": 0.98,
            "overall": 2.9,
            "hallucination": 2.9,
        },
    }


def test_baseline_requires_matching_benchmark_code_and_models(monkeypatch):
    monkeypatch.setattr(
        evidence,
        "evaluation_fingerprint",
        lambda: {"benchmarkHash": "expected", "model": "one"},
    )
    baseline = {
        "schemaVersion": 1,
        "fingerprint": evidence.evaluation_fingerprint(),
        "retrieval": complete_result(),
        "answer": complete_result(),
    }
    assert evidence.baseline_metrics(baseline)["answerScore"] == 2.9
    for key, value in [("benchmarkHash", "other"), ("model", "two")]:
        changed = {**baseline, "fingerprint": {**baseline["fingerprint"], key: value}}
        with pytest.raises(ValueError, match="mismatch"):
            evidence.baseline_metrics(changed)


def test_partial_duplicate_and_error_results_fail():
    clean = complete_result()
    for rows in [
        clean["per_question"][:-1],
        [clean["per_question"][0]] * len(clean["per_question"]),
        [{**row, "error": "provider outage"} for row in clean["per_question"]],
    ]:
        with pytest.raises(ValueError):
            evidence.require_complete_results({"per_question": rows}, clean)


def test_verifier_cannot_be_disabled(monkeypatch):
    monkeypatch.setenv("VERIFIER_ENABLED", "false")
    with pytest.raises(ValueError, match="verification"):
        evidence.evaluation_fingerprint()


def test_missing_verification_or_invalid_latency_cannot_be_release_evidence():
    for verifier in [
        None,
        {},
        {"outcome": {"status": "passed"}, "pass_count": 1, "latency_ms": float("nan")},
    ]:
        answer = complete_result()
        answer["per_question"][0]["verifier"] = verifier
        with pytest.raises(ValueError, match="telemetry"):
            evidence.require_complete_results(complete_result(), answer)


def test_withholding_and_latency_are_reported():
    answer = complete_result()
    answer["per_question"][0]["verifier"] = {
        "outcome": {"status": "withheld"},
        "pass_count": 2,
        "latency_ms": 4000,
        "withholding_reason": "unsupported",
    }
    summary = evidence.verification_summary(answer)
    assert summary["withholdingRate"] == 1 / len(answer["per_question"])
    assert summary["latencyMsMedian"] == 1000
    assert summary["withholdingReasons"] == {"unsupported": 1}


def test_graph_specific_mappings_do_not_enter_common_fingerprint():
    result = complete_result()
    missing = {**result, "config": {}}
    with pytest.raises(ValueError, match="identity mappings"):
        evidence.require_complete_results(missing, result)
    changed = {
        **result,
        "config": {
            "evidence_normalization": {
                "version": 1,
                "catalogHash": "c",
                "mappingHash": "different",
            }
        },
    }
    with pytest.raises(ValueError, match="graph identity changed"):
        evidence.require_complete_results(result, changed)


def test_tampered_identity_mapping_invalidates_comparison():
    result = complete_result()
    result["config"]["evidence_normalization"]["mappings"] = [{"raw_id": "changed"}]
    with pytest.raises(ValueError, match="mapping hash mismatch"):
        evidence.require_complete_results(result, result)
