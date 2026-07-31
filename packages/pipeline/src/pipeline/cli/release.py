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
def release_validate(
    manifest: Path,
    previous_manifest: Path | None,
    override_file: Path | None,
) -> None:
    """Audit and evaluate the release, failing closed on every missing gate."""
    from pipeline.audit import run_corpus_audit
    from pipeline.eval.runner import run_eval

    release = load_json_object(manifest)
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
