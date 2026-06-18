"""Corpus audit and fee-schedule backlog commands."""

import json
from pathlib import Path

import click

from pipeline.cli._shared import cli, console


def _run_fee_schedule_backlog(
    *,
    json_output_path: Path | None = None,
    markdown_output_path: Path | None = None,
    group_limit: int = 25,
    candidate_limit: int = 50,
) -> dict:
    from pipeline.audit import read_registry_rows
    from pipeline.config import AUDIT_DATA_DIR
    from pipeline.source_selection import (
        build_fee_schedule_backlog_report,
        render_fee_schedule_backlog_markdown,
    )

    report = build_fee_schedule_backlog_report(
        read_registry_rows(),
        group_limit=group_limit,
        candidate_limit=candidate_limit,
    )
    markdown = render_fee_schedule_backlog_markdown(report)

    output_dir = AUDIT_DATA_DIR
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = json_output_path or output_dir / "latest-fee-schedule-backlog.json"
    md_path = markdown_output_path or output_dir / "latest-fee-schedule-backlog.md"
    json_path.write_text(json.dumps(report, indent=2))
    md_path.write_text(markdown)

    return {
        "report": report,
        "markdown": markdown,
        "json_path": str(json_path),
        "markdown_path": str(md_path),
    }


@cli.command("audit-corpus")
@click.option("--json-out", type=click.Path(path_type=Path), default=None, help="Optional JSON output path")
@click.option("--markdown-out", type=click.Path(path_type=Path), default=None, help="Optional Markdown output path")
def audit_corpus(json_out: Path | None, markdown_out: Path | None):
    """Audit corpus completeness across discovery, download, parse, load, and answer-readiness."""
    from pipeline.audit import run_corpus_audit

    result = run_corpus_audit(json_output_path=json_out, markdown_output_path=markdown_out)
    console.print(result["markdown"])
    console.print(f"[bold]JSON:[/bold] {result['json_path']}")
    console.print(f"[bold]Markdown:[/bold] {result['markdown_path']}")


@cli.command("fee-schedule-backlog")
@click.option("--json-out", type=click.Path(path_type=Path), default=None, help="Optional JSON output path")
@click.option("--markdown-out", type=click.Path(path_type=Path), default=None, help="Optional Markdown output path")
@click.option("--group-limit", type=int, default=25, show_default=True, help="How many variant groups to include")
@click.option("--candidate-limit", type=int, default=50, show_default=True, help="How many individual candidates to include")
def fee_schedule_backlog(
    json_out: Path | None,
    markdown_out: Path | None,
    group_limit: int,
    candidate_limit: int,
):
    """Summarize the fee-schedule download backlog using selection-aware priorities."""
    result = _run_fee_schedule_backlog(
        json_output_path=json_out,
        markdown_output_path=markdown_out,
        group_limit=group_limit,
        candidate_limit=candidate_limit,
    )
    console.print(result["markdown"])
    console.print(f"[bold]JSON:[/bold] {result['json_path']}")
    console.print(f"[bold]Markdown:[/bold] {result['markdown_path']}")
