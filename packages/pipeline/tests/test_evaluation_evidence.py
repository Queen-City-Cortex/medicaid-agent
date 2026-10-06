import json
from datetime import UTC, datetime

import pytest

from pipeline import evaluation_evidence as evidence
from pipeline.release import atomic_write_json, create_release_manifest, load_json_object

# These tests exercise the gates with the benchmark size the release policy's
# withheld-answer cap is set for, whatever the golden dataset holds today.
BENCHMARK = [{"id": f"q-{number:03d}", "status": "validated"} for number in range(1, 56)]


@pytest.fixture(autouse=True)
def benchmark_of_the_size_the_policy_was_set_for(monkeypatch):
    monkeypatch.setattr("pipeline.eval.dataset.load_dataset", lambda path=None: BENCHMARK)


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
            for item in BENCHMARK
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


def validate_release(
    tmp_path, monkeypatch, outcomes, *, recall=0.95, baseline=True, baseline_evidence=None,
    scoped=False, overrides=None,
):
    """Run `release-validate` with every graph, audit and model call faked."""
    from click.testing import CliRunner

    import pipeline.audit
    import pipeline.cli.release as cli_release
    import pipeline.eval.runner
    from pipeline.cli import cli
    from tests.test_release import audit_report, baseline as previous_release, graph_metrics

    manifest = building_manifest(tmp_path)
    if scoped:
        atomic_write_json(
            manifest, {**load_json_object(manifest), "answerScopePolicyHash": "reviewed"}
        )
    fake = FakeAnswerEval(tmp_path / "eval-results", outcomes)

    def run_eval(level):
        if level == "answer":
            return fake()
        result = complete_result()
        result["run_id"] = "retrieval-1"
        result["aggregate"]["recall_at_k"] = recall
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

    arguments = ["release-validate", "--manifest", str(manifest)]
    if baseline_evidence:
        path = tmp_path / "legacy-baseline.json"
        path.write_text(json.dumps(baseline_evidence))
        arguments += ["--baseline-evidence", str(path)]
    if overrides is not None:
        path = tmp_path / "overrides.json"
        path.write_text(json.dumps(overrides))
        arguments += ["--override-file", str(path)]
    if baseline and not baseline_evidence:
        previous = tmp_path / "releases" / "release-1.json"
        atomic_write_json(previous, previous_release())
        arguments += ["--previous-manifest", str(previous)]
    outcome = CliRunner().invoke(cli, arguments)
    return outcome, fake, manifest


def test_release_validate_gates_on_the_mean_of_three_answer_runs(tmp_path, monkeypatch):
    # Alone, the first run is under the 2.75 floor; the mean of the three is not.
    outcome, fake, manifest = validate_release(
        tmp_path, monkeypatch, [(2.6, 0), (2.8, 0), (2.9, 0)]
    )

    assert outcome.exit_code == 0, outcome.output
    assert fake.calls == 3
    release = load_json_object(manifest)
    assert release["promotionState"] == "validated"
    assert release["evaluationResults"]["answerRuns"] == 3
    assert release["evaluationResults"]["answerScore"] == pytest.approx((2.6 + 2.8 + 2.9) / 3)
    assert len(release["verificationSummaries"]) == 3


def test_release_validate_stops_on_a_retrieval_floor_breach_before_the_answer_stage(
    tmp_path, monkeypatch
):
    outcome, fake, manifest = validate_release(
        tmp_path, monkeypatch, [(2.9, 0)] * 3, recall=0.5
    )

    assert outcome.exit_code != 0
    assert "rejected before the answer stage by: retrievalRecall" in outcome.output
    assert fake.calls == 0
    release = load_json_object(manifest)
    assert release["promotionState"] == "rejected"
    assert release["stageResults"]["retrievalEvaluation"]["status"] == "passed"
    assert not any(name.startswith("answerEvaluation") for name in release["stageResults"])
    assert (manifest.parent / "release-2" / "retrieval-evaluation.json").exists()
    recall = next(gate for gate in release["gates"] if gate["name"] == "retrievalRecall")
    assert recall["actual"] == 0.5 and not recall["passed"] and not recall["overridable"]


def test_a_scoped_release_that_fails_retrieval_is_not_charged_for_scope_acceptance(
    tmp_path, monkeypatch
):
    import pipeline.eval.answer_scope

    def paid_scope_cases(snapshot):
        raise AssertionError("scope acceptance ran before the retrieval gates")

    monkeypatch.setattr(pipeline.eval.answer_scope, "run_scope_acceptance", paid_scope_cases)
    outcome, fake, manifest = validate_release(
        tmp_path, monkeypatch, [(2.9, 0)] * 3, recall=0.5, scoped=True
    )

    assert "rejected before the answer stage by: retrievalRecall" in outcome.output
    assert fake.calls == 0
    assert "answerScopeAcceptance" not in load_json_object(manifest)["stageResults"]


def test_release_validate_needs_a_baseline_before_it_does_any_work(tmp_path, monkeypatch):
    outcome, fake, manifest = validate_release(
        tmp_path, monkeypatch, [(2.9, 0)] * 3, baseline=False
    )

    assert outcome.exit_code != 0
    assert "--previous-manifest or --baseline-evidence" in outcome.output
    assert fake.calls == 0
    assert load_json_object(manifest)["stageResults"] == {}


def test_an_incomplete_retrieval_run_cannot_decide_the_retrieval_gates():
    partial = complete_result()
    partial["per_question"].pop()

    with pytest.raises(ValueError, match="complete benchmark"):
        evidence.require_complete_retrieval(partial)
    evidence.require_complete_retrieval(complete_result())


COMMIT = "c" * 40


def fake_repository(tmp_path, monkeypatch):
    """A build with no git checkout, as the corpus-job image is."""
    for name in ["corpus-manifest.json", "corpus-release-policy.json"]:
        (tmp_path / name).write_text("{}")
    dataset = tmp_path / "dataset.json"
    dataset.write_text("[]")
    catalog = tmp_path / "catalog.json"
    catalog.write_text(json.dumps({"sections": []}))
    monkeypatch.setattr(evidence, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(evidence, "GOLDEN_DATASET_PATH", dataset)
    monkeypatch.setenv("EVAL_IDENTITY_CATALOG", str(catalog))
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", COMMIT)
    for variable in ["JEV_SECTION_ROLES_ENABLED", "SCOPE_GATE_PROVIDER", "JEV_VALIDATION_LEDGER"]:
        monkeypatch.delenv(variable, raising=False)
    return tmp_path


def git(root, *arguments):
    import subprocess

    return subprocess.run(
        [
            "git", "-C", str(root),
            "-c", "user.name=Test", "-c", "user.email=test@example.test",
            "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null",
            *arguments,
        ],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


def git_checkout(tmp_path, monkeypatch):
    """A clean checkout with one commit; returns its root and HEAD."""
    (tmp_path / "checkout").mkdir()
    root = fake_repository(tmp_path / "checkout", monkeypatch)
    monkeypatch.delenv("RAILWAY_GIT_COMMIT_SHA")
    (root / "module.py").write_text("VALUE = 1\n")
    git(root, "init", "--quiet")
    git(root, "add", "--all")
    git(root, "commit", "--quiet", "--message", "first")
    return root, git(root, "rev-parse", "HEAD")


def test_the_fingerprint_names_the_commit_of_a_clean_checkout(tmp_path, monkeypatch):
    root, head = git_checkout(tmp_path, monkeypatch)

    before = evidence.evaluation_fingerprint()

    assert before["implementationCommit"] == head
    assert "implementationHash" not in before

    (root / "module.py").write_text("VALUE = 2\n")
    git(root, "commit", "--quiet", "--all", "--message", "second")
    after = evidence.evaluation_fingerprint()
    assert after["implementationCommit"] == git(root, "rev-parse", "HEAD") != head
    assert {**after, "implementationCommit": head} == before


@pytest.mark.parametrize("path", ["module.py", "untracked.py", "corpus-release-policy.json"])
def test_a_checkout_with_a_changed_or_untracked_file_has_no_fingerprint(
    tmp_path, monkeypatch, path
):
    root, _head = git_checkout(tmp_path, monkeypatch)
    (root / path).write_text("VALUE = 3\n")

    with pytest.raises(ValueError, match=f"clean checkout: 1 changed or untracked.*{path}"):
        evidence.evaluation_fingerprint()


def test_an_untracked_file_is_seen_whatever_git_is_configured_to_show(tmp_path, monkeypatch):
    root, _head = git_checkout(tmp_path, monkeypatch)
    git(root, "config", "status.showUntrackedFiles", "no")
    (root / "untracked.py").write_text("VALUE = 3\n")

    with pytest.raises(ValueError, match="clean checkout"):
        evidence.evaluation_fingerprint()


def test_a_declared_commit_must_be_the_checkout_it_runs_in(tmp_path, monkeypatch):
    _root, head = git_checkout(tmp_path, monkeypatch)

    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", head[:7])
    assert evidence.implementation_commit() == head

    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", COMMIT)
    with pytest.raises(ValueError, match="but this checkout is at"):
        evidence.implementation_commit()


def test_a_build_without_git_takes_the_commit_it_was_deployed_from(tmp_path, monkeypatch):
    fake_repository(tmp_path, monkeypatch)

    assert evidence.evaluation_fingerprint()["implementationCommit"] == COMMIT

    for declared in ["", COMMIT[:7], "not-a-commit"]:
        monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", declared)
        with pytest.raises(ValueError, match="full 40-character commit"):
            evidence.evaluation_fingerprint()


def test_git_that_cannot_answer_fails_closed(tmp_path, monkeypatch):
    root = fake_repository(tmp_path, monkeypatch)
    (root / ".git").write_text("gitdir: /nonexistent\n")

    with pytest.raises(ValueError, match="could not ask git"):
        evidence.evaluation_fingerprint()


def test_one_build_keeps_its_fingerprint_when_only_the_release_policy_file_differs(
    tmp_path, monkeypatch
):
    # The policy has no value of its own in the fingerprint; the corpus
    # manifest does. A policy change that is committed and deployed still
    # changes the commit, and with it the fingerprint.
    root = fake_repository(tmp_path, monkeypatch)
    before = evidence.evaluation_fingerprint()

    (root / "corpus-release-policy.json").write_text('{"evaluation": {"retrievalRecall": 0.5}}')
    assert evidence.evaluation_fingerprint() == before

    (root / "corpus-manifest.json").write_text('{"source_families": []}')
    assert evidence.evaluation_fingerprint() != before

    (root / "corpus-manifest.json").write_text("{}")
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "d" * 40)
    assert evidence.evaluation_fingerprint() != before


def test_the_validated_manifest_records_the_policy_that_gated_it(tmp_path, monkeypatch):
    from pipeline.release import release_policy_hash

    outcome, _fake, manifest = validate_release(tmp_path, monkeypatch, [(2.9, 0)] * 3)

    assert outcome.exit_code == 0, outcome.output
    assert load_json_object(manifest)["releasePolicyHash"] == release_policy_hash()
    assert release_policy_hash().startswith("sha256:")


def test_baseline_metrics_cover_only_questions_the_baseline_graph_holds(monkeypatch):
    from tests.test_release import scored_answer, scored_retrieval

    monkeypatch.setattr(evidence, "evaluation_fingerprint", lambda: {"model": "frozen"})
    monkeypatch.setattr(evidence, "require_complete_results", lambda *results: None)
    baseline = {
        "schemaVersion": 1,
        "fingerprint": {"model": "frozen"},
        "retrieval": scored_retrieval(
            {"q-1": 1.0, "q-2": 0.5, "q-3": 0.0}, uncovered={"q-3"}
        ),
        "answer": scored_answer({"q-1": 3, "q-2": 2, "q-3": 0}),
    }

    metrics = evidence.baseline_metrics(baseline)

    assert metrics["retrievalRecall"] == pytest.approx(0.75)
    assert metrics["primaryDocumentHitRate"] == 1
    assert metrics["answerScoreAllRows"] == pytest.approx(2.5)


def test_bootstrap_compares_the_candidate_on_the_questions_the_legacy_graph_holds(
    tmp_path, monkeypatch
):
    from pipeline.eval.results import compute_rollup

    plain_result = complete_result
    legacy_gaps = sorted(item["id"] for item in BENCHMARK)[-5:]

    def measured_result(uncovered=(), recall=0.93):
        result = plain_result()
        for row in result["per_question"]:
            missed = row["question_id"] in uncovered
            row.update(
                precision=0.2,
                recall=0.0 if missed else recall,
                mrr=1.0,
                primary_hit=not missed,
                scores={"overall": 0 if missed else 3, "hallucination": 3, "outcome": "passed"},
                evidence_identity={
                    "raw_expected_primary": [
                        ("missing:" if missed else "") + "sec:" + row["question_id"]
                    ],
                    "raw_expected_supporting": [],
                },
            )
        result["aggregate"] = compute_rollup(result["per_question"])
        return result

    # The candidate graph holds every labelled section; the legacy graph lacks
    # five, and is slightly better on the fifty it does hold. Over all 55
    # questions that loss would vanish behind the five the candidate gained.
    monkeypatch.setitem(globals(), "complete_result", measured_result)
    legacy = measured_result(uncovered=legacy_gaps, recall=0.95)
    outcome, fake, manifest = validate_release(
        tmp_path,
        monkeypatch,
        [(3.0, 0)] * 3,
        baseline_evidence={
            "schemaVersion": 1,
            "releaseId": "legacy",
            "fingerprint": {"model": "frozen"},
            "retrieval": legacy,
            "answer": legacy,
        },
    )

    assert outcome.exit_code == 0, outcome.output
    release = load_json_object(manifest)
    assert release["baselineComparisonExcludedQuestions"] == legacy_gaps
    assert release["evaluationResults"]["retrievalRecallRegression"] == pytest.approx(0.02)
    assert release["evaluationResults"]["answerScoreAllRowsRegression"] == 0
    assert legacy["aggregate"]["recall_at_k"] < 0.93


def test_release_validate_rejects_a_stale_override_before_it_does_any_work(
    tmp_path, monkeypatch
):
    stale = {
        "freshnessSla": {
            "reason": "The agency site was down during the crawl window",
            "sourceSnapshotHash": "sha256:" + "b" * 64,
        }
    }

    outcome, fake, manifest = validate_release(
        tmp_path, monkeypatch, [(2.9, 0)] * 3, overrides=stale
    )

    assert isinstance(outcome.exception, ValueError)
    assert "bound to source snapshot" in str(outcome.exception)
    assert fake.calls == 0
    assert load_json_object(manifest)["stageResults"] == {}


def test_complete_release_evidence_is_every_validated_entry_and_no_other(monkeypatch):
    unreviewed = {"id": "q-900", "status": "needs_validation"}
    monkeypatch.setattr(
        "pipeline.eval.dataset.load_dataset", lambda path=None: [*BENCHMARK, unreviewed]
    )

    evidence.require_complete_retrieval(complete_result())

    with_unreviewed = complete_result()
    with_unreviewed["per_question"].append({"question_id": "q-900"})
    with pytest.raises(ValueError, match="complete benchmark"):
        evidence.require_complete_retrieval(with_unreviewed)


def test_release_validate_stops_before_any_run_when_the_cap_is_for_another_size(
    tmp_path, monkeypatch
):
    monkeypatch.setattr("pipeline.eval.dataset.load_dataset", lambda path=None: BENCHMARK[:8])

    outcome, fake, _ = validate_release(tmp_path, monkeypatch, [(3.0, 0)] * 3)

    assert outcome.exit_code != 0
    assert "scores 8 validated questions" in str(outcome.exception)
    assert "re-set evaluation.withheldAnswers" in str(outcome.exception)
    assert fake.calls == 0
    assert not list(fake.results_dir.glob("*_retrieval.json"))
