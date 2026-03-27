"""CLI entry point for the NC Medicaid document pipeline."""

import click
from pathlib import Path
from rich.console import Console

console = Console()


@click.group()
def cli():
    """NC Medicaid Document Pipeline — parse, load, embed, and inspect."""
    pass


@cli.command()
@click.option("--file", "file_path", type=click.Path(exists=True, path_type=Path), help="Parse a specific PDF file")
@click.option("--source", "source_type", type=str, help="Parse only this source type")
@click.option("--force", is_flag=True, help="Re-parse even if cached")
def parse(file_path: Path | None, source_type: str | None, force: bool):
    """Parse PDFs into structured JSON using Docling."""
    from pipeline.parse.converter import parse_all

    stats = parse_all(source_type=source_type, force=force, file_path=file_path)
    console.print(f"\n[bold]Parse complete:[/bold] {stats['parsed']} parsed, {stats['skipped']} skipped, {stats['errors']} errors")


@cli.command()
@click.option("--source", "source_type", type=str, help="Load only this source type")
@click.option("--reset", is_flag=True, help="Drop all data and reload")
def load(source_type: str | None, reset: bool):
    """Load parsed documents into Neo4j."""
    from pipeline.graph.loader import load_all

    stats = load_all(source_type=source_type, reset=reset)
    console.print(f"\n[bold]Load complete:[/bold] {stats['loaded']} documents, {stats['sections_total']} sections, {stats['errors']} errors")


@cli.command("extract-refs")
@click.option("--llm-assist", is_flag=True, help="Use LLM for ambiguous references")
def extract_refs(llm_assist: bool):
    """Extract and resolve cross-references between documents."""
    from pipeline.references.resolver import extract_and_resolve_all

    stats = extract_and_resolve_all()
    console.print(f"\n[bold]Cross-references:[/bold] {stats['extracted']} extracted, {stats['resolved']} resolved, {stats['unresolved']} unresolved")

    if llm_assist:
        console.print("[yellow]LLM-assisted extraction not yet implemented[/yellow]")


@cli.command("unresolved-refs")
def unresolved_refs():
    """Show unresolved cross-references."""
    import json
    from pipeline.config import PARSED_DATA_DIR

    path = PARSED_DATA_DIR.parent / "unresolved-references.json"
    if not path.exists():
        console.print("No unresolved references file found. Run extract-refs first.")
        return

    data = json.loads(path.read_text())
    console.print(f"[bold]{len(data)} unresolved references:[/bold]")
    for ref in data[:20]:
        console.print(f"  [{ref['ref_type']}] {ref['matched_text']} → {ref['target_id']} (from {ref['source_section']})")
    if len(data) > 20:
        console.print(f"  ... and {len(data) - 20} more")


@cli.command()
@click.option("--model", type=str, help="Embedding model to use")
def embed(model: str | None):
    """Generate vector embeddings for all sections."""
    from pipeline.embeddings.generator import embed_all
    from pipeline.embeddings.indexer import ensure_vector_index

    stats = embed_all(model=model)
    ensure_vector_index()
    console.print(f"\n[bold]Embedding complete:[/bold] {stats['embedded']} embedded, {stats['errors']} errors")


if __name__ == "__main__":
    cli()
