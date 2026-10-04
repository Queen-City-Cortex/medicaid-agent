"""Explicit opt-in experiment commands; preparation and reports are read-only."""
import json
from pathlib import Path

import click

from pipeline.cli._shared import cli
from pipeline.jev.budget import Ledger
from pipeline.jev.benchmarks import (
    blind_review, prepare_routing, prepare_scope, prepare_sections, run_routing, run_scope,
)
from pipeline.jev.reports import compare_answers, report_routing, report_scope, report_sections
from pipeline.jev.sections import LABEL_ROOT, enrich_graph, label_sections


@cli.group("jev")
def jev_commands():
    """Prepare, run and review opt-in Jev experiments."""


@jev_commands.command("prepare")
@click.argument("kind", type=click.Choice(["routing", "scope", "sections"]))
@click.option("--output", required=True, type=click.Path(path_type=Path))
@click.option("--reuse-from", type=click.Path(exists=True, file_okay=False, path_type=Path))
def jev_prepare(kind: str, output: Path, reuse_from: Path | None):
    """Freeze inputs before inference; section sampling reads the selected graph."""
    if reuse_from and kind != "routing":
        raise click.ClickException("Inference reuse is supported only for routing")
    result = {"routing": prepare_routing, "scope": prepare_scope, "sections": prepare_sections}[kind](output)
    if reuse_from:
        from pipeline.jev.benchmarks import reuse_routing
        reuse_routing(output, reuse_from)
    click.echo(json.dumps({"inputDigest": result["digest"], "count": len(result["rows"]), "status": "pending_review"}))


@jev_commands.command("run")
@click.argument("kind", type=click.Choice(["routing", "scope", "sections"]))
@click.option("--output", required=True, type=click.Path(path_type=Path))
@click.option("--ledger", required=True, type=click.Path(path_type=Path))
def jev_run(kind: str, output: Path, ledger: Path):
    """Run paid inference with the shared immutable $25 campaign ledger."""
    budget = Ledger(ledger)
    try:
        if kind == "sections":
            from pipeline.jev.benchmarks import read_frozen, freeze
            fixture = read_frozen(output / "sections-inputs.json")
            rows = [{"id": r["id"], "documentId": r["documentId"], **r["input"]} for r in fixture["rows"]]
            manifest = label_sections(rows, ledger=budget, cache_only=False)["manifest"]
            failures = [r["status"] for r in manifest["sections"] if r["status"] not in {"labeled", "input", "empty"}]
            result = {"inputDigest": fixture["digest"], "manifestDigest": manifest["digest"],
                      "status": "pending_inference" if failures else "pending_review",
                      "statuses": {status: sum(r["status"] == status for r in manifest["sections"]) for status in sorted({r["status"] for r in manifest["sections"]})}}
            results_path = output / "sections-results.json"
            # Keep inference history immutable; a resumed stage may produce a new manifest.
            freeze(output / f"sections-attempt-{manifest['digest']}.json", result.copy())
            from pipeline.jev.benchmarks import write_progress
            write_progress(results_path, result)
        else:
            result = (run_routing if kind == "routing" else run_scope)(output, budget)
        click.echo(json.dumps({"status": result.get("status", "pending_review"), "budget": budget.summary()}))
    finally:
        budget.close()


@jev_commands.command("review")
@click.argument("kind", type=click.Choice(["routing", "scope", "sections"]))
@click.option("--output", required=True, type=click.Path(path_type=Path))
@click.option("--format", "output_format", type=click.Choice(["json", "html"]), default="json")
def jev_review(kind: str, output: Path, output_format: str):
    """Export a blinded editable human-review form; never overwrite labels."""
    if output_format == "html":
        from pipeline.jev.review import export_review_html
        result = export_review_html(output, kind)
    else:
        result = blind_review(output, kind)
    click.echo(json.dumps(result))


@jev_commands.command("report")
@click.argument("kind", type=click.Choice(["routing", "scope", "sections", "ai-diagnostic"]))
@click.option("--output", required=True, type=click.Path(path_type=Path))
def jev_report(kind: str, output: Path):
    """Report metrics only when the reference labels are human-reviewed."""
    if kind == "ai-diagnostic":
        from pipeline.jev.ai_review import diagnostic_comparison
        result = diagnostic_comparison(output)
        click.echo(json.dumps(result))
        return
    result = report_sections(output, LABEL_ROOT) if kind == "sections" else (report_routing if kind == "routing" else report_scope)(output)
    (output / f"{kind}-report.json").write_text(json.dumps(result, indent=2) + "\n")
    click.echo(json.dumps(result))


@jev_commands.command("enrich")
@click.option("--paid", is_flag=True, help="Permit paid labeling; otherwise use cache only.")
@click.option("--ledger", type=click.Path(path_type=Path))
def jev_enrich(paid: bool, ledger: Path | None):
    """Annotate an unstamped candidate graph; released graphs are refused."""
    if paid and not ledger:
        raise click.ClickException("Paid enrichment requires the same campaign --ledger")
    click.echo(json.dumps(enrich_graph(cache_only=not paid, ledger_path=ledger)))


@jev_commands.command("compare-answers")
@click.option("--baseline", required=True, multiple=True, type=click.Path(exists=True, path_type=Path))
@click.option("--candidate", required=True, multiple=True, type=click.Path(exists=True, path_type=Path))
def jev_compare_answers(baseline: tuple[Path, ...], candidate: tuple[Path, ...]):
    """Check three full baseline/candidate runs against existing release gates."""
    click.echo(json.dumps(compare_answers([json.loads(p.read_text()) for p in baseline],
                                         [json.loads(p.read_text()) for p in candidate])))


@jev_commands.command("validate-answers")
@click.option("--output", required=True, type=click.Path(path_type=Path))
@click.option("--ledger", required=True, type=click.Path(path_type=Path))
@click.option("--pricing", required=True, type=click.Path(path_type=Path))
def jev_validate_answers(output: Path, ledger: Path, pricing: Path):
    """Run up to three full paired evals within the campaign's remaining budget."""
    from pipeline.jev.validation import run_answer_validation
    click.echo(json.dumps(run_answer_validation(output, ledger, pricing)))


@jev_commands.command("frames")
@click.option("--routing", is_flag=True, help="Compare routing type hints; otherwise compare section-role arms.")
@click.option("--output", required=True, type=click.Path(path_type=Path))
@click.option("--ledger", required=True, type=click.Path(path_type=Path))
@click.option("--pricing", required=True, type=click.Path(exists=True, path_type=Path))
def jev_frames(routing: bool, output: Path, ledger: Path, pricing: Path):
    """Compare actual final primary evidence after validating live identities."""
    from pipeline.jev.benchmarks import run_frames
    click.echo(json.dumps(run_frames(output, ledger, pricing, routing=routing)))


@jev_commands.command("review-dashboard")
@click.option("--output", required=True, type=click.Path(path_type=Path))
def jev_review_dashboard(output: Path):
    """Export all blinded review forms with one offline entry point."""
    from pipeline.jev.review import export_review_dashboard
    click.echo(json.dumps(export_review_dashboard(output)))


@jev_commands.command("snapshot")
@click.option("--output", required=True, type=click.Path(exists=True, file_okay=False, path_type=Path))
@click.option("--ledger", required=True, type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option("--destination", required=True, type=click.Path(path_type=Path))
def jev_snapshot(output: Path, ledger: Path, destination: Path):
    """Copy reviews and cache evidence with a consistent SQLite ledger backup."""
    from pipeline.jev.snapshot import snapshot_campaign
    result = snapshot_campaign(output, ledger, LABEL_ROOT, destination)
    click.echo(json.dumps({"path": str(destination.resolve()), "digest": result["digest"]}))


@jev_commands.command("ai-draft")
@click.option("--output", required=True, type=click.Path(exists=True, file_okay=False, path_type=Path))
@click.option("--ledger", required=True, type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option("--pricing", required=True, type=click.Path(exists=True, dir_okay=False, path_type=Path))
def jev_ai_draft(output: Path, ledger: Path, pricing: Path):
    """Meter independent OpenAI/Opus diagnostic labels; preserve human reviews."""
    from pipeline.jev.ai_review import run_ai_review
    click.echo(json.dumps(run_ai_review(output, ledger, pricing)))


@jev_commands.command("ai-audit")
@click.option("--output", required=True, type=click.Path(exists=True, file_okay=False, path_type=Path))
def jev_ai_audit(output: Path):
    """Export a small disagreement audit; never qualify features from AI labels."""
    from pipeline.jev.ai_review import build_audit
    click.echo(json.dumps(build_audit(output)))


@jev_commands.command("import-ai-audit")
@click.option("--output", required=True, type=click.Path(exists=True, file_okay=False, path_type=Path))
@click.option("--review", required=True, type=click.Path(exists=True, dir_okay=False, path_type=Path))
def jev_import_ai_audit(output: Path, review: Path):
    """Validate, archive and summarize downloaded human audit decisions."""
    from pipeline.jev.ai_review import import_audit_review, working_reference
    result = import_audit_review(output, review)
    working_reference(output)
    click.echo(json.dumps({k: result[k] for k in ("status", "completeItems", "totalItems", "decisions", "modelMatches", "qualification")}))
