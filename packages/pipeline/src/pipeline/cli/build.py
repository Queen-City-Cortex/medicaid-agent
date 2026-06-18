"""Pipeline build commands: parse, load, schema, embed, run-all, mixed-corpus."""

from pathlib import Path

import click

from pipeline.cli._shared import cli, console

MIXED_CORPUS_STATE_SOURCES = (
    "dhhs_policy",
    "clinical_policy",
    "state_plan_amendment",
)


def _fail_on_embed_errors(embed_stats: dict) -> None:
    """Exit non-zero when embedding finished with errors.

    Dropped batches mean sections/chunks are silently missing from vector
    search, so a run with errors must not look successful.
    """
    errors = embed_stats.get("errors", 0)
    if errors:
        console.print(
            f"[red]Embedding finished with {errors} errors — some batches were "
            "not embedded. Fix the failures and re-run `embed`.[/red]"
        )
        raise SystemExit(1)


def _run_mixed_corpus_build(
    *,
    reset: bool = True,
    parse: bool = True,
    embed: bool = True,
    with_concepts: bool = False,
    refresh_federal: bool = False,
    llm_assist: bool = False,
) -> dict:
    from pipeline.parse.converter import parse_all
    from pipeline.graph.loader import load_all
    from pipeline.references.resolver import extract_and_resolve_all
    from pipeline.references.amendments import detect_amendments
    from pipeline.embeddings.generator import embed_all
    from pipeline.embeddings.indexer import ensure_vector_index
    from pipeline.federal.loader import load_all_cfr, load_ssa
    from pipeline.concepts.seed import seed_concepts
    from pipeline.concepts.linker import link_concepts

    stats: dict = {"parse": {}, "load": {}}

    console.print("[bold]Mixed-corpus sources:[/bold]")
    for source_type in MIXED_CORPUS_STATE_SOURCES:
        console.print(f"  {source_type}")
    console.print("  federal_regulation (CFR)")
    console.print("  federal_statute (SSA)\n")

    if parse:
        for source_type in MIXED_CORPUS_STATE_SOURCES:
            console.print(f"[bold]Stage 1: Parse ({source_type})[/bold]")
            parse_stats = parse_all(source_type=source_type)
            stats["parse"][source_type] = parse_stats
            console.print(
                f"  {parse_stats['parsed']} parsed, "
                f"{parse_stats['skipped']} skipped, "
                f"{parse_stats['errors']} errors"
                + (f", {parse_stats['timed_out']} timed out" if parse_stats.get("timed_out") else "")
                + "\n"
            )

    for index, source_type in enumerate(MIXED_CORPUS_STATE_SOURCES):
        console.print(f"[bold]Stage 2: Load ({source_type})[/bold]")
        load_stats = load_all(source_type=source_type, reset=reset and index == 0)
        stats["load"][source_type] = load_stats
        console.print(
            f"  {load_stats['loaded']} documents, "
            f"{load_stats['sections_total']} sections, "
            f"{load_stats['errors']} errors\n"
        )

    console.print("[bold]Stage 3: Federal Regulations (CFR)[/bold]")
    cfr_stats = load_all_cfr(refresh=refresh_federal)
    stats["cfr"] = cfr_stats
    console.print(
        f"  {cfr_stats['parts_loaded']} parts, "
        f"{cfr_stats['sections_total']} sections, "
        f"{cfr_stats['errors']} errors\n"
    )

    console.print("[bold]Stage 4: Social Security Act (SSA)[/bold]")
    ssa_stats = load_ssa(refresh=refresh_federal)
    stats["ssa"] = ssa_stats
    console.print(
        f"  {ssa_stats['titles_loaded']} titles, "
        f"{ssa_stats['sections_total']} sections, "
        f"{ssa_stats['errors']} errors\n"
    )

    console.print("[bold]Stage 5: Cross-references[/bold]")
    ref_stats = extract_and_resolve_all(llm_assist=llm_assist)
    stats["references"] = ref_stats
    console.print(
        f"  {ref_stats['resolved']} resolved, "
        f"{ref_stats['unresolved']} unresolved"
    )
    if llm_assist:
        console.print(
            f"  LLM: {ref_stats.get('llm_resolved', 0)} additional resolved\n"
        )
    else:
        console.print()

    console.print("[bold]Stage 6: Amendments[/bold]")
    amend_stats = detect_amendments()
    stats["amendments"] = amend_stats
    console.print(
        f"  {amend_stats['change_notices']} change notices, "
        f"{amend_stats['revised_spas']} revised SPAs, "
        f"{amend_stats['edges_created']} AMENDS edges\n"
    )

    if embed:
        console.print("[bold]Stage 7: Embeddings[/bold]")
        embed_stats = embed_all()
        ensure_vector_index()
        stats["embeddings"] = embed_stats
        console.print(
            f"  {embed_stats['embedded']} embedded, "
            f"{embed_stats['errors']} errors\n"
        )
        _fail_on_embed_errors(embed_stats)

    if with_concepts:
        console.print("[bold]Stage 8: Concepts[/bold]")
        seed_count = seed_concepts()
        link_stats = link_concepts()
        stats["concepts"] = {
            "seeded": seed_count,
            "linked": link_stats["edges_created"],
        }
        console.print(
            f"  {seed_count} concepts, "
            f"{link_stats['edges_created']} links\n"
        )

    return stats


@cli.command()
@click.option("--file", "file_path", type=click.Path(exists=True, path_type=Path), help="Parse a specific supported source file")
@click.option("--source", "source_type", type=str, help="Parse only this source type")
@click.option("--force", is_flag=True, help="Re-parse even if cached")
def parse(file_path: Path | None, source_type: str | None, force: bool):
    """Parse supported source files into structured JSON."""
    from pipeline.parse.converter import parse_all

    stats = parse_all(source_type=source_type, force=force, file_path=file_path)
    console.print(
        f"\n[bold]Parse complete:[/bold] {stats['parsed']} parsed, "
        f"{stats['skipped']} skipped, {stats['errors']} errors"
        + (f", {stats['timed_out']} timed out" if stats.get("timed_out") else "")
    )


@cli.command()
@click.option("--source", "source_type", type=str, help="Load only this source type")
@click.option("--reset", is_flag=True, help="Drop all data and reload")
def load(source_type: str | None, reset: bool):
    """Load parsed documents into Neo4j."""
    from pipeline.graph.loader import load_all

    stats = load_all(source_type=source_type, reset=reset)
    console.print(f"\n[bold]Load complete:[/bold] {stats['loaded']} documents, {stats['sections_total']} sections, {stats['errors']} errors")


@cli.command()
def schema():
    """Ensure Neo4j constraints and indexes exist."""
    from pipeline.graph.schema import ensure_schema
    from pipeline.embeddings.indexer import ensure_vector_index

    ensure_schema()
    ensure_vector_index()
    console.print("[bold]Schema complete:[/bold] constraints and indexes ensured")


@cli.command()
@click.option("--model", type=str, help="Embedding model to use")
def embed(model: str | None):
    """Generate vector embeddings for all sections."""
    from pipeline.embeddings.generator import embed_all
    from pipeline.embeddings.indexer import ensure_vector_index

    stats = embed_all(model=model)
    ensure_vector_index()
    console.print(f"\n[bold]Embedding complete:[/bold] {stats['embedded']} embedded, {stats['errors']} errors")
    _fail_on_embed_errors(stats)


@cli.command("run-all")
@click.option("--source", "source_type", type=str, help="Process only this source type")
@click.option("--llm-assist", is_flag=True, help="Use LLM for cross-reference extraction")
def run_all(source_type: str | None, llm_assist: bool):
    """Run the full pipeline: parse → load → extract-refs → embed → seed → link."""
    from pipeline.parse.converter import parse_all
    from pipeline.graph.loader import load_all
    from pipeline.references.resolver import extract_and_resolve_all
    from pipeline.embeddings.generator import embed_all
    from pipeline.embeddings.indexer import ensure_vector_index
    from pipeline.concepts.seed import seed_concepts
    from pipeline.concepts.linker import link_concepts

    console.print("[bold]Stage 1: Parse[/bold]")
    parse_stats = parse_all(source_type=source_type)
    console.print(
        f"  {parse_stats['parsed']} parsed, {parse_stats['skipped']} skipped"
        + (f", {parse_stats['timed_out']} timed out" if parse_stats.get("timed_out") else "")
        + "\n"
    )

    console.print("[bold]Stage 2: Load[/bold]")
    load_stats = load_all(source_type=source_type)
    console.print(f"  {load_stats['loaded']} documents, {load_stats['sections_total']} sections\n")

    console.print("[bold]Stage 2.5: Federal Regulations[/bold]")
    from pipeline.federal.loader import load_all_cfr
    cfr_stats = load_all_cfr()
    console.print(f"  {cfr_stats['parts_loaded']} CFR parts, {cfr_stats['sections_total']} sections\n")

    console.print("[bold]Stage 2.6: Social Security Act[/bold]")
    from pipeline.federal.loader import load_ssa
    ssa_stats = load_ssa()
    console.print(f"  {ssa_stats['titles_loaded']} titles, {ssa_stats['sections_total']} sections\n")

    console.print("[bold]Stage 3: Cross-references[/bold]")
    ref_stats = extract_and_resolve_all(llm_assist=llm_assist)
    console.print(f"  {ref_stats['resolved']} resolved, {ref_stats['unresolved']} unresolved")
    if llm_assist:
        console.print(f"  LLM: {ref_stats.get('llm_resolved', 0)} additional resolved\n")
    else:
        console.print()

    console.print("[bold]Stage 3.5: Amendments[/bold]")
    from pipeline.references.amendments import detect_amendments
    amend_stats = detect_amendments()
    console.print(f"  {amend_stats['edges_created']} amendment edges\n")

    console.print("[bold]Stage 4: Embeddings[/bold]")
    embed_stats = embed_all()
    ensure_vector_index()
    console.print(f"  {embed_stats['embedded']} embedded, {embed_stats['errors']} errors\n")
    _fail_on_embed_errors(embed_stats)

    console.print("[bold]Stage 5: Concepts[/bold]")
    seed_count = seed_concepts()
    link_stats = link_concepts()
    console.print(f"  {seed_count} concepts, {link_stats['edges_created']} links\n")

    from pipeline.graph.schema_version import write_schema_version
    schema_info = write_schema_version()
    console.print(
        f"  SchemaVersion updated: manifest_hash={schema_info['manifest_hash'][:12] or '(none)'} "
        f"pipeline={schema_info['pipeline_version'] or '(unknown)'}\n"
    )

    console.print("[bold green]Pipeline complete![/bold green]")


@cli.command("schema-version")
@click.option("--write", is_flag=True, help="Upsert the SchemaVersion node in Neo4j.")
def schema_version_cmd(write: bool):
    """Show or update the SchemaVersion node (manifest hash + load timestamp + pipeline version)."""
    from pipeline.graph.schema_version import read_schema_version, write_schema_version

    if write:
        info = write_schema_version()
        console.print(f"[green]Wrote SchemaVersion:[/green] {info}")
        return

    current = read_schema_version()
    if current is None:
        console.print("[yellow]No SchemaVersion node exists yet. Run `run-all` or `schema-version --write`.[/yellow]")
        return
    console.print(current)


@cli.command("build-mixed-corpus")
@click.option("--reset/--no-reset", default=True, help="Drop existing graph data before the first mixed-corpus load")
@click.option("--parse/--skip-parse", default=True, help="Re-run parse for the mixed-corpus state sources")
@click.option("--embed/--no-embed", default=True, help="Generate embeddings after the corpus build")
@click.option("--with-concepts/--skip-concepts", default=False, help="Also seed and link policy concepts")
@click.option("--refresh-federal", is_flag=True, help="Force re-fetch CFR and SSA sources")
@click.option("--llm-assist", is_flag=True, help="Use LLM-assisted cross-reference extraction")
def build_mixed_corpus(
    reset: bool,
    parse: bool,
    embed: bool,
    with_concepts: bool,
    refresh_federal: bool,
    llm_assist: bool,
):
    """Build the reproducible mixed corpus used for cross-ref and retrieval validation."""
    _run_mixed_corpus_build(
        reset=reset,
        parse=parse,
        embed=embed,
        with_concepts=with_concepts,
        refresh_federal=refresh_federal,
        llm_assist=llm_assist,
    )
    console.print("[bold green]Mixed-corpus build complete![/bold green]")
