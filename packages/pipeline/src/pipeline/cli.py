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


@cli.command()
def stats():
    """Show graph statistics."""
    from pipeline.graph.connection import get_session
    from pipeline.graph import queries

    with get_session() as session:
        nodes = session.run(queries.COUNT_NODES)
        console.print("\n[bold]Nodes:[/bold]")
        for r in nodes:
            console.print(f"  {r['label']}: {r['cnt']}")

        edges = session.run(queries.COUNT_EDGES)
        console.print("\n[bold]Edges:[/bold]")
        for r in edges:
            console.print(f"  {r['rel_type']}: {r['cnt']}")

        # Federal vs state document breakdown
        doc_breakdown = session.run("""
            MATCH (d:Document)
            WITH d.document_type AS doc_type, count(d) AS cnt
            RETURN doc_type, cnt ORDER BY doc_type
        """)
        console.print("\n[bold]Documents by type:[/bold]")
        for r in doc_breakdown:
            console.print(f"  {r['doc_type']}: {r['cnt']}")

        # Check section embedding coverage
        result = session.run("""
            MATCH (s:Section)
            WITH count(s) AS total,
                 count(CASE WHEN s.embedding IS NOT NULL THEN 1 END) AS with_emb
            RETURN total, with_emb
        """)
        r = result.single()
        if r:
            console.print(f"\n[bold]Section embeddings:[/bold] {r['with_emb']}/{r['total']} sections")

        # Check chunk counts and embedding coverage
        chunk_result = session.run("""
            MATCH (ch:Chunk)
            WITH count(ch) AS total,
                 count(CASE WHEN ch.embedding IS NOT NULL THEN 1 END) AS with_emb
            RETURN total, with_emb
        """)
        cr = chunk_result.single()
        if cr:
            console.print(f"[bold]Chunk embeddings:[/bold] {cr['with_emb']}/{cr['total']} chunks")


@cli.command("ingest-cfr")
@click.option("--part", type=int, help="Ingest only this CFR part number")
@click.option("--refresh", is_flag=True, help="Force re-fetch even if cached (use when CMS finalizes major rules)")
def ingest_cfr(part: int | None, refresh: bool):
    """Fetch and load Medicaid-relevant federal regulations from eCFR."""
    from pipeline.federal.loader import load_all_cfr

    stats = load_all_cfr(part_filter=part, refresh=refresh)
    console.print(f"\n[bold]eCFR ingest complete:[/bold] {stats['parts_loaded']} parts, {stats['sections_total']} sections, {stats['errors']} errors")


@cli.command()
@click.argument("doc_id")
def inspect(doc_id: str):
    """Browse a document's section tree."""
    from pipeline.graph.connection import get_session

    with get_session() as session:
        result = session.run("""
            MATCH (d:Document {id: $doc_id})-[:HAS_SECTION]->(s:Section)
            OPTIONAL MATCH (s)-[:PARENT_OF]->(child:Section)
            RETURN s.section_number, s.title, s.level, s.content_length,
                   collect(child.section_number) AS children
            ORDER BY s.section_number
        """, {"doc_id": doc_id})

        for r in result:
            indent = "  " * (r["s.level"] or 0)
            num = r["s.section_number"] or "—"
            title = r["s.title"] or "(untitled)"
            length = r["s.content_length"] or 0
            console.print(f"{indent}{num} {title} ({length} chars)")


@cli.command()
@click.argument("query_text")
@click.option("-k", "top_k", type=int, default=10, help="Number of results")
def search(query_text: str, top_k: int):
    """Search sections by text using vector similarity."""
    import voyageai
    from pipeline.config import VOYAGE_API_KEY, EMBEDDING_MODEL
    from pipeline.embeddings.indexer import vector_search

    if not VOYAGE_API_KEY:
        console.print("[red]VOYAGE_API_KEY not set[/red]")
        return

    client = voyageai.Client(api_key=VOYAGE_API_KEY)
    result = client.embed([query_text], model=EMBEDDING_MODEL, input_type="query")
    query_embedding = result.embeddings[0]

    results = vector_search(query_embedding, top_k=top_k)
    for r in results:
        console.print(
            f"[bold]{r['policy_number'] or ''}[/bold] "
            f"{r['section_number'] or ''} {r['section_title'] or '(untitled)'} "
            f"[dim](score: {r['score']:.3f})[/dim]"
        )
        # Show first 200 chars of content
        content = (r["content"] or "")[:200]
        if content:
            console.print(f"  {content}...")
        console.print()


@cli.command()
@click.option("--level", type=click.Choice(["retrieval", "cross-ref"]), help="Eval level to run")
@click.option("--top-k", type=int, help="Top-k for retrieval eval")
@click.option("--category", type=str, help="Filter by reasoning_type")
@click.option("--difficulty", type=str, help="Filter by difficulty")
@click.option("--question", type=str, help="Run single question by ID")
def eval(level: str | None, top_k: int | None, category: str | None, difficulty: str | None, question: str | None):
    """Run evaluation against the golden dataset."""
    from pipeline.eval.runner import run_eval
    from pipeline.eval.reports import print_retrieval_report

    levels = [level] if level else ["retrieval"]

    for lvl in levels:
        console.print(f"\n[bold]Running {lvl} evaluation...[/bold]")
        result = run_eval(
            level=lvl,
            difficulty=difficulty,
            reasoning_type=category,
            question_id=question,
            top_k=top_k,
        )
        if "error" in result:
            console.print(f"[red]{result['error']}[/red]")
            continue

        if lvl == "retrieval":
            print_retrieval_report(result)
        else:
            console.print(f"  Results saved: {result.get('run_id', 'unknown')}")


@cli.command("eval-compare")
@click.argument("run_a")
@click.argument("run_b")
def eval_compare(run_a: str, run_b: str):
    """Compare two eval runs for regression detection."""
    from pipeline.eval.results import load_result, list_results
    from pipeline.eval.metrics import compare_runs
    from pipeline.eval.reports import print_comparison_report
    from pipeline.config import EVAL_RESULTS_DIR, EVAL_REGRESSION_THRESHOLD

    # Find result files matching the run IDs
    all_files = list_results()
    file_a = next((f for f in all_files if run_a in f.name), None)
    file_b = next((f for f in all_files if run_b in f.name), None)

    if not file_a or not file_b:
        console.print("[red]Could not find both result files[/red]")
        return

    result_a = load_result(file_a)
    result_b = load_result(file_b)
    diffs = compare_runs(result_a, result_b, threshold=EVAL_REGRESSION_THRESHOLD)
    print_comparison_report(diffs)


@cli.command("eval-runs")
@click.option("--level", type=str, help="Filter by level")
@click.option("--last", type=int, default=10, help="Show last N runs")
def eval_runs(level: str | None, last: int):
    """List past eval runs."""
    from pipeline.eval.results import list_results, load_result

    files = list_results(level=level, last=last)
    if not files:
        console.print("No eval runs found.")
        return

    for f in files:
        result = load_result(f)
        agg = result.get("aggregate", {})
        p = agg.get("precision_at_k", 0)
        r = agg.get("recall_at_k", 0)
        hit = agg.get("primary_hit_rate", 0)
        n = result.get("config", {}).get("dataset_count", 0)
        console.print(
            f"  {result['run_id']}  [{result['level']}]  "
            f"P@k={p:.2f}  R@k={r:.2f}  Hit={hit:.0%}  (n={n})"
        )


@cli.command("eval-validate")
def eval_validate():
    """Validate the golden dataset against the graph."""
    from pipeline.eval.dataset import validate_dataset, load_dataset
    from pipeline.graph.connection import get_session

    # Schema validation
    errors = validate_dataset()
    if errors:
        console.print("[red]Schema validation errors:[/red]")
        for e in errors:
            console.print(f"  {e}")
        return

    console.print("[green]Schema validation: PASS[/green]")

    # Reference integrity
    entries = load_dataset()
    missing = []
    with get_session() as session:
        for entry in entries:
            for sec in entry["evidence"]["primary_sections"]:
                result = session.run(
                    "MATCH (s:Section {id: $sid}) RETURN s.id",
                    {"sid": sec["section_id"]},
                )
                if not result.single():
                    missing.append(f"{entry['id']}: section {sec['section_id']} not found")

            for sec in entry["evidence"].get("supporting_sections", []):
                result = session.run(
                    "MATCH (s:Section {id: $sid}) RETURN s.id",
                    {"sid": sec["section_id"]},
                )
                if not result.single():
                    missing.append(f"{entry['id']}: section {sec['section_id']} not found")

    if missing:
        console.print(f"[red]Reference integrity errors ({len(missing)}):[/red]")
        for m in missing:
            console.print(f"  {m}")
    else:
        console.print("[green]Reference integrity: PASS[/green]")

    # Completeness
    difficulties = set(e["difficulty"] for e in entries)
    categories = set(e["reasoning_type"] for e in entries)
    console.print(f"\nDataset: {len(entries)} entries")
    console.print(f"Difficulties: {', '.join(sorted(difficulties))}")
    console.print(f"Categories: {', '.join(sorted(categories))}")


@cli.command("run-all")
@click.option("--source", "source_type", type=str, help="Process only this source type")
def run_all(source_type: str | None):
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
    console.print(f"  {parse_stats['parsed']} parsed, {parse_stats['skipped']} skipped\n")

    console.print("[bold]Stage 2: Load[/bold]")
    load_stats = load_all(source_type=source_type)
    console.print(f"  {load_stats['loaded']} documents, {load_stats['sections_total']} sections\n")

    console.print("[bold]Stage 2.5: Federal Regulations[/bold]")
    from pipeline.federal.loader import load_all_cfr
    cfr_stats = load_all_cfr()
    console.print(f"  {cfr_stats['parts_loaded']} CFR parts, {cfr_stats['sections_total']} sections\n")

    console.print("[bold]Stage 3: Cross-references[/bold]")
    ref_stats = extract_and_resolve_all()
    console.print(f"  {ref_stats['resolved']} resolved, {ref_stats['unresolved']} unresolved\n")

    console.print("[bold]Stage 4: Embeddings[/bold]")
    embed_stats = embed_all()
    ensure_vector_index()
    console.print(f"  {embed_stats['embedded']} embedded\n")

    console.print("[bold]Stage 5: Concepts[/bold]")
    seed_count = seed_concepts()
    link_stats = link_concepts()
    console.print(f"  {seed_count} concepts, {link_stats['edges_created']} links\n")

    console.print("[bold green]Pipeline complete![/bold green]")


if __name__ == "__main__":
    cli()
