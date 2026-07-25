"""Corpus freshness CLI commands."""

from pathlib import Path
import json

import click

from pipeline.cli._shared import cli, console
from pipeline.config import PARSED_DATA_DIR
from pipeline.freshness import (
    acknowledge_answer_ready_snapshot,
    compare_answer_ready_snapshot,
)


@cli.command("answer-ready-snapshot")
@click.option(
    "--state-file",
    required=True,
    type=click.Path(path_type=Path),
    help="Persistent snapshot state used for change comparison.",
)
@click.option(
    "--parsed-dir",
    type=click.Path(path_type=Path),
    default=PARSED_DATA_DIR,
    show_default=True,
)
@click.option(
    "--json-output",
    type=click.Path(path_type=Path),
    help="Optional path for the comparison result.",
)
@click.option(
    "--acknowledge/--no-acknowledge",
    default=True,
    help="Persist the snapshot as delivered (disable before an external trigger).",
)
def answer_ready_snapshot(
    state_file: Path,
    parsed_dir: Path,
    json_output: Path | None,
    acknowledge: bool,
) -> None:
    """Detect changes among successfully parsed answer-ready documents."""
    result = compare_answer_ready_snapshot(state_file, parsed_dir)
    if json_output:
        json_output.parent.mkdir(parents=True, exist_ok=True)
        json_output.write_text(json.dumps(result, indent=2) + "\n")
    if acknowledge:
        acknowledge_answer_ready_snapshot(state_file, result)
    console.print(json.dumps(result, sort_keys=True))


@cli.command("acknowledge-answer-ready-snapshot")
@click.option(
    "--state-file",
    required=True,
    type=click.Path(path_type=Path),
    help="Persistent path for the last delivered snapshot.",
)
@click.option(
    "--snapshot-file",
    required=True,
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    help="Comparison result accepted by the release endpoint.",
)
def acknowledge_answer_ready_snapshot_command(
    state_file: Path,
    snapshot_file: Path,
) -> None:
    """Acknowledge the exact snapshot accepted by the release endpoint."""
    snapshot = json.loads(snapshot_file.read_text())
    acknowledge_answer_ready_snapshot(state_file, snapshot)
    console.print(json.dumps(snapshot, sort_keys=True))
