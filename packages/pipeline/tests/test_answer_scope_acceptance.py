import copy

import pytest

from pipeline.eval.answer_scope import CASES, run_scope_acceptance
from pipeline.answer_scope import scope_policy
from pipeline.release import apply_overrides, evaluate_release_manifest


def passing_manifest():
    return {
        "auditResults": {
            "duplicateIdentities": 0,
            "missingAnswerReadyLoads": 0,
            "requiredCurrentParseExceptions": 0,
            "embeddingCoverage": 1,
            "invalidEmbeddingDimensions": 0,
            "requiredSourceFamiliesPresent": 1,
            "freshnessSlaMet": 1,
        },
        "evaluationResults": {
            "retrievalPrecision": 0.2,
            "retrievalRecall": 0.91,
            "primaryDocumentHitRate": 0.96,
            "answerScore": 2.8,
            "hallucinationScore": 2.6,
            "withheldAnswers": 2,
            "benchmarkQuestions": 55,
            "answerRuns": 3,
            "aggregateRegression": 0.1,
        },
        "counts": {"maxSourceFamilyDocumentDrop": 0.01, "answerReadyDrop": 0.01},
    }


def test_live_acceptance_requires_two_complete_runs_and_explicit_expected_outcomes(
    monkeypatch,
):
    from pipeline import evaluation_evidence

    monkeypatch.setattr(
        evaluation_evidence, "evaluation_fingerprint", lambda: {"model": "frozen"}
    )
    calls = []

    def invoke(question, **_kwargs):
        calls.append(question)
        case = next(case for case in CASES if case[1] == question)
        negative = case[2] == "withheld"
        answer = "Not released" if negative else "Answer " + " ".join(case[3])
        verifier = {
            "coverage_policy_id": scope_policy()["id"],
            "verifier_unavailable": False,
            "outcome": {"status": case[2]},
            "coverage_issue": "Unavailable original" if negative else None,
            "pass_count": 0 if negative else 1,
            "supported": not negative,
            "citations_complete": not negative,
        }
        return answer, {}, verifier, {"sources": []}

    result = run_scope_acceptance("sha256:" + "a" * 64, invoke=invoke)
    assert result["all_passed"] is True
    assert len(result["runs"]) == len(calls) == 16
    assert all(calls.count(case[1]) == 2 for case in CASES)


def test_verifier_outage_cannot_count_as_a_safe_negative_case(monkeypatch):
    from pipeline import evaluation_evidence

    monkeypatch.setattr(evaluation_evidence, "evaluation_fingerprint", lambda: {})

    def invoke(_question, **_kwargs):
        return (
            "Withheld",
            {},
            {
                "coverage_policy_id": scope_policy()["id"],
                "verifier_unavailable": True,
                "outcome": {"status": "withheld"},
                "coverage_issue": "No evidence",
                "pass_count": 0,
            },
            {},
        )

    assert run_scope_acceptance("a" * 64, invoke=invoke)["all_passed"] is False


def scoped_manifest():
    manifest = passing_manifest()
    manifest.update(
        {
            "answerScopePolicyHash": "policy",
            "answerScopeImplementationHash": "implementation",
            "sourceSnapshotHash": "snapshot",
            "evaluationFingerprint": {"model": "frozen"},
        }
    )
    receipt = {
        "all_passed": True,
        "policy_hash": "policy",
        "implementation_hash": "implementation",
        "source_snapshot_hash": "snapshot",
        "evaluation_fingerprint": {"model": "frozen"},
        "runs": [
            {"case_id": case, "repeat": repeat, "passed": True}
            for case in scope_policy()["qualification_cases"]
            for repeat in [1, 2]
        ],
    }
    manifest["stageResults"] = {
        "answerScopeAcceptance": {"status": "passed", "result": receipt}
    }
    return manifest


@pytest.mark.parametrize(
    "change",
    [
        "missing",
        "failed",
        "partial",
        "duplicate",
        "snapshot",
        "implementation",
        "configuration",
        "policy",
    ],
)
def test_scoped_promotion_cannot_skip_or_override_live_acceptance(change):
    manifest = copy.deepcopy(scoped_manifest())
    stage = manifest["stageResults"]["answerScopeAcceptance"]
    if change == "missing":
        manifest["stageResults"] = {}
    elif change == "failed":
        stage["status"] = "failed"
    elif change == "partial":
        stage["result"]["runs"].pop()
    elif change == "duplicate":
        stage["result"]["runs"][-1] = stage["result"]["runs"][0]
    else:
        key = {
            "snapshot": "source_snapshot_hash",
            "implementation": "implementation_hash",
            "configuration": "evaluation_fingerprint",
            "policy": "policy_hash",
        }[change]
        stage["result"][key] = "changed"
    gates = evaluate_release_manifest(manifest)
    gate = next(g for g in gates if g["name"] == "answerScopeAcceptancePassed")
    assert gate["passed"] is False and gate["overridable"] is False
    with pytest.raises(ValueError):
        apply_overrides(
            gates,
            {
                "answerScopeAcceptancePassed": "A long operator explanation cannot waive the mandatory boundary checks."
            },
        )


def test_complete_matching_scope_acceptance_passes():
    assert all(gate["passed"] for gate in evaluate_release_manifest(scoped_manifest()))
