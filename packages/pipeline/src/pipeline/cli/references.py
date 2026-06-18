"""Cross-reference, amendment, and concept commands."""

import click

from pipeline.cli._shared import cli, console


@cli.command("extract-refs")
@click.option("--llm-assist", is_flag=True, help="Use LLM to find implicit cross-references")
def extract_refs(llm_assist: bool):
    """Extract and resolve cross-references between documents."""
    from pipeline.references.resolver import extract_and_resolve_all

    stats = extract_and_resolve_all(llm_assist=llm_assist)
    console.print(f"\n[bold]Cross-references (regex):[/bold] {stats['extracted']} extracted, {stats['resolved']} resolved, {stats['unresolved']} unresolved")

    if llm_assist:
        console.print(
            f"[bold]Cross-references (LLM):[/bold] {stats.get('llm_extracted', 0)} extracted, "
            f"{stats.get('llm_resolved', 0)} resolved, {stats.get('llm_unresolved', 0)} unresolved"
        )


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


@cli.command("seed-concepts")
def seed_concepts_cmd():
    """Seed initial policy concepts into Neo4j."""
    from pipeline.concepts.seed import seed_concepts

    count = seed_concepts()
    console.print(f"[bold]Seeded {count} policy concepts[/bold]")


@cli.command("link-concepts")
def link_concepts_cmd():
    """Link policy concepts to sections based on content matching."""
    from pipeline.concepts.linker import link_concepts

    stats = link_concepts()
    console.print(f"[bold]Created {stats['edges_created']} concept-section edges[/bold]")


@cli.command("detect-amendments")
def detect_amendments_cmd():
    """Detect amendment relationships and create AMENDS edges."""
    from pipeline.references.amendments import detect_amendments

    stats = detect_amendments()
    console.print(
        f"[bold]Amendments:[/bold] "
        f"{stats['change_notices']} change notices, "
        f"{stats['revised_spas']} revised SPAs, "
        f"{stats['edges_created']} AMENDS edges created"
    )
