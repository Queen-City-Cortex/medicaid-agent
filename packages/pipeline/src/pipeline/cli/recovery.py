"""Operator commands: all private corpus mutations hold the volume writer lock."""

import json
from pathlib import Path

import click

from pipeline.cli._shared import cli
from pipeline.config import CORPUS_DATA_ROOT, CRAWLER_DB_PATH
from pipeline.retirement import corpus_writer_lock, retire_source, undocumented_removals


@cli.command("recovery-inventory")
@click.option(
    "--output", type=click.Path(path_type=Path, dir_okay=False), required=True
)
def recovery_inventory(output: Path) -> None:
    """Record the whole active parse inventory and undocumented exclusions."""
    from pipeline.parse.converter import build_parse_inventory_evidence
    from pipeline.release import atomic_write_json
    from pipeline.recovery_inventory import missing_source_payloads

    if CORPUS_DATA_ROOT is None:
        raise click.ClickException("CORPUS_DATA_ROOT is required")
    with corpus_writer_lock(CORPUS_DATA_ROOT):
        report = build_parse_inventory_evidence()
        report["unresolved_downloads"] = missing_source_payloads(CRAWLER_DB_PATH)
        report["unresolved_required_download_count"] = sum(
            row["required_for_answering"] for row in report["unresolved_downloads"]
        )
        report["unresolved_required_count"] += report[
            "unresolved_required_download_count"
        ]
        report["unresolved_count"] += len(report["unresolved_downloads"])
        report["unresolved_optional_count"] += sum(
            not row["required_for_answering"] for row in report["unresolved_downloads"]
        )
        report["active_file_count"] = report["active_source_count"]
        report["active_source_count"] += len(report["unresolved_downloads"])
        report["undocumented_removals"] = undocumented_removals(CRAWLER_DB_PATH)
        atomic_write_json(output, report)
    click.echo(
        json.dumps(
            {
                "active_source_count": report["active_source_count"],
                "unresolved_required_count": report["unresolved_required_count"],
                "unresolved_required_download_count": report[
                    "unresolved_required_download_count"
                ],
                "undocumented_removals": len(report["undocumented_removals"]),
                "output": str(output),
            }
        )
    )
    if report["unresolved_required_count"] or report["undocumented_removals"]:
        raise click.ClickException("Source inventory still blocks release")


@cli.command("parse-import")
@click.argument("bundle", type=click.Path(path_type=Path, exists=True, file_okay=False))
@click.option("--apply", is_flag=True)
def parse_import(bundle: Path, apply: bool) -> None:
    """Validate a recovered parse bundle; apply only when explicitly requested."""
    from pipeline.recovery_import import main

    main([str(bundle), *(["--apply"] if apply else [])])


@cli.command("retire-source")
@click.option(
    "--evidence",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
@click.option("--apply", is_flag=True)
def retire(evidence: Path, apply: bool) -> None:
    """Validate official-source retirement evidence, retaining all original files."""
    if CORPUS_DATA_ROOT is None:
        raise click.ClickException("CORPUS_DATA_ROOT is required")
    click.echo(
        json.dumps(
            retire_source(
                CORPUS_DATA_ROOT, json.loads(evidence.read_text()), apply=apply
            )
        )
    )
