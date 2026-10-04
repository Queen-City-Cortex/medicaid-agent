"""Graph inspection and search commands: stats, inspect, search."""

import click

from pipeline.cli._shared import cli, console


@cli.command()
def stats():
    """Show graph statistics."""
    from pipeline.graph.connection import get_session
    from pipeline.graph import queries

    with get_session() as session:
        # Freshness first — the number an operator checks before trusting
        # anything else here. Same max(last_indexed) the agent's
        # /corpus-status endpoint serves to the web UI.
        fresh = session.run(
            "MATCH (d:Document) RETURN max(d.last_indexed) AS last_indexed, count(d) AS docs"
        ).single()
        if fresh and fresh["docs"]:
            console.print(
                f"\n[bold]Corpus:[/bold] {fresh['docs']} documents · last indexed {fresh['last_indexed'] or 'unknown'}"
            )

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

    from pipeline.embeddings.plan_graph import embedding_coverage
    coverage = embedding_coverage()
    console.print("\n[bold]Embedding coverage (current input plan):[/bold]")
    console.print(f"  Total covered: {coverage['covered']}/{coverage['total']}")
    console.print(f"  Direct: {coverage['direct']} · chunked: {coverage['chunked']} · empty: {coverage['empty']}")
    if coverage['covered'] != coverage['total']:
        console.print("  [red]Incomplete or stale embeddings; qualify a fresh inactive candidate.[/red]")


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
@click.option("--type", "doc_type", type=str, help="Filter by document type (e.g., dhhs_policy, clinical_policy)")
def search(query_text: str, top_k: int, doc_type: str | None):
    """Search sections by text using the canonical hybrid retrieval layer."""
    from pipeline.retrieval.agent_bridge import search_sections_via_agent_cli

    document_types = [doc_type] if doc_type else None
    results = search_sections_via_agent_cli(
        query_text,
        top_k=top_k,
        document_types=document_types,
    )
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
