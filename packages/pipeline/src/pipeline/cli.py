"""CLI entry point for the NC Medicaid document pipeline."""

import click
import json
from pathlib import Path
from rich.console import Console

console = Console()
MIXED_CORPUS_STATE_SOURCES = (
    "dhhs_policy",
    "clinical_policy",
    "state_plan_amendment",
)
MIXED_CORPUS_EVAL_LEVELS = (
    "retrieval",
    "cross-ref",
)


def _run_eval_level(
    level: str,
    *,
    top_k: int | None = None,
    category: str | None = None,
    difficulty: str | None = None,
    question: str | None = None,
    from_result: str | None = None,
    legacy_evidence: bool = False,
) -> dict:
    from pipeline.eval.runner import run_eval

    return run_eval(
        level=level,
        difficulty=difficulty,
        reasoning_type=category,
        question_id=question,
        top_k=top_k,
        from_result=from_result,
        legacy_evidence=legacy_evidence,
    )


def _print_eval_result(level: str, result: dict) -> None:
    from pipeline.eval.reports import print_retrieval_report, print_answer_report

    if level == "retrieval":
        print_retrieval_report(result)
    elif level == "answer":
        print_answer_report(result)
    else:
        console.print(f"  Results saved: {result.get('run_id', 'unknown')}")


def _run_eval_levels(
    levels: list[str],
    *,
    top_k: int | None = None,
    category: str | None = None,
    difficulty: str | None = None,
    question: str | None = None,
    from_result: str | None = None,
    legacy_evidence: bool = False,
) -> dict[str, dict]:
    results: dict[str, dict] = {}

    for level in levels:
        console.print(f"\n[bold]Running {level} evaluation...[/bold]")
        result = _run_eval_level(
            level,
            top_k=top_k,
            category=category,
            difficulty=difficulty,
            question=question,
            from_result=from_result,
            legacy_evidence=legacy_evidence,
        )
        if "error" in result:
            console.print(f"[red]{result['error']}[/red]")
            continue

        _print_eval_result(level, result)
        results[level] = result

    return results


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


@click.group()
def cli():
    """NC Medicaid Document Pipeline — parse, load, embed, and inspect."""
    pass


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


@cli.command()
def schema():
    """Ensure Neo4j constraints and indexes exist."""
    from pipeline.graph.schema import ensure_schema
    from pipeline.embeddings.indexer import ensure_vector_index

    ensure_schema()
    ensure_vector_index()
    console.print("[bold]Schema complete:[/bold] constraints and indexes ensured")


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

        # Embedding coverage breakdown
        emb_result = session.run("""
            MATCH (s:Section)
            WITH count(s) AS total,
                 count(CASE WHEN s.embedding IS NOT NULL THEN 1 END) AS embedded,
                 count(CASE WHEN s.content_length IS NULL OR s.content_length = 0 THEN 1 END) AS empty,
                 count(CASE WHEN s.embedding IS NULL AND s.content_length > 0 AND (s)-[:HAS_CHUNK]->() THEN 1 END) AS chunked
            RETURN total, embedded, empty, chunked
        """)
        r = emb_result.single()
        if r:
            covered = r['embedded'] + r['chunked']
            with_content = r['total'] - r['empty']
            console.print("\n[bold]Embedding coverage:[/bold]")
            console.print(f"  Sections with content: {with_content}/{r['total']}")
            console.print(f"  Directly embedded:     {r['embedded']}")
            console.print(f"  Covered via chunks:    {r['chunked']}")
            console.print(f"  Total covered:         {covered}/{with_content} ({100 * covered // with_content if with_content else 0}%)")
            console.print(f"  Empty (structural):    {r['empty']}")

        chunk_result = session.run("""
            MATCH (ch:Chunk)
            WITH count(ch) AS total,
                 count(CASE WHEN ch.embedding IS NOT NULL THEN 1 END) AS with_emb
            RETURN total, with_emb
        """)
        cr = chunk_result.single()
        if cr:
            console.print(f"  Chunks:                {cr['with_emb']}/{cr['total']}")


@cli.command("ingest-cfr")
@click.option("--part", type=int, help="Ingest only this CFR part number")
@click.option("--refresh", is_flag=True, help="Force re-fetch even if cached (use when CMS finalizes major rules)")
def ingest_cfr(part: int | None, refresh: bool):
    """Fetch and load Medicaid-relevant federal regulations from eCFR."""
    from pipeline.federal.loader import load_all_cfr

    stats = load_all_cfr(part_filter=part, refresh=refresh)
    console.print(f"\n[bold]eCFR ingest complete:[/bold] {stats['parts_loaded']} parts, {stats['sections_total']} sections, {stats['errors']} errors")


@cli.command("ingest-ssa")
@click.option("--refresh", is_flag=True, help="Force re-fetch from ssa.gov")
def ingest_ssa(refresh: bool):
    """Fetch and load Social Security Act Title XIX (Medicaid) and XXI (CHIP)."""
    from pipeline.federal.loader import load_ssa
    stats = load_ssa(refresh=refresh)
    console.print(f"\n[bold]SSA ingest complete:[/bold] {stats['titles_loaded']} titles, {stats['sections_total']} sections, {stats['errors']} errors")


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


@cli.command()
@click.option("--level", type=click.Choice(["retrieval", "cross-ref", "answer", "citation"]), help="Eval level to run")
@click.option("--top-k", type=int, help="Top-k for retrieval eval")
@click.option("--category", type=str, help="Filter by reasoning_type")
@click.option("--difficulty", type=str, help="Filter by difficulty")
@click.option("--question", type=str, help="Run single question by ID")
@click.option(
    "--from-result",
    "from_result",
    type=click.Path(exists=True, dir_okay=False, path_type=str),
    help="Path to a cached answer-eval result JSON. Required for --level citation; ignored elsewhere.",
)
@click.option(
    "--legacy-evidence",
    is_flag=True,
    default=False,
    help="Use the old judge evidence path (golden sections only, no agent tool outputs). "
         "Answer-level only. Default is the unified path (golden + tool-sourced).",
)
def eval(
    level: str | None,
    top_k: int | None,
    category: str | None,
    difficulty: str | None,
    question: str | None,
    from_result: str | None,
    legacy_evidence: bool,
):
    """Run evaluation against the golden dataset."""
    levels = [level] if level else ["retrieval"]
    if "citation" in levels and not from_result:
        raise click.UsageError("--level citation requires --from-result <path/to/answer.json>")
    _run_eval_levels(
        levels,
        top_k=top_k,
        category=category,
        difficulty=difficulty,
        question=question,
        from_result=from_result,
        legacy_evidence=legacy_evidence,
    )


@cli.command("eval-mixed-corpus")
@click.option("--level", type=click.Choice(list(MIXED_CORPUS_EVAL_LEVELS)), help="Eval level to run")
@click.option("--top-k", type=int, help="Top-k for retrieval eval")
@click.option("--category", type=str, help="Filter by reasoning_type")
@click.option("--difficulty", type=str, help="Filter by difficulty")
@click.option("--question", type=str, help="Run single question by ID")
def eval_mixed_corpus(level: str | None, top_k: int | None, category: str | None, difficulty: str | None, question: str | None):
    """Run retrieval and cross-ref evals against the mixed-corpus graph."""
    levels = [level] if level else list(MIXED_CORPUS_EVAL_LEVELS)
    _run_eval_levels(
        levels,
        top_k=top_k,
        category=category,
        difficulty=difficulty,
        question=question,
    )


@cli.command("eval-compare")
@click.argument("run_a")
@click.argument("run_b")
def eval_compare(run_a: str, run_b: str):
    """Compare two eval runs for regression detection."""
    from pipeline.eval.results import load_result, list_results
    from pipeline.eval.metrics import compare_runs
    from pipeline.eval.reports import print_comparison_report
    from pipeline.config import EVAL_REGRESSION_THRESHOLD

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
        overall = agg.get("overall")
        if overall is None and result.get("level") == "answer":
            values = [
                entry.get("scores", {}).get("overall")
                for entry in result.get("per_question", [])
                if entry.get("scores", {}).get("overall") is not None
            ]
            overall = (sum(values) / len(values)) if values else None
        n = result.get("config", {}).get("dataset_count", 0)
        line = (
            f"  {result['run_id']}  ({result['level']})  "
            f"P@k={p:.2f}  R@k={r:.2f}  Hit={hit:.0%}"
        )
        if overall is not None:
            line += f"  Overall={overall:.2f}/3.00"
        line += f"  (n={n})"
        console.print(line)


@cli.command("eval-answer-stability")
@click.option("--last", type=int, default=5, help="Analyze the last N answer runs")
@click.option("--question", type=str, help="Filter to a single question ID")
@click.option("--pass-threshold", type=int, default=3, help="Treat scores below this overall score as misses")
@click.option("--stable-miss-threshold", type=int, default=2, help="Flag questions missed in this many runs as stable misses")
@click.option("--high-variance-threshold", type=int, default=1, help="Flag questions with score range at or above this value")
@click.option("--include-targeted/--full-only", default=False, help="Include single-question or subset eval runs instead of only full runs")
def eval_answer_stability(
    last: int,
    question: str | None,
    pass_threshold: int,
    stable_miss_threshold: int,
    high_variance_threshold: int,
    include_targeted: bool,
):
    """Summarize recent answer-run stability and separate stable misses from eval wobble."""
    from pipeline.eval.metrics import summarize_answer_stability
    from pipeline.eval.reports import print_answer_stability_report
    from pipeline.eval.results import list_results, load_result

    runs = [load_result(path) for path in list_results(level="answer")]
    if not runs:
        console.print("No answer eval runs found.")
        return

    if not include_targeted:
        max_dataset_count = max(run.get("config", {}).get("dataset_count", 0) for run in runs)
        runs = [
            run for run in runs
            if run.get("config", {}).get("dataset_count", 0) == max_dataset_count
        ]

    if question:
        runs = [
            run for run in runs
            if any(entry.get("id") == question for entry in run.get("per_question", []))
        ]

    runs = runs[:last]
    if not runs:
        console.print("No matching answer eval runs found.")
        return

    summary = summarize_answer_stability(
        runs,
        pass_threshold=pass_threshold,
        stable_miss_threshold=stable_miss_threshold,
        high_variance_threshold=high_variance_threshold,
    )
    print_answer_stability_report(summary)


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


if __name__ == "__main__":
    cli()
