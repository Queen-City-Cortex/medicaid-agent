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


if __name__ == "__main__":
    cli()
