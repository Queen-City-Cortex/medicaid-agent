"""Evaluation commands: eval, eval-mixed-corpus, eval-compare, eval-runs,
eval-answer-stability, eval-validate, eval-validate-golden."""

import click

from pipeline.cli._shared import cli, console

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
    dataset: str | None = None,
) -> dict:
    from pathlib import Path

    from pipeline.eval.runner import run_eval

    return run_eval(
        level=level,
        difficulty=difficulty,
        reasoning_type=category,
        question_id=question,
        top_k=top_k,
        from_result=from_result,
        legacy_evidence=legacy_evidence,
        dataset_path=Path(dataset) if dataset else None,
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
    dataset: str | None = None,
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
            dataset=dataset,
        )
        if "error" in result:
            console.print(f"[red]{result['error']}[/red]")
            continue

        _print_eval_result(level, result)
        results[level] = result

    return results


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
@click.option(
    "--dataset",
    type=click.Path(exists=True, dir_okay=False, path_type=str),
    help="Alternate dataset JSON (same schema as the golden dataset). "
         "Default is data/golden/dataset.json.",
)
def eval(
    level: str | None,
    top_k: int | None,
    category: str | None,
    difficulty: str | None,
    question: str | None,
    from_result: str | None,
    legacy_evidence: bool,
    dataset: str | None,
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
        dataset=dataset,
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
@click.option(
    "--fail-on-regression",
    is_flag=True,
    default=False,
    help="Exit non-zero when any metric regresses beyond the threshold (or a "
         "run can't be found). Lets automation gate a deploy on this comparison.",
)
def eval_compare(run_a: str, run_b: str, fail_on_regression: bool):
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
        # A gate that can't find its baseline must block, not wave through.
        if fail_on_regression:
            raise SystemExit(1)
        return

    result_a = load_result(file_a)
    result_b = load_result(file_b)
    try:
        diffs = compare_runs(result_a, result_b, threshold=EVAL_REGRESSION_THRESHOLD)
    except ValueError as exc:
        # Different levels, evidence modes or dataset versions: not comparable.
        console.print(f"[red]{exc}[/red]")
        if fail_on_regression:
            raise SystemExit(1) from exc
        return
    print_comparison_report(diffs)

    regressed = [d["metric"] for d in diffs if d["regression"]]
    if regressed and fail_on_regression:
        console.print(f"[red]Regressions detected: {', '.join(regressed)}[/red]")
        raise SystemExit(1)


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
@click.option(
    "--dataset",
    type=click.Path(exists=True, dir_okay=False, path_type=str),
    help="Alternate dataset JSON (same schema as the golden dataset). "
         "Default is data/golden/dataset.json.",
)
def eval_validate(dataset: str | None):
    """Validate the golden dataset against the graph."""
    from pathlib import Path

    from pipeline.eval.dataset import validate_dataset, load_dataset
    from pipeline.graph.connection import get_session

    dataset_path = Path(dataset) if dataset else None

    # Schema validation
    errors = validate_dataset(dataset_path)
    if errors:
        console.print("[red]Schema validation errors:[/red]")
        for e in errors:
            console.print(f"  {e}")
        return

    console.print("[green]Schema validation: PASS[/green]")

    # Reference integrity
    entries = load_dataset(dataset_path)
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


@cli.command("eval-validate-golden")
@click.option(
    "--dataset",
    type=click.Path(exists=True, dir_okay=False, path_type=str),
    help="Alternate dataset JSON. Default is data/golden/dataset.json.",
)
@click.option(
    "--catalog",
    type=click.Path(exists=True, dir_okay=False, path_type=str),
    envvar="EVAL_IDENTITY_CATALOG",
    help="Frozen identity catalog from eval-identity-catalog. "
         "Defaults to EVAL_IDENTITY_CATALOG.",
)
def eval_validate_golden(dataset: str | None, catalog: str | None):
    """Check golden supporting quotes against frozen section text. Reads no graph."""
    from pathlib import Path

    from pipeline.eval.dataset import (
        benchmark_entries,
        catalog_sections,
        check_supporting_quotes,
        dataset_version,
        load_dataset,
        validate_dataset,
    )

    dataset_path = Path(dataset) if dataset else None
    errors = validate_dataset(dataset_path)
    if errors:
        raise click.ClickException("Dataset is not valid:\n  " + "\n  ".join(errors))
    entries = load_dataset(dataset_path)
    validated = benchmark_entries(entries)
    click.echo(
        f"Golden dataset version {dataset_version(dataset_path) or 'unversioned'}: "
        f"{len(entries)} entries, {len(validated)} validated, "
        f"{len(entries) - len(validated)} need validation"
    )
    if not catalog:
        # Section text lives in the corpus, not in Git. Without the frozen
        # catalog nothing was checked, and that must not read as a pass.
        raise click.ClickException(
            "No section text to check quotes against. Build a catalog with "
            "eval-identity-catalog and pass --catalog or set EVAL_IDENTITY_CATALOG."
        )
    sections = catalog_sections(Path(catalog))
    # Quotes recorded on entries still awaiting review are checked too, where
    # the catalog holds their section. A frozen identity catalog holds only the
    # validated entries' sections, so the rest are reported as not checked.
    quoted, unchecked = [], 0
    for entry in entries:
        quotes = entry.get("supporting_quotes") or []
        if entry.get("status") != "validated":
            present = [quote for quote in quotes if quote["section_id"] in sections]
            unchecked += len(quotes) - len(present)
            quotes = present
        if quotes:
            quoted.append({**entry, "supporting_quotes": quotes})
    errors = check_supporting_quotes(quoted, sections)
    if errors:
        raise click.ClickException(
            f"{len(errors)} supporting-quote failures:\n  " + "\n  ".join(errors)
        )
    quotes = sum(len(entry["supporting_quotes"]) for entry in quoted)
    click.echo(f"Supporting quotes: PASS ({quotes} quotes on {len(quoted)} entries)")
    if unchecked:
        click.echo(
            f"Not checked: {unchecked} quotes on entries awaiting review, "
            "whose sections are not in this catalog"
        )


@cli.command("eval-identity-catalog")
@click.option("--output", type=click.Path(dir_okay=False, path_type=str), required=True)
def eval_identity_catalog(output: str):
    """Freeze canonical evidence identities from approved parses and federal caches."""
    from pathlib import Path
    from pipeline.config import CORPUS_DATA_ROOT
    from pipeline.eval.dataset import benchmark_entries, load_dataset
    from pipeline.eval.identity import build_catalog
    from pipeline.release import atomic_write_json
    from pipeline.retirement import corpus_writer_lock
    if CORPUS_DATA_ROOT is None:
        raise click.ClickException("CORPUS_DATA_ROOT is required")
    with corpus_writer_lock(CORPUS_DATA_ROOT):
        # Only validated entries are scored, so only their evidence is frozen.
        catalog = build_catalog(benchmark_entries(load_dataset()))
        atomic_write_json(Path(output), catalog)
    click.echo(f"Frozen evidence catalog: {catalog['catalogHash']}")
