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
        from pipeline.freshness import build_answer_ready_snapshot
        from pipeline.source_lifecycle import read_table

        report["source_classifications"] = read_table(
            CRAWLER_DB_PATH, "source_classifications"
        )
        report["source_retirements"] = read_table(CRAWLER_DB_PATH, "source_retirements")
        from pipeline.answer_scope import scoped_failure_count, scope_records

        report["answer_scope_records"] = scope_records(CRAWLER_DB_PATH)
        report["scoped_required_failure_count"] = scoped_failure_count(
            [*report["unresolved"], *report["unresolved_downloads"]], CRAWLER_DB_PATH
        )
        report["blocking_required_failure_count"] = (
            report["unresolved_required_count"]
            - report["scoped_required_failure_count"]
        )
        report["complete_snapshot"] = build_answer_ready_snapshot()
        atomic_write_json(output, report)
    click.echo(
        json.dumps(
            {
                "active_source_count": report["active_source_count"],
                "unresolved_required_count": report["unresolved_required_count"],
                "scoped_required_failure_count": report[
                    "scoped_required_failure_count"
                ],
                "blocking_required_failure_count": report[
                    "blocking_required_failure_count"
                ],
                "unresolved_required_download_count": report[
                    "unresolved_required_download_count"
                ],
                "undocumented_removals": len(report["undocumented_removals"]),
                "output": str(output),
            }
        )
    )
    if report["blocking_required_failure_count"] or report["undocumented_removals"]:
        raise click.ClickException("Source inventory still blocks release")


@cli.command("source-scope")
@click.option(
    "--evidence",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    required=True,
)
@click.option("--apply", is_flag=True)
def source_scope(evidence: Path, apply: bool) -> None:
    """Validate a qualified product-scope bundle; preserve unresolved source state."""
    from pipeline.answer_scope import apply_answer_scope

    if CORPUS_DATA_ROOT is None:
        raise click.ClickException("CORPUS_DATA_ROOT is required")
    click.echo(
        json.dumps(
            apply_answer_scope(
                CORPUS_DATA_ROOT, json.loads(evidence.read_text()), apply=apply
            )
        )
    )


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


@cli.command("source-audit")
@click.option("--reviewed", type=click.Path(path_type=Path, exists=True, dir_okay=False))
@click.option("--collect-input", type=click.Path(path_type=Path, exists=True, dir_okay=False), help="Locked registry selection to collect or resume")
@click.option("--output", type=click.Path(path_type=Path, file_okay=False), help="Private capture directory")
@click.option("--apply", is_flag=True, help="Apply reviewed dispositions; otherwise validate only")
def source_audit(reviewed: Path | None, collect_input: Path | None, output: Path | None, apply: bool) -> None:
    """Collect resumable evidence or validate/apply explicitly reviewed dispositions."""
    from pipeline.source_audit import apply_source_audit
    if CORPUS_DATA_ROOT is None:
        raise click.ClickException("CORPUS_DATA_ROOT is required")
    if collect_input:
        if reviewed or apply or not output:
            raise click.UsageError("Collection requires --output and cannot apply dispositions")
        import subprocess
        import sqlite3
        from pipeline.release import REPO_ROOT
        from pipeline.source_lifecycle import stable_hash
        selection = json.loads(collect_input.read_text())
        with corpus_writer_lock(CORPUS_DATA_ROOT), sqlite3.connect(f"file:{CRAWLER_DB_PATH}?mode=ro", uri=True) as db:
            db.row_factory = sqlite3.Row
            for row in selection["documents"]:
                current = db.execute("SELECT * FROM documents WHERE source_url=?", (row["source_url"],)).fetchone()
                if current is None or stable_hash(dict(current)) != stable_hash(row):
                    raise click.ClickException("Registry differs from the selected audit snapshot")
        subprocess.run(["node", str(REPO_ROOT / "node_modules/tsx/dist/cli.mjs"), str(REPO_ROOT / "packages/crawler/src/index.ts"), "source-audit-collect", "--input", str(collect_input.resolve()), "--output", str(output.resolve())], check=True)
        return
    if not reviewed or output:
        raise click.UsageError("Specify --reviewed, or --collect-input with --output")
    click.echo(json.dumps(apply_source_audit(CORPUS_DATA_ROOT, json.loads(reviewed.read_text()), apply=apply)))
