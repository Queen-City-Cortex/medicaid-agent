"""The release preflight: inputs checked before the candidate graph is reset."""

import json
from datetime import UTC, datetime, timedelta

import pytest
from click.testing import CliRunner

from pipeline import evaluation_evidence as evidence
from pipeline import release_preflight as preflight
from pipeline.audit import build_corpus_audit_report
from pipeline.corpus_manifest import CORPUS_MANIFEST
from pipeline.release import (
    atomic_write_json,
    create_release_manifest,
    load_json_object,
    release_policy_hash,
)


NOW = datetime(2026, 10, 5, 12, tzinfo=UTC)
SNAPSHOT = "sha256:" + "a" * 64
FINGERPRINT = {"benchmarkHash": "frozen", "implementationHash": "one"}
REQUIRED = [
    family.source_type
    for family in CORPUS_MANIFEST.source_families
    if family.required_for_answering
]
COMPARED = {
    "retrievalPrecision": 0.2,
    "retrievalRecall": 0.95,
    "primaryDocumentHitRate": 0.98,
    "answerScoreAllRows": 2.9,
    "hallucinationScore": 2.9,
}


def fresh_rows(*, stale=(), never=()):
    return [
        {
            "source_type": source_type,
            "last_successful_discovery_at": (
                NOW - (timedelta(days=30) if source_type in stale else timedelta(hours=2))
            ).isoformat(),
        }
        for source_type in REQUIRED
        if source_type not in never
    ]


@pytest.fixture
def release(tmp_path, monkeypatch):
    """A prepared manifest, a validated previous one, and sound inputs."""
    catalog = tmp_path / "catalog.json"
    catalog.write_text(json.dumps({"sections": []}))
    monkeypatch.setenv("EVAL_IDENTITY_CATALOG", str(catalog))
    monkeypatch.setattr(
        evidence, "evaluation_fingerprint", lambda *, read_graph=True: dict(FINGERPRINT)
    )
    rows = fresh_rows()
    monkeypatch.setattr(
        "pipeline.crawler_registry.read_source_freshness", lambda: rows
    )
    releases = tmp_path / "releases"
    previous = create_release_manifest(
        release_id="release-1",
        commit_sha="abcdef1",
        target_color="blue",
        source_snapshot_hash="b" * 64,
    )
    previous["promotionState"] = "promoted"
    previous["evaluationResults"] = dict(COMPARED)
    atomic_write_json(releases / "release-1.json", previous)
    manifest = create_release_manifest(
        release_id="release-3",
        commit_sha="abcdef1",
        target_color="green",
        source_snapshot_hash=SNAPSHOT,
        previous_manifest=previous,
    )
    atomic_write_json(releases / "release-3.json", manifest)

    class Release:
        directory = releases
        path = releases / "release-3.json"
        previous_path = releases / "release-1.json"
        freshness = rows
        root = tmp_path

        def run(self, **overrides):
            arguments = {
                "releases_dir": releases,
                "previous_manifest_path": self.previous_path,
                "now": NOW,
                **overrides,
            }
            return preflight.run_release_preflight(self.path, **arguments)

        def reject(self, release_id="release-2", *, failed=("answerScore",), **changes):
            rejected = create_release_manifest(
                release_id=release_id,
                commit_sha="abcdef1",
                target_color="green",
                source_snapshot_hash=SNAPSHOT,
            )
            rejected.update(
                promotionState="rejected",
                validatedAt="2026-10-04T12:00:00Z",
                evaluationFingerprint=dict(FINGERPRINT),
                releasePolicyHash=release_policy_hash(),
                gates=[
                    {"name": "retrievalRecall", "passed": True, "overrideReason": None},
                    *(
                        {"name": name, "passed": False, "overrideReason": None}
                        for name in failed
                    ),
                ],
            )
            rejected.update(changes)
            atomic_write_json(releases / f"{release_id}.json", rejected)

        def overrides(self, gate="freshnessSla", snapshot=SNAPSHOT):
            path = tmp_path / "overrides.json"
            path.write_text(
                json.dumps(
                    {
                        gate: {
                            "reason": "Reviewed by the operator for this snapshot",
                            "sourceSnapshotHash": snapshot,
                        }
                    }
                )
            )
            return path

    return Release()


def problems(release, **arguments):
    with pytest.raises(preflight.PreflightFailed) as raised:
        release.run(**arguments)
    return " | ".join(raised.value.problems)


def test_sound_inputs_pass_and_report_what_was_checked(release):
    result = release.run()

    assert result["sourceSnapshotHash"] == SNAPSHOT
    assert result["releasePolicyHash"] == release_policy_hash()
    assert [family["sourceType"] for family in result["requiredFamilyFreshness"]] == REQUIRED
    assert all(family["fresh"] for family in result["requiredFamilyFreshness"])


def test_a_missing_identity_catalog_is_named_with_its_fix(release, monkeypatch):
    monkeypatch.delenv("EVAL_IDENTITY_CATALOG")

    assert "EVAL_IDENTITY_CATALOG is not set" in problems(release)


@pytest.mark.parametrize("content", ["not json", "[]", '{"sections": {}}'])
def test_an_unusable_identity_catalog_fails(release, monkeypatch, content):
    catalog = release.root / "broken-catalog.json"
    catalog.write_text(content)
    monkeypatch.setenv("EVAL_IDENTITY_CATALOG", str(catalog))

    assert "regenerate it with eval-identity-catalog" in problems(release)


def test_a_fingerprint_that_cannot_be_computed_fails(release, monkeypatch):
    def refuse(*, read_graph=True):
        raise ValueError("Release evaluations require answer verification")

    monkeypatch.setattr(evidence, "evaluation_fingerprint", refuse)

    assert "require answer verification" in problems(release)


def test_the_fingerprint_is_computed_without_reading_a_graph(release, monkeypatch):
    seen = []
    monkeypatch.setattr(
        evidence,
        "evaluation_fingerprint",
        lambda *, read_graph=True: seen.append(read_graph) or dict(FINGERPRINT),
    )

    release.run()

    assert seen == [False]


def test_a_release_needs_exactly_one_baseline(release):
    assert "exactly one baseline" in problems(release, previous_manifest_path=None)
    assert "exactly one baseline" in problems(
        release, baseline_evidence_path=release.previous_path
    )


def test_a_previous_manifest_without_a_compared_metric_fails(release):
    previous = load_json_object(release.previous_path)
    del previous["evaluationResults"]["answerScoreAllRows"]
    atomic_write_json(release.previous_path, previous)

    assert "no value for answerScoreAllRows" in problems(release)


def bootstrap_baseline(release, monkeypatch, *, fingerprint=FINGERPRINT, complete=True):
    def check(retrieval, answer):
        if not complete:
            raise ValueError("Release evidence must cover the complete benchmark exactly once")

    monkeypatch.setattr(evidence, "require_complete_results", check)
    path = release.root / "legacy-baseline.json"
    path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "fingerprint": fingerprint,
                "retrieval": {},
                "answer": {},
            }
        )
    )
    return {"previous_manifest_path": None, "baseline_evidence_path": path}


def test_matching_complete_baseline_evidence_passes(release, monkeypatch):
    assert release.run(**bootstrap_baseline(release, monkeypatch))


def test_baseline_evidence_from_another_configuration_fails(release, monkeypatch):
    arguments = bootstrap_baseline(
        release, monkeypatch, fingerprint={**FINGERPRINT, "implementationHash": "two"}
    )

    assert "run release-baseline again" in problems(release, **arguments)


def test_incomplete_baseline_evidence_fails(release, monkeypatch):
    arguments = bootstrap_baseline(release, monkeypatch, complete=False)

    assert "not complete release evidence" in problems(release, **arguments)


def test_baseline_comparison_ignores_what_only_a_built_graph_can_supply(release, monkeypatch):
    current = {**FINGERPRINT, "jev": {"sectionRolesEnabled": True, "annotationDigest": None}}
    monkeypatch.setattr(
        evidence, "evaluation_fingerprint", lambda *, read_graph=True: dict(current)
    )
    recorded = {
        **FINGERPRINT,
        "jev": {"sectionRolesEnabled": True, "annotationDigest": "from-the-graph"},
        "validationCorpusHash": "from-the-graph",
    }

    assert release.run(**bootstrap_baseline(release, monkeypatch, fingerprint=recorded))


@pytest.mark.parametrize(
    ("gate", "snapshot", "message"),
    [
        ("freshnessSla", "sha256:" + "c" * 64, "is bound to source snapshot"),
        ("answerScore", SNAPSHOT, "cannot be overridden"),
        ("noSuchGate", SNAPSHOT, "Unknown release gate override"),
    ],
)
def test_an_override_file_that_validation_would_refuse_fails(release, gate, snapshot, message):
    found = problems(release, override_path=release.overrides(gate, snapshot))

    assert message in found
    assert "unset RELEASE_OVERRIDE_FILE" in found


def test_a_stale_required_family_fails_and_names_the_two_ways_out(release):
    release.freshness[:] = fresh_rows(stale={"bulletin"})

    found = problems(release)

    assert "bulletin (last discovered" in found
    assert "CORPUS_JOB_MODE=discover" in found
    assert f"freshnessSla override bound to source snapshot {SNAPSHOT}" in found


def test_a_required_family_never_discovered_is_stale(release):
    release.freshness[:] = fresh_rows(never={"waiver"})

    assert "waiver (never discovered)" in problems(release)


def test_a_snapshot_bound_freshness_override_admits_a_stale_family(release):
    release.freshness[:] = fresh_rows(stale={"bulletin"})

    result = release.run(override_path=release.overrides("freshnessSla"))

    assert result["overriddenGates"] == ["freshnessSla"]


def test_every_problem_is_reported_in_one_run(release, monkeypatch):
    monkeypatch.delenv("EVAL_IDENTITY_CATALOG")
    release.freshness[:] = fresh_rows(stale={"bulletin"})

    found = problems(release, previous_manifest_path=None)

    assert "EVAL_IDENTITY_CATALOG" in found
    assert "exactly one baseline" in found
    assert "bulletin" in found


def test_preflight_freshness_follows_the_audit_rule(monkeypatch):
    rows = [
        {
            "source_type": source_type,
            "last_successful_discovery_at": (
                datetime.now(UTC) - timedelta(days=age)
            ).isoformat(),
        }
        for source_type, age in zip(REQUIRED, [0.1, 400, 0.1, 400])
    ]
    report = build_corpus_audit_report(
        source_families=CORPUS_MANIFEST.source_families,
        registry_rows=[],
        local_files=[],
        parsed_sidecars=[],
        graph_documents=[],
        source_freshness=rows,
    )
    audited = {
        family["source_type"]: family["freshness_status"] == "fresh"
        for family in report["source_families"]
        if family["required_for_answering"]
    }

    checked = {
        family["sourceType"]: family["fresh"]
        for family in preflight.required_family_freshness(rows)
    }

    assert checked == audited
    assert True in checked.values() and False in checked.values()


def already_rejected(release, **arguments):
    with pytest.raises(preflight.SnapshotAlreadyRejected) as raised:
        release.run(**arguments)
    return raised.value.rejection


def test_an_identical_release_already_rejected_at_a_gate_is_not_rebuilt(release):
    release.reject(failed=("answerScore", "withheldAnswers"))

    rejection = already_rejected(release)

    assert rejection["releaseId"] == "release-2"
    assert rejection["failedGates"] == ["answerScore", "withheldAnswers"]


@pytest.mark.parametrize(
    "changes",
    [
        {"sourceSnapshotHash": "sha256:" + "d" * 64},
        {"releasePolicyHash": "sha256:" + "e" * 64},
        {"evaluationFingerprint": {**FINGERPRINT, "implementationHash": "two"}},
        {"promotionState": "building"},
        {"promotionState": "validated"},
    ],
)
def test_a_rejection_does_not_block_once_what_decided_it_has_changed(release, changes):
    release.reject(**changes)

    assert release.run()


def test_a_rejection_for_staleness_alone_does_not_block(release):
    # Discovery timestamps are outside the snapshot hash: a crawl can cure it.
    release.reject(failed=("freshnessSla",))

    assert release.run()


def test_an_override_for_every_failed_gate_allows_the_rebuild(release):
    release.reject(failed=("answerReadyDrop",))

    assert release.run(override_path=release.overrides("answerReadyDrop"))


def test_an_override_for_one_of_two_failed_gates_does_not_allow_the_rebuild(release):
    release.reject(failed=("answerReadyDrop", "answerScore"))

    rejection = already_rejected(release, override_path=release.overrides("answerReadyDrop"))

    assert rejection["failedGates"] == ["answerScore"]


def test_a_gate_the_rejected_release_overrode_is_not_counted_against_it(release):
    release.reject()
    rejected = load_json_object(release.directory / "release-2.json")
    rejected["gates"] = [
        {"name": "answerReadyDrop", "passed": False, "overrideReason": "Reviewed drop"},
        {"name": "freshnessSla", "passed": False, "overrideReason": None},
    ]
    atomic_write_json(release.directory / "release-2.json", rejected)

    assert release.run()


def test_naming_the_rejected_release_allows_one_deliberate_retry(release):
    release.reject("release-2")

    assert release.run(retry_rejected="release-2")["retryOfRejectedRelease"] == "release-2"

    # The retry was rejected too: the same variable left set does not cover it.
    release.reject("release-2b", validatedAt="2026-10-05T09:00:00Z")
    assert already_rejected(release, retry_rejected="release-2")["releaseId"] == "release-2b"


def test_a_second_rejection_can_still_be_retried_by_naming_it(release):
    release.reject("release-2", validatedAt="2026-10-03T12:00:00Z")
    release.reject("release-2b", validatedAt="2026-10-04T12:00:00Z")

    # Naming the newest allows the build; the older one does not stand in its way.
    assert release.run(retry_rejected="release-2b")
    assert already_rejected(release, retry_rejected="release-2")["releaseId"] == "release-2b"
    assert already_rejected(release, retry_rejected="release-9")["releaseId"] == "release-2b"


def serve_this_snapshot(release, **changes):
    previous = load_json_object(release.previous_path)
    previous.update(
        {
            "sourceSnapshotHash": SNAPSHOT,
            "evaluationFingerprint": dict(FINGERPRINT),
            **changes,
        }
    )
    atomic_write_json(release.previous_path, previous)


def test_a_snapshot_that_is_already_the_serving_release_is_not_rebuilt(release):
    serve_this_snapshot(release)

    with pytest.raises(preflight.SnapshotAlreadyReleased) as raised:
        release.run()

    assert raised.value.release_id == "release-1"
    outcome = invoke(release)
    assert outcome.exit_code == preflight.ALREADY_RELEASED_EXIT_CODE == 22
    assert "already promoted as release release-1" in outcome.output


@pytest.mark.parametrize(
    "changes",
    [
        {"promotionState": "validated"},
        {"promotionState": "rolled_back"},
        {"sourceSnapshotHash": "sha256:" + "d" * 64},
        {"evaluationFingerprint": {**FINGERPRINT, "implementationHash": "two"}},
    ],
)
def test_a_serving_release_from_other_inputs_or_never_promoted_is_rebuilt(release, changes):
    serve_this_snapshot(release, **changes)

    assert release.run()


def test_a_jev_enabled_bootstrap_is_told_what_cannot_be_checked_before_the_build(
    release, monkeypatch
):
    assert release.run()["notices"] == []
    current = {**FINGERPRINT, "jev": {"sectionRolesEnabled": True, "annotationDigest": None}}
    monkeypatch.setattr(
        evidence, "evaluation_fingerprint", lambda *, read_graph=True: dict(current)
    )
    arguments = bootstrap_baseline(
        release,
        monkeypatch,
        fingerprint={**current, "jev": {**current["jev"], "annotationDigest": "legacy"}},
    )

    notices = release.run(**arguments)["notices"]

    assert len(notices) == 1
    assert "cannot be checked before the build" in notices[0]


def test_the_newest_matching_rejection_is_reported(release):
    release.reject("release-2", validatedAt="2026-10-03T12:00:00Z")
    release.reject("release-2b", validatedAt="2026-10-04T12:00:00Z")

    assert already_rejected(release)["releaseId"] == "release-2b"


def test_other_files_in_the_releases_directory_are_ignored(release):
    (release.directory / "legacy-baseline.json").write_text('{"schemaVersion": 1}')
    (release.directory / "truncated.json").write_text("{")
    (release.directory / "list.json").write_text("[]")

    assert release.run()


def test_input_problems_are_reported_before_an_earlier_rejection(release, monkeypatch):
    release.reject()
    monkeypatch.delenv("EVAL_IDENTITY_CATALOG")

    assert "EVAL_IDENTITY_CATALOG" in problems(release)


def invoke(release, *extra):
    from pipeline.cli import cli

    return CliRunner().invoke(
        cli,
        [
            "release-preflight",
            "--manifest", str(release.path),
            "--releases-dir", str(release.directory),
            "--previous-manifest", str(release.previous_path),
            *extra,
        ],
    )


def test_the_command_records_a_passed_stage_on_the_manifest(release):
    outcome = invoke(release)

    assert outcome.exit_code == 0, outcome.output
    stage = load_json_object(release.path)["stageResults"]["preflight"]
    assert stage["status"] == "passed"
    assert stage["result"]["sourceSnapshotHash"] == SNAPSHOT


def test_the_command_fails_with_every_fix_and_records_the_failure(release, monkeypatch):
    monkeypatch.delenv("EVAL_IDENTITY_CATALOG")
    release.freshness[:] = fresh_rows(stale={"bulletin"})

    outcome = invoke(release)

    assert outcome.exit_code == 1
    assert "Release preflight failed before the graph was reset" in outcome.output
    assert "EVAL_IDENTITY_CATALOG is not set" in outcome.output
    assert "bulletin" in outcome.output
    stage = load_json_object(release.path)["stageResults"]["preflight"]
    assert stage["status"] == "failed"


def test_the_command_exits_with_the_already_rejected_status(release):
    release.reject()

    outcome = invoke(release)

    assert outcome.exit_code == preflight.ALREADY_REJECTED_EXIT_CODE == 21
    assert "RELEASE_RETRY_REJECTED=release-2" in outcome.output
    stage = load_json_object(release.path)["stageResults"]["preflight"]
    assert stage["status"] == "failed"
    assert "release-2" in stage["error"]

    assert invoke(release, "--retry-rejected", "release-2").exit_code == 0


def test_fingerprint_before_the_build_leaves_out_graph_values(tmp_path, monkeypatch):
    from tests.test_evaluation_evidence import fake_repository

    fake_repository(tmp_path, monkeypatch)
    monkeypatch.setenv("JEV_SECTION_ROLES_ENABLED", "true")

    def no_graph():
        raise AssertionError("the preflight fingerprint must not read a graph")

    monkeypatch.setattr("pipeline.graph.connection.get_session", no_graph)

    fingerprint = evidence.evaluation_fingerprint(read_graph=False)

    assert fingerprint["jev"]["annotationDigest"] is None
    recorded = {
        **fingerprint,
        "jev": {**fingerprint["jev"], "annotationDigest": "digest"},
        "validationCorpusHash": "corpus",
    }
    assert preflight.graph_independent(recorded) == fingerprint


def test_statute_freshness_is_not_a_discovery_gate():
    # The statute source is a GovInfo compilation whose processedDate can be
    # months old while the text is current; the freshness gate covers crawled
    # families only, and the manifest's federal_statute SLA is read by nothing
    # that decides a release.
    rows = [
        {"source_type": "federal_statute", "last_successful_discovery_at": "2026-02-20T00:00:00+00:00"},
        *fresh_rows(),
    ]
    assert "federal_statute" not in {row["sourceType"] for row in preflight.required_family_freshness(rows)}
    report = build_corpus_audit_report(
        source_families=CORPUS_MANIFEST.source_families,
        registry_rows=[],
        local_files=[],
        parsed_sidecars=[],
        graph_documents=[],
        source_freshness=rows,
    )
    assert "federal_statute" not in {family["source_type"] for family in report["source_families"]}
