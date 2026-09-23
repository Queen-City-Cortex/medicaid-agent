"""Owned corpus release build, validation, and lifecycle commands."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import click

from pipeline.cli._shared import cli, console
from pipeline.config import EVAL_RESULTS_DIR, PARSED_DATA_DIR
from pipeline.freshness import build_answer_ready_snapshot
from pipeline.release import (
    append_release_event,
    atomic_write_json,
    build_release_graph,
    create_release_manifest,
    find_cleanup_candidate,
    find_color_retention_blocker,
    finalize_release_manifest,
    inspect_release_graph,
    load_json_object,
    mark_graph_release,
    mark_manifest_cutover_restored,
    mark_manifest_promoted,
    mark_manifest_recovery_pending,
    mark_manifest_rolled_back,
    mark_release_service_stopped,
    record_release_stage,
    require_rollback_available,
    source_snapshot_hash,
)


def _parse_strict() -> dict:
    from pipeline.parse.converter import parse_all
    from pipeline.config import CRAWLER_DB_PATH
    from pipeline.retirement import require_documented_removals
    from pipeline.recovery_inventory import require_downloaded_sources

    require_downloaded_sources(CRAWLER_DB_PATH)
    require_documented_removals(CRAWLER_DB_PATH)
    result = parse_all()
    errors = int(result.get("errors", 0))
    timed_out = int(result.get("timed_out", 0))
    remaining_failures = int(result.get("remaining_required_failures", 0))
    terminal_state = result.get("terminal_state")
    if remaining_failures or terminal_state != "completed":
        raise RuntimeError(
            f"parse reported {errors} errors, {timed_out} timeouts, "
            f"{remaining_failures} remaining required failures, and "
            f"terminal state {terminal_state!r}"
        )
    return result


def _require_parse_inventory_unchanged(release: dict) -> dict:
    from pipeline.parse.converter import build_parse_inventory_evidence
    from pipeline.config import CRAWLER_DB_PATH
    from pipeline.retirement import require_documented_removals
    from pipeline.recovery_inventory import require_downloaded_sources

    require_downloaded_sources(CRAWLER_DB_PATH)
    require_documented_removals(CRAWLER_DB_PATH)
    expected = (
        release.get("stageResults", {})
        .get("parse", {})
        .get("result", {})
        .get("inventory_evidence")
    )
    if not isinstance(expected, dict) or not expected.get("inventory_hash"):
        raise RuntimeError("release manifest is missing parse inventory evidence")
    current = build_parse_inventory_evidence()
    if current.get("inventory_hash") != expected.get("inventory_hash"):
        raise RuntimeError(
            "active parse inventory changed after release preparation: "
            f"expected {expected.get('inventory_hash')}, got {current.get('inventory_hash')}"
        )
    from pipeline.freshness import build_answer_ready_snapshot
    from pipeline.release import source_snapshot_hash
    snapshot = source_snapshot_hash(build_answer_ready_snapshot())
    if snapshot != release.get("sourceSnapshotHash"):
        raise RuntimeError("Complete source snapshot changed after release preparation")
    return current


@cli.command("release-prepare")
@click.option("--release-id", required=True)
@click.option("--commit-sha", required=True)
@click.option(
    "--target-color",
    type=click.Choice(["blue", "green"]),
    required=True,
)
@click.option(
    "--previous-manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    default=None,
)
@click.option(
    "--output",
    type=click.Path(path_type=Path, dir_okay=False),
    required=True,
)
def release_prepare(
    release_id: str,
    commit_sha: str,
    target_color: str,
    previous_manifest: Path | None,
    output: Path,
) -> None:
    """Parse strictly and initialize a durable release manifest."""
    previous = load_json_object(previous_manifest) if previous_manifest else None
    initial_snapshot = build_answer_ready_snapshot(PARSED_DATA_DIR)
    manifest = create_release_manifest(
        release_id=release_id,
        commit_sha=commit_sha,
        target_color=target_color,
        source_snapshot_hash=source_snapshot_hash(initial_snapshot),
        previous_manifest=previous,
    )
    atomic_write_json(output, manifest)
    record_release_stage(output, "parse", _parse_strict)

    final_snapshot = build_answer_ready_snapshot(PARSED_DATA_DIR)
    manifest = load_json_object(output)
    manifest["sourceSnapshotHash"] = source_snapshot_hash(final_snapshot)
    manifest["answerReadySnapshot"] = {
        "answerReadyDocuments": final_snapshot["answer_ready_documents"],
    }
    atomic_write_json(output, manifest)
    console.print(json.dumps(manifest, sort_keys=True))


@cli.command("release-build-graph")
@click.option(
    "--manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
@click.option(
    "--refresh-federal/--use-federal-cache",
    default=True,
    show_default=True,
)
def release_build_graph(manifest: Path, refresh_federal: bool) -> None:
    """Reset and rebuild the selected inactive release graph."""
    build_release_graph(manifest, refresh_federal=refresh_federal)
    console.print(json.dumps(load_json_object(manifest), sort_keys=True))


@cli.command("release-validate")
@click.option(
    "--manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
@click.option(
    "--previous-manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    default=None,
)
@click.option(
    "--override-file",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    default=None,
)
@click.option(
    "--baseline-evidence",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    default=None,
)
def release_validate(
    manifest: Path,
    previous_manifest: Path | None,
    override_file: Path | None,
    baseline_evidence: Path | None = None,
) -> None:
    """Audit and evaluate the release, failing closed on every missing gate."""
    from pipeline.audit import run_corpus_audit
    from pipeline.eval.runner import run_eval

    from pipeline.evaluation_evidence import (
        baseline_metrics,
        evaluation_fingerprint,
        require_complete_results,
        verification_summary,
    )

    if baseline_evidence and previous_manifest:
        raise click.ClickException(
            "Choose bootstrap baseline evidence or a previous release, not both"
        )
    baseline = load_json_object(baseline_evidence) if baseline_evidence else None
    metrics = baseline_metrics(baseline) if baseline else None
    release = load_json_object(manifest)
    release["evaluationFingerprint"] = evaluation_fingerprint()
    if baseline:
        release["baselineEvidence"] = baseline
    atomic_write_json(manifest, release)
    _require_parse_inventory_unchanged(release)
    release_id = release["releaseId"]
    release_dir = manifest.parent / release_id
    audit_json = release_dir / "corpus-audit.json"
    audit_markdown = release_dir / "corpus-audit.md"

    audit_payload: dict = {}

    def audit_operation() -> dict:
        nonlocal audit_payload
        result = run_corpus_audit(
            json_output_path=audit_json,
            markdown_output_path=audit_markdown,
        )
        audit_payload = result["report"]
        if audit_payload.get("graph_error"):
            raise RuntimeError(
                f"corpus audit could not read the release graph: "
                f"{audit_payload['graph_error']}"
            )
        return {
            "jsonPath": str(audit_json),
            "markdownPath": str(audit_markdown),
            "summary": audit_payload["summary"],
        }

    record_release_stage(manifest, "audit", audit_operation)
    graph_metrics = record_release_stage(
        manifest,
        "graphValidation",
        lambda: inspect_release_graph(int(release["embeddingDimensions"])),
    )

    retrieval_result: dict = {}

    def retrieval_operation() -> dict:
        nonlocal retrieval_result
        retrieval_result = run_eval(level="retrieval")
        if "error" in retrieval_result:
            raise RuntimeError(retrieval_result["error"])
        source = EVAL_RESULTS_DIR / f"{retrieval_result['run_id']}_retrieval.json"
        destination = release_dir / "retrieval-evaluation.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        return {
            "runId": retrieval_result["run_id"],
            "aggregate": retrieval_result["aggregate"],
            "evidencePath": str(destination),
        }

    record_release_stage(manifest, "retrievalEvaluation", retrieval_operation)

    answer_result: dict = {}

    def answer_operation() -> dict:
        nonlocal answer_result
        answer_result = run_eval(level="answer")
        if "error" in answer_result:
            raise RuntimeError(answer_result["error"])
        source = EVAL_RESULTS_DIR / f"{answer_result['run_id']}_answer.json"
        destination = release_dir / "answer-evaluation.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        return {
            "runId": answer_result["run_id"],
            "aggregate": answer_result["aggregate"],
            "evidencePath": str(destination),
        }

    record_release_stage(manifest, "answerEvaluation", answer_operation)

    require_complete_results(retrieval_result, answer_result)
    if release["evaluationFingerprint"] != evaluation_fingerprint():
        raise click.ClickException(
            "Evaluation configuration changed during candidate validation"
        )
    current = load_json_object(manifest)
    current["verificationSummary"] = verification_summary(answer_result)
    if baseline:
        current["baselineVerificationSummary"] = verification_summary(
            baseline["answer"]
        )
    atomic_write_json(manifest, current)
    previous = load_json_object(previous_manifest) if previous_manifest else None
    overrides = load_json_object(override_file) if override_file else {}
    finalized = finalize_release_manifest(
        manifest,
        audit_report=audit_payload,
        graph_metrics=graph_metrics,
        retrieval_result=retrieval_result,
        answer_result=answer_result,
        previous_manifest=previous,
        overrides=overrides,
        baseline_evaluation=metrics,
    )
    if finalized["promotionState"] != "validated":
        failed = [
            gate["name"]
            for gate in finalized["gates"]
            if not gate["passed"] and not gate["overrideReason"]
        ]
        raise click.ClickException(f"Corpus release rejected by: {', '.join(failed)}")

    record_release_stage(
        manifest,
        "graphReleaseMarker",
        lambda: mark_graph_release(finalized),
    )
    console.print(json.dumps(load_json_object(manifest), sort_keys=True))


@cli.command("release-mark-promoted")
@click.option(
    "--manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
@click.option(
    "--previous-manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    default=None,
)
def release_mark_promoted(
    manifest: Path,
    previous_manifest: Path | None,
) -> None:
    """Record a verified promotion and the old graph retention deadlines."""
    promoted = mark_manifest_promoted(
        manifest,
        previous_manifest_path=previous_manifest,
    )
    console.print(json.dumps(promoted, sort_keys=True))


@cli.command("release-mark-rolled-back")
@click.option(
    "--current-manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
@click.option(
    "--previous-manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
def release_mark_rolled_back(
    current_manifest: Path,
    previous_manifest: Path,
) -> None:
    """Record a verified rollback in both immutable release histories."""
    current, previous = mark_manifest_rolled_back(
        current_manifest,
        previous_manifest,
    )
    console.print(
        json.dumps(
            {"current": current, "previous": previous},
            sort_keys=True,
        )
    )


@cli.command("release-mark-cutover-restored")
@click.option(
    "--current-manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
@click.option(
    "--previous-manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
def release_mark_cutover_restored(
    current_manifest: Path,
    previous_manifest: Path,
) -> None:
    """Record compensation after the previous target was verified restored."""
    current, previous = mark_manifest_cutover_restored(
        current_manifest,
        previous_manifest,
    )
    console.print(
        json.dumps(
            {"current": current, "previous": previous},
            sort_keys=True,
        )
    )


@cli.command("release-mark-recovery-pending")
@click.option(
    "--manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
@click.option("--previous-release-id", required=True)
@click.option("--reason", required=True)
def release_mark_recovery_pending(
    manifest: Path,
    previous_release_id: str,
    reason: str,
) -> None:
    """Record a durable recovery state before restoring the previous target."""
    updated = mark_manifest_recovery_pending(
        manifest,
        previous_release_id,
        reason,
    )
    console.print(json.dumps(updated, sort_keys=True))


@cli.command("release-event")
@click.option(
    "--manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
@click.option("--type", "event_type", required=True)
@click.option("--details", default="{}", help="JSON object with event details")
def release_event(
    manifest: Path,
    event_type: str,
    details: str,
) -> None:
    """Append an operational event without rewriting release evidence."""
    parsed_details = json.loads(details)
    if not isinstance(parsed_details, dict):
        raise click.ClickException("--details must be a JSON object")
    updated = append_release_event(manifest, event_type, parsed_details)
    console.print(json.dumps(updated, sort_keys=True))


@cli.command("release-mark-graph")
@click.option(
    "--manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
@click.option(
    "--state",
    "promotion_state",
    type=click.Choice(["validated", "promoted", "rolled_back"]),
    required=True,
)
def release_mark_graph(
    manifest: Path,
    promotion_state: str,
) -> None:
    """Update the selected graph's release marker lifecycle state."""
    result = mark_graph_release(
        load_json_object(manifest),
        promotion_state=promotion_state,
    )
    console.print(json.dumps(result, sort_keys=True))


@cli.command("release-retention-check")
@click.option(
    "--releases-dir",
    type=click.Path(path_type=Path, file_okay=False),
    required=True,
)
@click.option(
    "--target-color",
    type=click.Choice(["blue", "green"]),
    required=True,
)
def release_retention_check(
    releases_dir: Path,
    target_color: str,
) -> None:
    """Block resetting a color while its previous volume must be retained."""
    blocker = find_color_retention_blocker(releases_dir, target_color)
    if blocker:
        console.print(json.dumps(blocker, sort_keys=True))
        raise click.ClickException(
            f"neo4j-{target_color} retains release "
            f"{blocker['releaseId']} until {blocker['volumeRetainUntil']}"
        )
    console.print(json.dumps({"blocked": False}, sort_keys=True))


@cli.command("release-cleanup-candidate")
@click.option(
    "--releases-dir",
    type=click.Path(path_type=Path, file_okay=False),
    required=True,
)
@click.option("--current-release-id", required=True)
@click.option(
    "--inactive-color",
    type=click.Choice(["blue", "green"]),
    required=True,
)
def release_cleanup_candidate(
    releases_dir: Path,
    current_release_id: str,
    inactive_color: str,
) -> None:
    """Print the old graph eligible to stop after the rollback window."""
    candidate = find_cleanup_candidate(
        releases_dir,
        current_release_id=current_release_id,
        inactive_color=inactive_color,
    )
    console.print(json.dumps(candidate or {}, sort_keys=True))


@cli.command("release-check-rollback")
@click.option(
    "--previous-manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
def release_check_rollback(previous_manifest: Path) -> None:
    """Fail before cutover when the previous graph is outside its window."""
    require_rollback_available(load_json_object(previous_manifest))
    console.print(json.dumps({"available": True}, sort_keys=True))


@cli.command("release-mark-service-stopped")
@click.option(
    "--manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
@click.option("--service", required=True)
def release_mark_service_stopped(manifest: Path, service: str) -> None:
    """Record that a superseded graph stopped after its rollback window."""
    updated = mark_release_service_stopped(manifest, service)
    console.print(json.dumps(updated, sort_keys=True))


@cli.command("release-baseline")
@click.option("--release-id", required=True)
@click.option(
    "--output", type=click.Path(path_type=Path, dir_okay=False), required=True
)
def release_baseline(release_id: str, output: Path) -> None:
    """Evaluate the current graph without fabricating a previous release manifest."""
    from pipeline.evaluation_evidence import (
        evaluation_fingerprint,
        require_complete_results,
        verification_summary,
    )
    from pipeline.eval.runner import run_eval
    from pipeline.graph.connection import get_session

    def verify_target():
        with get_session() as session:
            row = session.run(
                "MATCH (r:CorpusRelease {id:'current'}) RETURN r.release_id AS id"
            ).single()
            if not row or row["id"] != release_id:
                raise click.ClickException(
                    "Baseline graph release does not match --release-id"
                )

    verify_target()
    fingerprint = evaluation_fingerprint()
    retrieval = run_eval(level="retrieval")
    answer = run_eval(level="answer")
    require_complete_results(retrieval, answer)
    if fingerprint != evaluation_fingerprint():
        raise click.ClickException(
            "Evaluation configuration changed during the baseline"
        )
    verify_target()
    atomic_write_json(
        output,
        {
            "schemaVersion": 1,
            "releaseId": release_id,
            "fingerprint": fingerprint,
            "retrieval": retrieval,
            "answer": answer,
            "verificationSummary": verification_summary(answer),
        },
    )
    click.echo(str(output))


@cli.command("release-activate-bootstrap")
@click.option(
    "--manifest",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
@click.option(
    "--backup-receipt",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
def release_activate_bootstrap(manifest: Path, backup_receipt: Path) -> None:
    """Activate a validated initial corpus, or restore an interrupted cutover."""
    import hashlib
    import os
    import subprocess
    from neo4j import GraphDatabase
    from pipeline.bootstrap_activation import RailwayTarget, activate
    from pipeline.config import CORPUS_DATA_ROOT
    from pipeline.evaluation_evidence import baseline_metrics, evaluation_fingerprint
    from pipeline.release import (
        REPO_ROOT,
        evaluate_release_manifest,
        release_is_promotable,
    )
    from pipeline.retirement import corpus_writer_lock

    if CORPUS_DATA_ROOT is None:
        raise click.ClickException("CORPUS_DATA_ROOT is required")
    release = load_json_object(manifest)
    color = release["targetColor"]
    if color not in {"blue", "green"}:
        raise click.ClickException("Invalid target color")
    target = {
        "NEO4J_URI": os.environ[f"NEO4J_{color.upper()}_URI"],
        "NEO4J_PASSWORD": os.environ[f"NEO4J_{color.upper()}_PASSWORD"],
        "CORPUS_RELEASE_ID": release["releaseId"],
        "ACTIVE_CORPUS_COLOR": color,
    }
    state = (
        CORPUS_DATA_ROOT
        / "pipeline/private-activation"
        / release["releaseId"]
        / "state.json"
    )

    def upload():
        subprocess.run(
            [
                "bash",
                str(REPO_ROOT / "scripts/ops/upload-release-manifest.sh"),
                str(manifest),
                f"releases/{release['releaseId']}/manifest.json",
            ],
            check=True,
        )

    def preflight():
        for key in [
            "SYNTHETIC_USER_EMAIL",
            "SYNTHETIC_USER_PASSWORD",
            "WORKOS_CLIENT_ID",
            "WORKOS_API_KEY",
        ]:
            if not os.environ.get(key):
                raise RuntimeError(f"Fresh release authentication requires {key}")
        current = load_json_object(manifest)
        if current.get("promotionState") != "validated" or not release_is_promotable(
            evaluate_release_manifest(current)
        ):
            raise RuntimeError("Candidate has not passed every release gate")
        baseline_metrics(current.get("baselineEvidence", {}))
        if current.get("evaluationFingerprint") != evaluation_fingerprint():
            raise RuntimeError("Candidate evaluation configuration mismatch")
        _require_parse_inventory_unchanged(current)
        if (
            source_snapshot_hash(build_answer_ready_snapshot(PARSED_DATA_DIR))
            != current["sourceSnapshotHash"]
        ):
            raise RuntimeError("Source snapshot changed after validation")
        receipt = load_json_object(backup_receipt)
        if (
            receipt.get("schemaVersion") != 1
            or receipt.get("sqliteIntegrity") != "ok"
            or receipt.get("sourceSnapshotHash") != current["sourceSnapshotHash"]
            or not receipt.get("archiveObject")
            or len(receipt.get("archiveSha256", "")) != 64
            or not receipt.get("decryptionVerified")
        ):
            raise RuntimeError("A restored backup of this source snapshot is required")
        objects = [(manifest, "manifest.json")]
        objects += [
            (manifest.parent / release["releaseId"] / name, "evidence/" + name)
            for name in [
                "corpus-audit.json",
                "retrieval-evaluation.json",
                "answer-evaluation.json",
            ]
        ]
        for local, remote in objects:
            check = subprocess.run(
                [
                    "bash",
                    "-c",
                    'source "$1"; configure_release_remote; rclone cat "$(release_object_path "$2")"',
                    "check-upload",
                    str(REPO_ROOT / "scripts/ops/object-storage-lib.sh"),
                    f"releases/{release['releaseId']}/{remote}",
                ],
                capture_output=True,
                check=True,
                timeout=120,
            )
            if (
                hashlib.sha256(check.stdout).digest()
                != hashlib.sha256(local.read_bytes()).digest()
            ):
                raise RuntimeError(
                    "Uploaded release evidence differs from local evidence"
                )
        with GraphDatabase.driver(
            target["NEO4J_URI"],
            auth=(os.environ.get("NEO4J_USER", "neo4j"), target["NEO4J_PASSWORD"]),
        ) as driver:
            with driver.session() as session:
                row = session.run(
                    "MATCH (r:CorpusRelease {id:'current'}) RETURN r.release_id AS id,r.source_snapshot_hash AS hash,r.promotion_state AS state"
                ).single()
                if (
                    not row
                    or row["id"] != release["releaseId"]
                    or row["hash"] != current["sourceSnapshotHash"]
                    or row["state"] != "validated"
                ):
                    raise RuntimeError(
                        "Candidate graph marker does not match the validated release"
                    )

    def mark_graph(state_name):
        env = {
            **os.environ,
            "NEO4J_URI": target["NEO4J_URI"],
            "NEO4J_PASSWORD": target["NEO4J_PASSWORD"],
        }
        import sys

        subprocess.run(
            [
                sys.executable,
                "-m",
                "pipeline.cli",
                "release-mark-graph",
                "--manifest",
                str(manifest),
                "--state",
                state_name,
            ],
            env=env,
            check=True,
            stdout=subprocess.DEVNULL,
        )

    def publish(receipt):
        append_release_event(manifest, "bootstrap_browser_verified", receipt)
        mark_graph("promoted")
        mark_manifest_promoted(manifest)
        upload()

    def restored():
        current = load_json_object(manifest)
        current["promotionState"] = "validated"
        current["promotedAt"] = None
        atomic_write_json(manifest, current)
        append_release_event(manifest, "bootstrap_legacy_restored")
        mark_graph("validated")
        upload()

    with corpus_writer_lock(CORPUS_DATA_ROOT):
        result = activate(
            state_path=state,
            release_id=release["releaseId"],
            target=target,
            railway=RailwayTarget(),
            preflight=preflight,
            publish=publish,
            restore_record=restored,
            baseline_release_id=release.get("baselineEvidence", {}).get("releaseId"),
        )
        click.echo(json.dumps(result))
