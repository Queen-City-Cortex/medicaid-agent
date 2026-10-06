import json
from datetime import UTC, datetime, timedelta

import pytest

from pipeline.release import (
    apply_overrides,
    atomic_write_json,
    build_release_audit_results,
    build_release_counts,
    build_release_evaluation_results,
    create_release_manifest,
    evaluate_release_manifest,
    finalize_release_manifest,
    find_cleanup_candidate,
    find_color_retention_blocker,
    load_json_object,
    load_release_policy,
    mark_manifest_cutover_restored,
    mark_manifest_promoted,
    mark_manifest_recovery_pending,
    mark_manifest_rolled_back,
    record_release_stage,
    require_rollback_available,
    release_is_promotable,
)


SNAPSHOT = "sha256:" + "a" * 64


def family_minimums():
    return load_release_policy()["mandatory"]["minimumLoadedDocuments"]["families"]


def override(reason, snapshot=SNAPSHOT):
    return {"reason": reason, "sourceSnapshotHash": snapshot}


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
            "answerScoreAllRows": 2.7,
            "hallucinationScore": 2.6,
            "withheldAnswers": 2,
            "benchmarkQuestions": 55,
            "answerRuns": 3,
            "retrievalPrecisionRegression": 0.01,
            "retrievalRecallRegression": 0.01,
            "primaryDocumentHitRateRegression": 0.01,
            "answerScoreAllRowsRegression": 0.1,
            "hallucinationScoreRegression": 0.1,
        },
        "counts": {
            "maxSourceFamilyDocumentDrop": 0.01,
            "answerReadyDrop": 0.01,
            **{
                f"sourceFamily.{family}.loaded": minimum
                for family, minimum in family_minimums().items()
            },
        },
    }


def release_manifest(*, release_id="release-2", previous=None):
    return create_release_manifest(
        release_id=release_id,
        commit_sha="abcdef1",
        target_color="green",
        source_snapshot_hash="a" * 64,
        previous_manifest=previous,
        created_at=datetime(2026, 7, 25, tzinfo=UTC),
    )


def audit_report():
    minimums = family_minimums()
    return {
        "summary": {
            "duplicate_document_ids": 0,
            "by_failure_reason": {"missing_graph_load": 0},
        },
        "source_families": [
            {
                "source_type": "clinical_policy",
                "required_for_answering": True,
                "freshness_status": "fresh",
                "counts": {
                    "discovered": 100,
                    "loaded": minimums["clinical_policy"],
                    "answer_ready": 98,
                },
            },
            {
                "source_type": "provider_manual",
                "required_for_answering": False,
                "freshness_status": "stale",
                "counts": {"discovered": 20, "loaded": 18, "answer_ready": 18},
            },
            # The other families with a minimum: loaded exactly at it, and
            # outside the document and answer-ready totals asserted below.
            *[
                {
                    "source_type": family,
                    "required_for_answering": True,
                    "freshness_status": "fresh",
                    "counts": {"loaded": minimum, "answer_ready": 0},
                }
                for family, minimum in minimums.items()
                if family != "clinical_policy"
            ],
        ],
        "documents": [
            *[
                {
                    "source_type": "clinical_policy",
                    "registry_status": "downloaded",
                }
                for _ in range(100)
            ],
            *[
                {
                    "source_type": "provider_manual",
                    "registry_status": "unchanged",
                }
                for _ in range(20)
            ],
        ],
    }


def graph_metrics():
    return {
        "documentCount": 122,
        "duplicateIdentities": 0,
        "requiredSourceFamiliesPresent": 1,
        "missingRequiredSourceFamilies": [],
        "embeddingSections": 1000,
        "embeddedSections": 1000,
        "embeddingCoverage": 1,
        "invalidEmbeddingDimensions": 0,
    }


def retrieval_result():
    return {
        "aggregate": {
            "precision_at_k": 0.92,
            "recall_at_k": 0.93,
            "primary_hit_rate": 0.97,
        }
    }


def answer_result(*, overall=2.9, released=2.9, hallucination=2.8, withheld=0):
    return {
        "config": {"dataset_count": 55},
        "aggregate": {
            "overall": overall,
            "overall_released": released,
            "hallucination": hallucination,
            "withheld_count": withheld,
        },
    }


def baseline(**metrics):
    """A previous release that the fixture results above do not regress from."""
    return {
        "evaluationResults": {
            "retrievalPrecision": 0.1,
            "retrievalRecall": 0.9,
            "primaryDocumentHitRate": 0.95,
            "answerScoreAllRows": 2.5,
            "hallucinationScore": 2.5,
            **metrics,
        }
    }


def test_passing_manifest_is_promotable():
    assert release_is_promotable(evaluate_release_manifest(passing_manifest()))



def test_sparse_label_precision_is_reported_without_an_absolute_gate():
    manifest = passing_manifest()
    measured = retrieval_result()
    measured['aggregate']['precision_at_k'] = 0.2
    manifest['evaluationResults'] = build_release_evaluation_results(
        measured, [answer_result()] * 3, baseline(),
    )

    gates = evaluate_release_manifest(manifest)

    assert manifest['evaluationResults']['retrievalPrecision'] == 0.2
    assert not any(gate['name'] == 'retrievalPrecision' for gate in gates)
    assert release_is_promotable(gates)


@pytest.mark.parametrize(('metric', 'failing_value'), [
    ('retrievalRecall', 0.89),
    ('primaryDocumentHitRate', 0.94),
    ('answerScore', 2.74),
    ('hallucinationScore', 2.49),
    ('withheldAnswers', 6),
    ('answerRuns', 2),
    ('retrievalPrecisionRegression', 0.026),
    ('retrievalRecallRegression', 0.026),
    ('primaryDocumentHitRateRegression', 0.026),
    ('answerScoreAllRowsRegression', 0.151),
    ('hallucinationScoreRegression', 0.151),
])
@pytest.mark.parametrize('failure', ['below_threshold', 'missing', 'non_finite'])
def test_retained_evaluation_gates_still_fail_closed(metric, failing_value, failure):
    manifest = passing_manifest()
    if failure == 'missing':
        del manifest['evaluationResults'][metric]
    else:
        manifest['evaluationResults'][metric] = (
            float('nan') if failure == 'non_finite' else failing_value
        )

    gates = evaluate_release_manifest(manifest)

    assert not release_is_promotable(gates)
    failed = next(gate for gate in gates if gate['name'] == metric)
    assert not failed['passed']
    assert not failed['overridable']


def test_precision_regression_still_contributes_to_baseline_comparison():
    measured = retrieval_result()
    measured['aggregate']['precision_at_k'] = 0.1
    evaluation = build_release_evaluation_results(
        measured, [answer_result()] * 3, baseline(retrievalPrecision=0.3),
    )
    manifest = passing_manifest()
    manifest['evaluationResults'] = evaluation

    assert evaluation['retrievalPrecision'] == 0.1
    assert evaluation['retrievalPrecisionRegression'] == pytest.approx(0.2)
    assert [
        gate['name'] for gate in evaluate_release_manifest(manifest) if not gate['passed']
    ] == ['retrievalPrecisionRegression']


def test_updated_release_policy_rejects_the_old_gate_contract(tmp_path):
    policy = load_release_policy()
    assert policy['policyVersion'] == 3
    assert 'retrievalPrecision' not in policy['evaluation']
    assert 'maxAggregateRegression' not in policy['evaluation']
    policy['policyVersion'] = 2
    path = tmp_path / 'old-policy.json'
    path.write_text(json.dumps(policy))

    with pytest.raises(ValueError, match='Unsupported corpus release policy version'):
        load_release_policy(path)

def test_mandatory_gate_cannot_be_overridden():
    manifest = passing_manifest()
    manifest["auditResults"]["duplicateIdentities"] = 1
    gates = evaluate_release_manifest(manifest)

    with pytest.raises(ValueError, match="cannot be overridden"):
        apply_overrides(
            gates,
            {"duplicateIdentities": override("accepted for a documented reason")},
            SNAPSHOT,
        )


def test_overridable_gate_requires_a_reason():
    manifest = passing_manifest()
    manifest["counts"]["answerReadyDrop"] = 0.03
    gates = evaluate_release_manifest(manifest)

    assert not release_is_promotable(gates)
    with pytest.raises(ValueError, match="at least 10"):
        apply_overrides(gates, {"answerReadyDrop": override("too short")}, SNAPSHOT)
    assert release_is_promotable(
        apply_overrides(
            gates,
            {
                "answerReadyDrop": override(
                    "Upstream source consolidated duplicate attachments"
                )
            },
            SNAPSHOT,
        )
    )


def test_an_override_written_for_another_snapshot_is_rejected(tmp_path):
    manifest = passing_manifest()
    manifest["counts"]["maxSourceFamilyDocumentDrop"] = 0.6
    gates = evaluate_release_manifest(manifest)
    reason = "Bulletins before 2019 were consolidated by the agency"
    earlier_snapshot = "sha256:" + "b" * 64

    # Accepted once, for the snapshot the operator looked at.
    assert release_is_promotable(
        apply_overrides(
            gates, {"sourceFamilyDocumentDrop": override(reason, earlier_snapshot)},
            earlier_snapshot,
        )
    )
    # Left in place, the same file meets the next release's snapshot.
    stale = {"sourceFamilyDocumentDrop": override(reason, earlier_snapshot)}
    with pytest.raises(ValueError, match="bound to source snapshot sha256:bbbb"):
        apply_overrides(gates, stale, SNAPSHOT)

    path = tmp_path / "release.json"
    atomic_write_json(path, release_manifest())
    with pytest.raises(ValueError, match="bound to source snapshot"):
        finalize_release_manifest(
            path,
            audit_report=audit_report(),
            graph_metrics=graph_metrics(),
            retrieval_result=retrieval_result(),
            answer_results=[answer_result()] * 3,
            previous_manifest=baseline(),
            overrides=stale,
        )
    assert load_json_object(path)["promotionState"] == "building"


@pytest.mark.parametrize("entry", [
    "Upstream source consolidated duplicate attachments",
    {"reason": "Upstream source consolidated duplicate attachments"},
    {"reason": "Upstream source consolidated duplicate attachments", "sourceSnapshotHash": None},
    {"reason": "Upstream source consolidated duplicate attachments", "sourceSnapshotHash": "latest"},
    {**override("Upstream source consolidated duplicate attachments"), "maxActual": 0.1},
])
def test_an_override_without_a_valid_snapshot_binding_is_rejected(entry):
    manifest = passing_manifest()
    manifest["counts"]["answerReadyDrop"] = 0.03

    with pytest.raises(ValueError):
        apply_overrides(
            evaluate_release_manifest(manifest), {"answerReadyDrop": entry}, SNAPSHOT
        )


def test_the_manifest_records_the_override_and_the_snapshot_it_was_bound_to(tmp_path):
    path = tmp_path / "release.json"
    atomic_write_json(path, release_manifest())
    previous = baseline()
    previous["counts"] = {"sourceFamily.provider_manual.documents": 40}
    accepted = {
        "sourceFamilyDocumentDrop": override(
            "Provider manuals were merged into one handbook", "A" * 64
        )
    }

    result = finalize_release_manifest(
        path,
        audit_report=audit_report(),
        graph_metrics=graph_metrics(),
        retrieval_result=retrieval_result(),
        answer_results=[answer_result()] * 3,
        previous_manifest=previous,
        overrides=accepted,
    )

    assert result["promotionState"] == "validated"
    assert result["gateOverrides"] == accepted
    assert result["sourceSnapshotHash"] == SNAPSHOT
    gate = next(g for g in result["gates"] if g["name"] == "sourceFamilyDocumentDrop")
    assert not gate["passed"]
    assert gate["overrideReason"] == "Provider manuals were merged into one handbook"


def test_a_family_below_its_minimum_document_count_fails_a_mandatory_gate():
    minimum = family_minimums()["clinical_policy"]
    manifest = passing_manifest()
    manifest["counts"]["sourceFamily.clinical_policy.loaded"] = minimum - 1

    gates = evaluate_release_manifest(manifest)
    gate = next(g for g in gates if g["name"] == "sourceFamilyMinimum.clinical_policy")

    assert gate == {
        "name": "sourceFamilyMinimum.clinical_policy",
        "passed": False,
        "actual": minimum - 1,
        "threshold": minimum,
        "overridable": False,
        "overrideReason": None,
    }
    assert not release_is_promotable(gates)
    with pytest.raises(ValueError, match="cannot be overridden"):
        apply_overrides(
            gates,
            {"sourceFamilyMinimum.clinical_policy": override("The agency retired them")},
            SNAPSHOT,
        )


def test_small_drops_that_pass_the_drop_gate_still_meet_the_absolute_minimum(tmp_path):
    # Each release loses under 5% of the family against the one before, so the
    # drop gate never fires; the minimum does not move with the baseline.
    minimum = family_minimums()["clinical_policy"]
    report = audit_report()
    report["source_families"][0]["counts"]["loaded"] = minimum - 1
    previous = baseline()
    previous["counts"] = {"sourceFamily.clinical_policy.documents": 102}
    path = tmp_path / "release.json"
    atomic_write_json(path, release_manifest())

    result = finalize_release_manifest(
        path,
        audit_report=report,
        graph_metrics=graph_metrics(),
        retrieval_result=retrieval_result(),
        answer_results=[answer_result()] * 3,
        previous_manifest=previous,
    )

    assert result["counts"]["maxSourceFamilyDocumentDrop"] < 0.05
    assert result["counts"]["sourceFamily.clinical_policy.loaded"] == minimum - 1
    assert [gate["name"] for gate in result["gates"] if not gate["passed"]] == [
        "sourceFamilyMinimum.clinical_policy"
    ]
    assert result["promotionState"] == "rejected"


def test_a_family_missing_from_the_audit_fails_its_minimum():
    manifest = passing_manifest()
    del manifest["counts"]["sourceFamily.waiver.loaded"]

    gate = next(
        g for g in evaluate_release_manifest(manifest)
        if g["name"] == "sourceFamilyMinimum.waiver"
    )

    assert not gate["passed"] and gate["actual"] is None


def test_every_required_source_family_has_a_minimum_document_count(tmp_path):
    from pipeline.corpus_manifest import CORPUS_MANIFEST

    policy = load_release_policy()
    minimums = policy["mandatory"]["minimumLoadedDocuments"]
    required = {
        family.source_type
        for family in CORPUS_MANIFEST.source_families
        if family.required_for_answering
    }

    assert set(minimums["families"]) == required
    assert all(type(count) is int and count > 0 for count in minimums["families"].values())
    assert minimums["provisional"] is True

    minimums["families"]["waiver"] = 0
    path = tmp_path / "policy.json"
    path.write_text(json.dumps(policy))
    with pytest.raises(ValueError, match="minimum document count"):
        load_release_policy(path)


def test_missing_and_non_finite_metrics_fail_closed():
    assert not release_is_promotable(evaluate_release_manifest({}))
    manifest = passing_manifest()
    manifest["auditResults"]["embeddingCoverage"] = float("nan")
    gates = evaluate_release_manifest(manifest)
    assert not release_is_promotable(gates)
    assert next(
        gate for gate in gates if gate["name"] == "embeddingCoverage"
    )["actual"] is None


def test_record_stage_persists_failure_and_retries_atomically(tmp_path):
    path = tmp_path / "release.json"
    atomic_write_json(path, release_manifest())

    with pytest.raises(RuntimeError, match="provider unavailable"):
        record_release_stage(
            path,
            "embeddings",
            lambda: (_ for _ in ()).throw(
                RuntimeError("provider unavailable")
            ),
        )

    failed = load_json_object(path)["stageResults"]["embeddings"]
    assert failed["status"] == "failed"
    assert failed["attempt"] == 1

    result = record_release_stage(
        path,
        "embeddings",
        lambda: {"embedded": 10, "errors": 0},
    )
    passed = load_json_object(path)["stageResults"]["embeddings"]
    assert result["embedded"] == 10
    assert passed["status"] == "passed"
    assert passed["attempt"] == 2


def test_counts_compare_each_family_and_answer_ready_total():
    previous = {
        "counts": {
            "sourceFamily.clinical_policy.documents": 110,
            "sourceFamily.provider_manual.documents": 20,
            "answerReadyTotal": 120,
        }
    }

    counts = build_release_counts(audit_report(), previous)

    assert counts["documentsTotal"] == 120
    assert counts["answerReadyTotal"] == 116
    assert counts["maxSourceFamilyDocumentDrop"] == pytest.approx(10 / 110)
    assert counts["answerReadyDrop"] == pytest.approx(4 / 120)


def test_audit_ignores_optional_stale_family_but_counts_required_parse_errors():
    report = audit_report()
    report["documents"].extend([
        {
            "source_type": "clinical_policy",
            "required_for_answering": True,
            "registry_status": "downloaded",
            "parse_status": "parse_exception",
        },
        {
            "source_type": "provider_manual",
            "required_for_answering": False,
            "registry_status": "downloaded",
            "parse_status": "parse_exception",
        },
    ])

    audit = build_release_audit_results(report, graph_metrics())

    assert audit["requiredCurrentParseExceptions"] == 1
    assert audit["freshnessSlaMet"] == 1
    assert audit["staleSourceFamilies"] == []


def test_evaluation_compares_each_metric_with_the_promoted_baseline():
    previous = {
        "evaluationResults": {
            "retrievalPrecision": 0.95,
            "retrievalRecall": 0.94,
            "primaryDocumentHitRate": 0.99,
            "answerScoreAllRows": 3.0,
            "hallucinationScore": 2.9,
        }
    }

    evaluation = build_release_evaluation_results(
        retrieval_result(),
        [answer_result()],
        previous,
    )

    assert evaluation["retrievalPrecision"] == 0.92
    assert evaluation["answerScore"] == 2.9
    assert {
        key: pytest.approx(value)
        for key, value in evaluation.items()
        if key.endswith("Regression")
    } == {
        "retrievalPrecisionRegression": 0.03,
        "retrievalRecallRegression": 0.01,
        "primaryDocumentHitRateRegression": 0.02,
        "answerScoreAllRowsRegression": 0.1,
        "hallucinationScoreRegression": 0.1,
    }
    assert "aggregateRegression" not in evaluation


def test_a_release_with_no_baseline_fails_every_regression_gate():
    manifest = passing_manifest()
    manifest["evaluationResults"] = build_release_evaluation_results(
        retrieval_result(), [answer_result()] * 3, None,
    )

    gates = evaluate_release_manifest(manifest)

    failed = [gate for gate in gates if not gate["passed"]]
    assert [gate["name"] for gate in failed] == [
        "retrievalPrecisionRegression",
        "retrievalRecallRegression",
        "primaryDocumentHitRateRegression",
        "answerScoreAllRowsRegression",
        "hallucinationScoreRegression",
    ]
    assert all(gate["actual"] is None and not gate["overridable"] for gate in failed)
    assert not release_is_promotable(gates)


def test_a_baseline_missing_one_compared_metric_fails_that_regression_gate():
    incomplete = baseline()
    del incomplete["evaluationResults"]["hallucinationScore"]
    manifest = passing_manifest()
    manifest["evaluationResults"] = build_release_evaluation_results(
        retrieval_result(), [answer_result()] * 3, incomplete,
    )

    assert [
        gate["name"] for gate in evaluate_release_manifest(manifest) if not gate["passed"]
    ] == ["hallucinationScoreRegression"]


def test_regression_limits_differ_by_metric():
    # 0.1 is inside the limit for the 0-3 answer scores and far outside the
    # limit for the 0-1 retrieval rates.
    manifest = passing_manifest()
    manifest["evaluationResults"] = build_release_evaluation_results(
        retrieval_result(),
        [answer_result()] * 3,
        baseline(retrievalRecall=1.03, answerScoreAllRows=3.0, hallucinationScore=2.9),
    )

    gates = {gate["name"]: gate for gate in evaluate_release_manifest(manifest)}

    assert gates["retrievalRecallRegression"]["actual"] == pytest.approx(0.1)
    assert not gates["retrievalRecallRegression"]["passed"]
    assert gates["answerScoreAllRowsRegression"]["actual"] == pytest.approx(0.1)
    assert gates["answerScoreAllRowsRegression"]["passed"]
    assert gates["hallucinationScoreRegression"]["passed"]


@pytest.mark.parametrize(("lost", "passes"), [(1, True), (2, False)])
@pytest.mark.parametrize("questions", [50, 55])
def test_retrieval_limit_tolerates_one_lost_question_and_never_two(questions, lost, passes):
    measured = retrieval_result()
    measured["aggregate"]["primary_hit_rate"] = (questions - 2 - lost) / questions
    manifest = passing_manifest()
    manifest["evaluationResults"] = build_release_evaluation_results(
        measured,
        [answer_result()] * 3,
        baseline(primaryDocumentHitRate=(questions - 2) / questions),
    )
    manifest["evaluationResults"]["primaryDocumentHitRate"] = 0.96  # the floor is not under test

    gate = next(
        gate
        for gate in evaluate_release_manifest(manifest)
        if gate["name"] == "primaryDocumentHitRateRegression"
    )

    assert gate["passed"] is passes


def test_release_policy_needs_a_regression_limit_for_each_compared_metric(tmp_path):
    policy = load_release_policy()
    assert set(policy["evaluation"]["maxRegression"]) == {
        "retrievalPrecision",
        "retrievalRecall",
        "primaryDocumentHitRate",
        "answerScoreAllRows",
        "hallucinationScore",
    }
    del policy["evaluation"]["maxRegression"]["hallucinationScore"]
    path = tmp_path / "policy.json"
    path.write_text(json.dumps(policy))

    with pytest.raises(ValueError, match="regression limit"):
        load_release_policy(path)


def scored_retrieval(recall_by_question, *, uncovered=()):
    """A retrieval result with per-question rows, as the eval runner saves it."""
    from pipeline.eval.results import compute_rollup

    rows = [
        {
            "id": question,
            "precision": recall / 10,
            "recall": recall,
            "mrr": recall,
            "primary_hit": recall > 0,
            "evidence_identity": {
                "raw_expected_primary": [
                    f"missing:sec:{question}" if question in uncovered else f"sec:{question}"
                ],
                "raw_expected_supporting": [],
            },
        }
        for question, recall in recall_by_question.items()
    ]
    return {"per_question": rows, "aggregate": compute_rollup(rows)}


def scored_answer(overall_by_question):
    from pipeline.eval.results import compute_rollup

    rows = [
        {"id": question, "scores": {"overall": overall, "hallucination": 3, "outcome": "passed"}}
        for question, overall in overall_by_question.items()
    ]
    return {
        "config": {"dataset_count": len(rows)},
        "per_question": rows,
        "aggregate": compute_rollup(rows),
    }


def test_baseline_comparison_leaves_out_questions_the_baseline_graph_could_not_answer():
    from pipeline.release import uncovered_question_ids, without_questions

    # The baseline graph has no evidence for q-4, so it misses there by
    # construction. Over all four questions the candidate's gain on q-4 hides
    # its losses on the three questions both graphs can answer.
    old_retrieval = scored_retrieval(
        {"q-1": 1.0, "q-2": 1.0, "q-3": 1.0, "q-4": 0.0}, uncovered={"q-4"}
    )
    old_answer = scored_answer({"q-1": 3, "q-2": 3, "q-3": 3, "q-4": 0})
    new_retrieval = scored_retrieval({"q-1": 1.0, "q-2": 1.0, "q-3": 0.5, "q-4": 1.0})
    new_answers = [scored_answer({"q-1": 3, "q-2": 3, "q-3": 2, "q-4": 3})] * 3

    excluded = uncovered_question_ids(old_retrieval)
    shared_baseline = {"evaluationResults": build_release_evaluation_results(
        without_questions(old_retrieval, excluded),
        [without_questions(old_answer, excluded)],
        None,
    )}
    over_all = build_release_evaluation_results(
        new_retrieval,
        new_answers,
        {"evaluationResults": build_release_evaluation_results(
            old_retrieval, [old_answer], None,
        )},
    )
    over_shared = build_release_evaluation_results(
        new_retrieval, new_answers, shared_baseline, excluded_questions=excluded,
    )

    assert excluded == {"q-4"}
    assert over_all["retrievalRecallRegression"] == 0
    assert over_all["answerScoreAllRowsRegression"] == 0
    assert over_shared["retrievalRecallRegression"] == pytest.approx(1 / 6)
    assert over_shared["primaryDocumentHitRateRegression"] == 0
    assert over_shared["answerScoreAllRowsRegression"] == pytest.approx(1 / 3)
    # The floors still read every question.
    assert over_shared["retrievalRecall"] == pytest.approx(0.875)
    assert over_shared["answerScoreAllRows"] == pytest.approx(2.75)


def test_a_question_the_candidate_cannot_answer_stays_in_the_comparison():
    from pipeline.release import uncovered_question_ids

    old_retrieval = scored_retrieval({"q-1": 1.0, "q-2": 1.0})
    new_retrieval = scored_retrieval({"q-1": 1.0, "q-2": 0.0}, uncovered={"q-2"})

    evaluation = build_release_evaluation_results(
        new_retrieval,
        [scored_answer({"q-1": 3, "q-2": 3})] * 3,
        {"evaluationResults": build_release_evaluation_results(
            old_retrieval, [scored_answer({"q-1": 3, "q-2": 3})], None,
        )},
        excluded_questions=uncovered_question_ids(old_retrieval),
    )

    assert evaluation["retrievalRecallRegression"] == pytest.approx(0.5)


def test_answer_floor_reads_released_answers_and_reports_all_rows():
    evaluation = build_release_evaluation_results(
        retrieval_result(),
        [answer_result(overall=2.5, released=2.8, withheld=5)] * 3,
        baseline(),
    )
    manifest = passing_manifest()
    manifest["evaluationResults"] = evaluation

    gates = evaluate_release_manifest(manifest)

    assert evaluation["answerScore"] == 2.8
    assert evaluation["answerScoreAllRows"] == 2.5
    assert evaluation["withheldAnswers"] == 5
    assert evaluation["benchmarkQuestions"] == 55
    floor = next(gate for gate in gates if gate["name"] == "answerScore")
    assert floor["actual"] == 2.8 and floor["passed"]
    assert release_is_promotable(gates)


def test_all_rows_score_above_the_floor_cannot_carry_weak_released_answers():
    manifest = passing_manifest()
    manifest["evaluationResults"]["answerScore"] = 2.74
    manifest["evaluationResults"]["answerScoreAllRows"] = 2.9

    gates = evaluate_release_manifest(manifest)

    assert not next(gate for gate in gates if gate["name"] == "answerScore")["passed"]
    assert not release_is_promotable(gates)


def test_results_from_the_old_harness_fail_the_released_floor_and_the_cap():
    manifest = passing_manifest()
    manifest["evaluationResults"] = build_release_evaluation_results(
        retrieval_result(),
        [{"config": {"dataset_count": 55}, "aggregate": {"overall": 2.9, "hallucination": 2.8}}] * 3,
        baseline(),
    )

    failed = {
        gate["name"]
        for gate in evaluate_release_manifest(manifest)
        if not gate["passed"]
    }

    assert failed == {"answerScore", "withheldAnswers"}


@pytest.mark.parametrize(("withheld", "passes"), [(5, True), (6, False)])
def test_withheld_answer_cap_is_a_mandatory_gate(withheld, passes):
    manifest = passing_manifest()
    manifest["evaluationResults"]["withheldAnswers"] = withheld

    gates = evaluate_release_manifest(manifest)
    cap = next(gate for gate in gates if gate["name"] == "withheldAnswers")

    assert cap["passed"] is passes
    assert cap["threshold"] == 5
    assert cap["overridable"] is False
    assert release_is_promotable(gates) is passes


def test_withheld_answer_cap_cannot_be_overridden(tmp_path):
    manifest = passing_manifest()
    manifest["evaluationResults"]["withheldAnswers"] = 6
    reason = {"withheldAnswers": override("The verifier was unusually strict on this run")}

    with pytest.raises(ValueError, match="withheldAnswers cannot be overridden"):
        apply_overrides(evaluate_release_manifest(manifest), reason, SNAPSHOT)

    path = tmp_path / "release.json"
    atomic_write_json(path, release_manifest())
    with pytest.raises(ValueError, match="withheldAnswers cannot be overridden"):
        finalize_release_manifest(
            path,
            audit_report=audit_report(),
            graph_metrics=graph_metrics(),
            retrieval_result=retrieval_result(),
            answer_results=[answer_result(overall=2.5, released=2.9, withheld=6)] * 3,
            previous_manifest=None,
            overrides=reason,
        )
    assert load_json_object(path)["promotionState"] == "building"


def test_withheld_answer_cap_fails_closed_on_another_benchmark_size():
    manifest = passing_manifest()
    manifest["evaluationResults"]["benchmarkQuestions"] = 60

    gates = evaluate_release_manifest(manifest)
    cap = next(gate for gate in gates if gate["name"] == "withheldAnswers")

    assert not cap["passed"] and cap["actual"] is None
    assert not release_is_promotable(gates)


def test_withheld_answer_cap_was_set_against_the_current_benchmark():
    from pipeline.eval.dataset import load_dataset

    cap = load_release_policy()["evaluation"]["withheldAnswers"]

    assert cap["benchmarkSize"] == len(load_dataset())
    assert 0 <= cap["max"] < cap["benchmarkSize"]
    assert cap["provisional"] is True


@pytest.mark.parametrize("cap", [None, 5, {"max": 5}, {"max": 56, "benchmarkSize": 55}])
def test_release_policy_requires_a_complete_withheld_answer_cap(tmp_path, cap):
    policy = load_release_policy()
    policy["evaluation"]["withheldAnswers"] = cap
    path = tmp_path / "policy.json"
    path.write_text(json.dumps(policy))

    with pytest.raises(ValueError, match="withheld-answer cap"):
        load_release_policy(path)


def test_baseline_comparison_charges_withheld_answers_on_all_rows():
    baseline = {"evaluationResults": build_release_evaluation_results(
        retrieval_result(), [answer_result(overall=2.8, released=2.8)], None,
    )}

    evaluation = build_release_evaluation_results(
        retrieval_result(),
        [answer_result(overall=2.6, released=2.95, withheld=5)] * 3,
        baseline,
    )
    manifest = passing_manifest()
    manifest["evaluationResults"] = evaluation
    gates = evaluate_release_manifest(manifest)

    assert evaluation["answerScoreAllRowsRegression"] == pytest.approx(0.2)
    assert {gate["name"] for gate in gates if not gate["passed"]} == {
        "answerScoreAllRowsRegression"
    }


def test_baseline_comparison_ignores_released_score_and_withheld_count():
    baseline = {"evaluationResults": build_release_evaluation_results(
        retrieval_result(), [answer_result(overall=2.8, released=3.0, withheld=5)], None,
    )}

    evaluation = build_release_evaluation_results(
        retrieval_result(),
        [answer_result(overall=2.8, released=2.8, withheld=0)],
        baseline,
    )

    assert evaluation["answerScoreAllRowsRegression"] == 0


def finalize_with_answer_runs(tmp_path, runs, **kwargs):
    path = tmp_path / "release.json"
    atomic_write_json(path, release_manifest())
    return finalize_release_manifest(
        path,
        audit_report=audit_report(),
        graph_metrics=graph_metrics(),
        retrieval_result=retrieval_result(),
        answer_results=runs,
        previous_manifest=baseline(),
        **kwargs,
    )


def test_answer_gates_read_the_three_run_mean_not_the_first_run(tmp_path):
    # The first run alone is under the 2.75 floor and over the cap of 5.
    result = finalize_with_answer_runs(tmp_path, [
        answer_result(overall=2.3, released=2.6, hallucination=2.4, withheld=7),
        answer_result(overall=2.7, released=2.8, hallucination=2.7, withheld=4),
        answer_result(overall=2.8, released=2.9, hallucination=2.7, withheld=4),
    ])

    evaluation = result["evaluationResults"]
    assert evaluation["answerRuns"] == 3
    assert evaluation["answerScore"] == pytest.approx((2.6 + 2.8 + 2.9) / 3)
    assert evaluation["answerScoreAllRows"] == pytest.approx(2.6)
    assert evaluation["hallucinationScore"] == pytest.approx(2.6)
    assert evaluation["withheldAnswers"] == pytest.approx(5)
    assert result["promotionState"] == "validated"


def test_one_strong_run_cannot_carry_a_three_run_mean_under_the_floor(tmp_path):
    result = finalize_with_answer_runs(tmp_path, [
        answer_result(released=2.95),
        answer_result(released=2.6),
        answer_result(released=2.6),
    ])

    assert result["promotionState"] == "rejected"
    assert [gate["name"] for gate in result["gates"] if not gate["passed"]] == [
        "answerScore"
    ]


def test_baseline_comparison_uses_the_three_run_all_rows_mean(tmp_path):
    result = finalize_with_answer_runs(
        tmp_path,
        [
            answer_result(overall=2.5, released=2.9, withheld=5),
            answer_result(overall=2.6, released=2.9, withheld=5),
            answer_result(overall=2.7, released=2.9, withheld=5),
        ],
        baseline_evaluation=baseline(answerScoreAllRows=2.8)["evaluationResults"],
    )

    assert result["evaluationResults"]["answerScoreAllRowsRegression"] == pytest.approx(0.2)
    assert [gate["name"] for gate in result["gates"] if not gate["passed"]] == [
        "answerScoreAllRowsRegression"
    ]


@pytest.mark.parametrize("valid_runs", [0, 1, 2])
def test_fewer_than_three_valid_answer_runs_cannot_be_promoted(tmp_path, valid_runs):
    runs = [answer_result()] * valid_runs
    result = finalize_with_answer_runs(tmp_path, runs)

    gate = next(gate for gate in result["gates"] if gate["name"] == "answerRuns")
    assert gate == {
        "name": "answerRuns",
        "passed": False,
        "actual": valid_runs,
        "threshold": 3,
        "overridable": False,
        "overrideReason": None,
    }
    assert result["promotionState"] == "rejected"
    with pytest.raises(ValueError, match="answerRuns cannot be overridden"):
        finalize_with_answer_runs(
            tmp_path, runs, overrides={"answerRuns": override("Two runs agreed closely enough")}
        )


def test_answer_metric_missing_from_one_run_fails_closed(tmp_path):
    incomplete = answer_result()
    del incomplete["aggregate"]["overall_released"]

    result = finalize_with_answer_runs(
        tmp_path, [answer_result(), incomplete, answer_result()]
    )

    assert "answerScore" not in result["evaluationResults"]
    assert result["promotionState"] == "rejected"


def test_answer_runs_of_different_benchmark_sizes_fail_the_cap(tmp_path):
    other = answer_result()
    other["config"]["dataset_count"] = 50

    result = finalize_with_answer_runs(
        tmp_path, [answer_result(), other, answer_result()]
    )

    assert [gate["name"] for gate in result["gates"] if not gate["passed"]] == [
        "withheldAnswers"
    ]


def decide_before_answer_runs(tmp_path, measured, **kwargs):
    from pipeline.release import reject_before_answer_runs

    path = tmp_path / "release.json"
    atomic_write_json(path, release_manifest())
    failed = reject_before_answer_runs(
        path,
        audit_report=audit_report(),
        graph_metrics=graph_metrics(),
        retrieval_result=measured,
        previous_manifest=baseline(),
        **kwargs,
    )
    return failed, load_json_object(path)


def test_a_retrieval_floor_breach_rejects_the_release_before_any_answer_run(tmp_path):
    measured = retrieval_result()
    measured["aggregate"]["recall_at_k"] = 0.5
    measured["aggregate"]["primary_hit_rate"] = 0.6

    failed, manifest = decide_before_answer_runs(tmp_path, measured)

    assert failed == [
        "retrievalRecall",
        "primaryDocumentHitRate",
        "retrievalRecallRegression",
        "primaryDocumentHitRateRegression",
    ]
    assert manifest["promotionState"] == "rejected"
    assert manifest["validatedAt"]
    assert manifest["evaluationResults"]["retrievalRecall"] == 0.5
    # Only the gates that were decided are recorded; no answer run existed.
    recorded = {gate["name"] for gate in manifest["gates"]}
    assert {"retrievalRecall", "duplicateIdentities", "freshnessSla"} <= recorded
    assert not recorded & {
        "answerScore",
        "hallucinationScore",
        "answerRuns",
        "withheldAnswers",
        "answerScoreAllRowsRegression",
        "hallucinationScoreRegression",
    }


def test_passing_retrieval_leaves_the_manifest_building_for_the_answer_runs(tmp_path):
    failed, manifest = decide_before_answer_runs(tmp_path, retrieval_result())

    assert failed == []
    assert manifest["promotionState"] == "building"
    assert manifest["gates"] == [] and manifest["validatedAt"] is None


def test_a_missing_baseline_rejects_the_release_before_any_answer_run(tmp_path):
    from pipeline.release import reject_before_answer_runs

    path = tmp_path / "release.json"
    atomic_write_json(path, release_manifest())
    failed = reject_before_answer_runs(
        path,
        audit_report=audit_report(),
        graph_metrics=graph_metrics(),
        retrieval_result=retrieval_result(),
        previous_manifest=None,
    )

    assert failed == [
        "retrievalPrecisionRegression",
        "retrievalRecallRegression",
        "primaryDocumentHitRateRegression",
    ]
    assert load_json_object(path)["promotionState"] == "rejected"


def test_finalize_rejects_mandatory_failure_even_with_valid_override(tmp_path):
    path = tmp_path / "release.json"
    atomic_write_json(path, release_manifest())
    bad_graph = graph_metrics()
    bad_graph["invalidEmbeddingDimensions"] = 1
    report = audit_report()
    report["source_families"][0]["counts"]["answer_ready"] = 90
    previous = {
        "counts": {
            "sourceFamily.clinical_policy.documents": 100,
            "sourceFamily.provider_manual.documents": 20,
            "answerReadyTotal": 120,
        }
    }

    result = finalize_release_manifest(
        path,
        audit_report=report,
        graph_metrics=bad_graph,
        retrieval_result=retrieval_result(),
        answer_results=[answer_result()] * 3,
        previous_manifest=previous,
        overrides={
            "answerReadyDrop": override("Document removals were approved upstream")
        },
    )

    assert result["promotionState"] == "rejected"
    assert not release_is_promotable(result["gates"])


def test_promotion_sets_rollback_and_volume_retention_deadlines(tmp_path):
    now = datetime(2026, 7, 25, 18, tzinfo=UTC)
    current_path = tmp_path / "current.json"
    previous_path = tmp_path / "previous.json"
    current = release_manifest()
    current["promotionState"] = "validated"
    previous = release_manifest(release_id="release-1")
    previous["targetColor"] = "blue"
    previous["promotionState"] = "promoted"
    atomic_write_json(current_path, current)
    atomic_write_json(previous_path, previous)

    mark_manifest_promoted(
        current_path,
        previous_manifest_path=previous_path,
        now=now,
    )

    promoted = load_json_object(current_path)
    superseded = load_json_object(previous_path)
    assert promoted["promotionState"] == "promoted"
    assert superseded["rollbackWindowEndsAt"] == (
        now + timedelta(hours=24)
    ).isoformat().replace("+00:00", "Z")
    assert superseded["volumeRetainUntil"] == (
        now + timedelta(days=7)
    ).isoformat().replace("+00:00", "Z")


def test_rollback_is_rejected_after_window(tmp_path):
    now = datetime(2026, 7, 27, tzinfo=UTC)
    current_path = tmp_path / "current.json"
    previous_path = tmp_path / "previous.json"
    current = release_manifest()
    current["promotionState"] = "promoted"
    previous = release_manifest(release_id="release-1")
    previous["rollbackWindowEndsAt"] = (
        now - timedelta(seconds=1)
    ).isoformat()
    atomic_write_json(current_path, current)
    atomic_write_json(previous_path, previous)

    with pytest.raises(ValueError, match="rollback window"):
        mark_manifest_rolled_back(
            current_path,
            previous_path,
            now=now,
        )

    assert json.loads(current_path.read_text())["promotionState"] == "promoted"


def test_rollback_is_rejected_when_window_is_not_recorded():
    with pytest.raises(ValueError, match="not recorded"):
        require_rollback_available(release_manifest())


def test_cutover_restoration_records_consistent_state_without_a_window(tmp_path):
    now = datetime(2026, 7, 25, 18, tzinfo=UTC)
    current_path = tmp_path / "current.json"
    previous_path = tmp_path / "previous.json"
    current = release_manifest()
    current["promotionState"] = "validated"
    previous = release_manifest(release_id="release-1")
    previous["targetColor"] = "blue"
    previous["supersededByReleaseId"] = current["releaseId"]
    previous["rollbackWindowEndsAt"] = (now + timedelta(hours=24)).isoformat()
    previous["volumeRetainUntil"] = (now + timedelta(days=7)).isoformat()
    atomic_write_json(current_path, current)
    atomic_write_json(previous_path, previous)

    restored_current, restored_previous = mark_manifest_cutover_restored(
        current_path,
        previous_path,
        now=now,
    )

    assert restored_current["promotionState"] == "rolled_back"
    assert restored_current["rolledBackToReleaseId"] == "release-1"
    assert restored_previous["promotionState"] == "promoted"
    assert "supersededByReleaseId" not in restored_previous
    assert restored_previous["rollbackWindowEndsAt"] is None
    assert restored_previous["volumeRetainUntil"] is None


def test_recovery_pending_is_durable_before_target_restoration(tmp_path):
    path = tmp_path / "current.json"
    atomic_write_json(path, release_manifest())

    pending = mark_manifest_recovery_pending(
        path,
        "release-1",
        "promotion metadata failed",
        now=datetime(2026, 7, 25, 18, tzinfo=UTC),
    )

    assert pending["promotionState"] == "recovery_pending"
    assert pending["recoveryTargetReleaseId"] == "release-1"
    assert pending["events"][-1]["type"] == "cutover_recovery_pending"
    assert load_json_object(path) == pending


def test_retention_blocks_reset_and_cleanup_waits_for_rollback_window(tmp_path):
    now = datetime(2026, 7, 25, 18, tzinfo=UTC)
    old_path = tmp_path / "release-1.json"
    old = release_manifest(release_id="release-1")
    old["targetColor"] = "blue"
    old["supersededByReleaseId"] = "release-2"
    old["rollbackWindowEndsAt"] = (now + timedelta(hours=1)).isoformat()
    old["volumeRetainUntil"] = (now + timedelta(days=7)).isoformat()
    atomic_write_json(old_path, old)

    blocker = find_color_retention_blocker(tmp_path, "blue", now=now)
    assert blocker["releaseId"] == "release-1"
    assert find_cleanup_candidate(
        tmp_path,
        current_release_id="release-2",
        inactive_color="blue",
        now=now,
    ) is None

    candidate = find_cleanup_candidate(
        tmp_path,
        current_release_id="release-2",
        inactive_color="blue",
        now=now + timedelta(hours=2),
    )
    assert candidate["manifestPath"] == str(old_path)
