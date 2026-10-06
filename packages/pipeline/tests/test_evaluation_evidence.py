import json
from datetime import UTC, datetime

import pytest

from pipeline import evaluation_evidence as evidence
from pipeline.eval.dataset import load_dataset
from pipeline.release import atomic_write_json, create_release_manifest, load_json_object


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
            "overall_released": 2.95,
            "hallucination": 2.9,
            "withheld_count": 1,
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
    metrics = evidence.baseline_metrics(baseline)
    assert metrics["answerScore"] == 2.95
    assert metrics["answerScoreAllRows"] == 2.9
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


class FakeAnswerEval:
    """Stands in for the paid answer evaluation; every result is a fixture."""

    def __init__(self, results_dir, outcomes):
        self.results_dir = results_dir
        self.outcomes = list(outcomes)
        self.calls = 0

    def __call__(self):
        released, errors = self.outcomes[self.calls]
        self.calls += 1
        result = complete_result()
        result["run_id"] = f"run-{self.calls}"
        result["config"]["dataset_count"] = len(result["per_question"])
        result["aggregate"].update(
            overall=released, overall_released=released, withheld_count=0
        )
        for row in result["per_question"][:errors]:
            row["scores"] = {"error_type": "verifier"}
        self.results_dir.mkdir(parents=True, exist_ok=True)
        (self.results_dir / f"run-{self.calls}_answer.json").write_text(
            json.dumps(result)
        )
        return result


def building_manifest(tmp_path):
    path = tmp_path / "releases" / "release-2.json"
    atomic_write_json(
        path,
        create_release_manifest(
            release_id="release-2",
            commit_sha="abcdef1",
            target_color="green",
            source_snapshot_hash="a" * 64,
            created_at=datetime(2026, 10, 5, tzinfo=UTC),
        ),
    )
    return path


def collect(tmp_path, outcomes, *, max_voided=2):
    manifest = building_manifest(tmp_path)
    fake = FakeAnswerEval(tmp_path / "eval-results", outcomes)
    runs = evidence.collect_answer_runs(
        manifest,
        manifest.parent / "release-2",
        fake,
        results_dir=fake.results_dir,
        runs=3,
        max_voided=max_voided,
    )
    return manifest, fake, runs


def test_three_valid_answer_runs_are_collected_without_a_fourth(tmp_path):
    manifest, fake, runs = collect(tmp_path, [(2.6, 0), (2.8, 0), (2.9, 0)])

    assert fake.calls == 3
    assert [run["run_id"] for run in runs] == ["run-1", "run-2", "run-3"]
    stages = load_json_object(manifest)["stageResults"]
    assert [stages[f"answerEvaluation{n}"]["status"] for n in (1, 2, 3)] == ["passed"] * 3
    assert sorted(path.name for path in (manifest.parent / "release-2").iterdir()) == [
        "answer-evaluation-1.json",
        "answer-evaluation-2.json",
        "answer-evaluation-3.json",
    ]


def test_a_voided_answer_run_is_kept_excluded_and_run_again(tmp_path):
    # The second run hit a verifier outage on two questions. Its high score
    # must not count, and the low first run must not be replaced.
    manifest, fake, runs = collect(tmp_path, [(2.6, 0), (3.0, 2), (2.8, 0), (2.9, 0)])

    assert fake.calls == 4
    assert [run["run_id"] for run in runs] == ["run-1", "run-3", "run-4"]
    release = load_json_object(manifest)
    assert release["stageResults"]["answerEvaluation2"]["attempt"] == 2
    assert release["stageResults"]["answerEvaluation2"]["result"]["runId"] == "run-3"
    voided = [event for event in release["events"] if event["type"] == "answer_run_voided"]
    assert len(voided) == 1 and "run-2" in voided[0]["details"]["reason"]
    kept = json.loads(
        (manifest.parent / "release-2" / "answer-evaluation-voided-1.json").read_text()
    )
    assert kept["run_id"] == "run-2"
    assert json.loads(
        (manifest.parent / "release-2" / "answer-evaluation-2.json").read_text()
    )["run_id"] == "run-3"


def test_repeated_voided_answer_runs_stop_validation_before_any_gate(tmp_path):
    manifest = building_manifest(tmp_path)
    fake = FakeAnswerEval(
        tmp_path / "eval-results", [(2.9, 0), (2.9, 1), (2.9, 1), (2.9, 1), (2.9, 0)]
    )

    with pytest.raises(RuntimeError, match="only 1 of 3 were valid; no release gate"):
        evidence.collect_answer_runs(
            manifest,
            manifest.parent / "release-2",
            fake,
            results_dir=fake.results_dir,
            runs=3,
            max_voided=2,
        )

    assert fake.calls == 4
    release = load_json_object(manifest)
    assert release["promotionState"] == "building" and release["gates"] == []
    assert release["stageResults"]["answerEvaluation2"]["status"] == "failed"
    assert len(release["events"]) == 3


def test_release_validate_gates_on_the_mean_of_three_answer_runs(tmp_path, monkeypatch):
    from click.testing import CliRunner

    import pipeline.audit
    import pipeline.cli.release as cli_release
    import pipeline.eval.runner
    from pipeline.cli import cli
    from tests.test_release import audit_report, graph_metrics

    manifest = building_manifest(tmp_path)
    # Alone, the first run is under the 2.75 floor; the mean of the three is not.
    fake = FakeAnswerEval(tmp_path / "eval-results", [(2.6, 0), (2.8, 0), (2.9, 0)])

    def run_eval(level):
        if level == "answer":
            return fake()
        result = complete_result()
        result["run_id"] = "retrieval-1"
        (fake.results_dir / "retrieval-1_retrieval.json").write_text(json.dumps(result))
        return result

    fake.results_dir.mkdir(parents=True)
    monkeypatch.setattr(pipeline.eval.runner, "run_eval", run_eval)
    monkeypatch.setattr(
        pipeline.audit, "run_corpus_audit",
        lambda **paths: {"report": audit_report()},
    )
    monkeypatch.setattr(evidence, "evaluation_fingerprint", lambda: {"model": "frozen"})
    monkeypatch.setattr(cli_release, "EVAL_RESULTS_DIR", fake.results_dir)
    monkeypatch.setattr(cli_release, "_require_parse_inventory_unchanged", lambda release: {})
    monkeypatch.setattr(cli_release, "inspect_release_graph", lambda *args: graph_metrics())
    monkeypatch.setattr(cli_release, "mark_graph_release", lambda release: {"releaseId": release["releaseId"]})

    outcome = CliRunner().invoke(cli, ["release-validate", "--manifest", str(manifest)])

    assert outcome.exit_code == 0, outcome.output
    assert fake.calls == 3
    release = load_json_object(manifest)
    assert release["promotionState"] == "validated"
    assert release["evaluationResults"]["answerRuns"] == 3
    assert release["evaluationResults"]["answerScore"] == pytest.approx((2.6 + 2.8 + 2.9) / 3)
    assert len(release["verificationSummaries"]) == 3
