"""Human-readable report generation for eval results."""

from rich.console import Console
from rich.table import Table

console = Console()


def print_retrieval_report(result: dict):
    """Print a formatted retrieval eval report to the terminal."""
    config = result["config"]
    agg = result["aggregate"]
    by_diff = result.get("by_difficulty", {})
    per_q = result.get("per_question", [])

    console.print(f"\n[bold]{'=' * 50}[/bold]")
    console.print(f"  [bold]Retrieval Evaluation — {result['run_id']}[/bold]")
    console.print(f"  Dataset: {config['dataset_count']} questions")
    console.print(f"  Model: {config['embedding_model']} | Top-k: {config['top_k']}")
    console.print(f"[bold]{'=' * 50}[/bold]")

    # Aggregate
    console.print("\n  [bold]Aggregate[/bold]")
    console.print(f"  {'─' * 45}")
    for metric, val in agg.items():
        if "rate" in metric:
            console.print(f"  {metric:<20s} {val:.1%}")
        else:
            console.print(f"  {metric:<20s} {val:.2f}")

    # By difficulty
    if by_diff:
        console.print("\n  [bold]By Difficulty[/bold]")
        console.print(f"  {'─' * 45}")
        table = Table(show_header=True, header_style="bold", box=None, padding=(0, 2))
        table.add_column("")
        table.add_column("P@k", justify="right")
        table.add_column("R@k", justify="right")
        table.add_column("MRR", justify="right")
        table.add_column("Hit%", justify="right")
        table.add_column("n", justify="right")
        for diff in ["simple", "moderate", "complex"]:
            if diff in by_diff:
                d = by_diff[diff]
                table.add_row(
                    diff,
                    f"{d['precision_at_k']:.2f}",
                    f"{d['recall_at_k']:.2f}",
                    f"{d['mrr']:.2f}",
                    f"{d['primary_hit_rate']:.0%}",
                    str(d.get("count", "")),
                )
        console.print(table)

    # Failures
    failures = [q for q in per_q if not q.get("primary_hit")]
    if failures:
        console.print("\n  [bold red]Failures (primary section not in top-k)[/bold red]")
        console.print(f"  {'─' * 45}")
        for f in failures:
            console.print(f"  {f['id']}  [{f['difficulty']}/{f['reasoning_type']}]")

    console.print()


def print_answer_report(result: dict):
    """Print a formatted answer quality eval report to the terminal."""
    config = result["config"]
    agg = result.get("aggregate", {})
    by_diff = result.get("by_difficulty", {})
    per_q = result.get("per_question", [])

    console.print(f"\n[bold]{'=' * 55}[/bold]")
    console.print(f"  [bold]Answer Quality Evaluation — {result['run_id']}[/bold]")
    console.print(f"  Dataset: {config['dataset_count']} questions")
    console.print(f"  Judge model: {config.get('judge_model', 'unknown')}")
    console.print(f"[bold]{'=' * 55}[/bold]")

    # Aggregate score means across all questions
    dims = ["factual_accuracy", "completeness", "hallucination", "citation_quality", "overall"]
    if per_q:
        console.print("\n  [bold]Aggregate Scores (mean, 0–3 scale)[/bold]")
        console.print(f"  {'─' * 50}")
        for dim in dims:
            mean = agg.get(dim)
            if mean is None:
                vals = [
                    q["scores"].get(dim)
                    for q in per_q
                    if q.get("scores") and q["scores"].get(dim) is not None
                ]
                mean = sum(vals) / len(vals) if vals else 0.0
            bar = "█" * int(mean) + "░" * (3 - int(mean))
            console.print(f"  {dim:<20s} {mean:.2f} / 3.00  {bar}")

    route = result.get("route_first_document")
    if route:
        rate = route.get("golden_rate")
        console.print("\n  [bold]First routed document[/bold]")
        console.print(f"  {'─' * 50}")
        console.print(
            f"  golden {route['golden']} (primary {route['primary']}, supporting {route['supporting']})"
            f"  not golden {route['none']}  no route recorded {route['unknown']}"
            f"  rate {'n/a' if rate is None else f'{rate:.1%}'}"
        )
        if route.get("not_golden_ids"):
            console.print(f"  not golden: {', '.join(route['not_golden_ids'])}")

    # By difficulty
    if by_diff:
        console.print("\n  [bold]By Difficulty (mean overall score)[/bold]")
        console.print(f"  {'─' * 50}")
        table = Table(show_header=True, header_style="bold", box=None, padding=(0, 2))
        table.add_column("")
        for dim in dims:
            table.add_column(dim[:8], justify="right")
        table.add_column("n", justify="right")
        for diff in ["simple", "moderate", "complex"]:
            subset = [q for q in per_q if q.get("difficulty") == diff and "scores" in q]
            if subset:
                row = [diff]
                for dim in dims:
                    # Error rows carry None scores — exclude them rather than
                    # crash or count them as zeros.
                    vals = [v for v in (q["scores"].get(dim) for q in subset) if v is not None]
                    row.append(f"{sum(vals)/len(vals):.2f}" if vals else "—")
                row.append(str(len(subset)))
                table.add_row(*row)
        console.print(table)

    # Per-question scores
    console.print("\n  [bold]Per-Question Results[/bold]")
    console.print(f"  {'─' * 50}")
    def fmt(value) -> str:
        return "—" if value is None else str(value)

    for q in per_q:
        scores = q.get("scores") or {}
        overall = scores.get("overall")
        if overall is None:
            color = "yellow"
        else:
            color = "green" if overall >= 2 else "red"
        snippet = (q.get("agent_answer") or "")[:80].replace("\n", " ")
        console.print(
            f"  [{color}]{q['id']}[/{color}]  [{q['difficulty']}/{q['reasoning_type']}]  "
            f"overall={fmt(overall)}/3  fa={fmt(scores.get('factual_accuracy'))}  "
            f"comp={fmt(scores.get('completeness'))}  hall={fmt(scores.get('hallucination'))}  "
            f"cit={fmt(scores.get('citation_quality'))}"
        )
        if snippet:
            console.print(f"    [dim]{snippet}...[/dim]")
        if q.get("agent_error"):
            console.print(f"    [red]ERROR: {q['agent_error'][:120]}[/red]")

    # Failures (error rows with None scores are reported separately above)
    failures = [
        q for q in per_q
        if (q.get("scores") or {}).get("overall") is not None
        and q["scores"]["overall"] < 2
    ]
    if failures:
        console.print("\n  [bold red]Failures (overall < 2)[/bold red]")
        console.print(f"  {'─' * 50}")
        for f in failures:
            expl = ((f.get("scores") or {}).get("explanation") or "")[:120]
            console.print(f"  {f['id']}  [{f['difficulty']}/{f['reasoning_type']}]  {expl}")

    console.print()


def print_answer_stability_report(summary: dict):
    """Print a multi-run answer stability report."""
    questions = summary.get("questions", [])
    latest_run_id = summary.get("latest_run_id")
    pass_threshold = summary.get("pass_threshold", 3)
    stable_miss_threshold = summary.get("stable_miss_threshold", 2)
    run_ids = summary.get("run_ids", [])

    console.print(f"\n[bold]{'=' * 60}[/bold]")
    console.print("  [bold]Answer Stability Report[/bold]")
    console.print(
        "  "
        f"Runs analyzed: {summary.get('run_count', 0)}"
        + (f" | Latest: {latest_run_id}" if latest_run_id else "")
    )
    console.print(
        "  "
        f"Miss threshold: overall < {pass_threshold}"
        f" | Stable miss: {stable_miss_threshold}+ runs"
    )
    console.print(f"[bold]{'=' * 60}[/bold]")

    if run_ids:
        shown = ", ".join(run_ids[:5])
        suffix = f" ... (+{len(run_ids) - 5} older)" if len(run_ids) > 5 else ""
        console.print(f"  Runs: {shown}{suffix}")

    stable_misses = [question for question in questions if question.get("stable_miss")]
    if stable_misses:
        console.print("\n  [bold red]Stable Misses[/bold red]")
        console.print(f"  {'─' * 55}")
        for question in stable_misses:
            mean = question.get("mean_overall")
            score_range = question.get("score_range")
            console.print(
                "  "
                f"{question['id']}  "
                f"[{question['difficulty']}/{question['reasoning_type']}]  "
                f"latest={question.get('latest_overall', 'n/a')}/3  "
                f"misses={question['miss_count']}/{question['scorable_runs']}  "
                f"mean={mean:.2f}  "
                f"range={score_range:.0f}"
            )
            explanation = (question.get("latest_explanation") or "").strip()
            if explanation:
                console.print(f"    [dim]{explanation[:140]}[/dim]")

    high_variance = [
        question
        for question in questions
        if question.get("high_variance") and not question.get("stable_miss")
    ]
    if high_variance:
        console.print("\n  [bold yellow]High Variance[/bold yellow]")
        console.print(f"  {'─' * 55}")
        for question in high_variance:
            console.print(
                "  "
                f"{question['id']}  "
                f"latest={question.get('latest_overall', 'n/a')}/3  "
                f"range={question['score_range']:.0f}  "
                f"misses={question['miss_count']}/{question['scorable_runs']}  "
                f"lane={question.get('latest_lane') or 'unknown'}"
            )

    latest_misses = [
        question
        for question in questions
        if question.get("latest_run_id") == latest_run_id
        and question.get("latest_overall") is not None
        and question["latest_overall"] < pass_threshold
    ]
    if latest_misses:
        console.print("\n  [bold]Latest Run Misses With History[/bold]")
        console.print(f"  {'─' * 55}")
        for question in latest_misses:
            console.print(
                "  "
                f"{question['id']}  "
                f"latest={question['latest_overall']}/3  "
                f"misses={question['miss_count']}/{question['scorable_runs']}  "
                f"mean={question['mean_overall']:.2f}  "
                f"stable={'yes' if question['stable_miss'] else 'no'}"
            )

    if not stable_misses and not high_variance and not latest_misses:
        console.print("\n  [green]No stable misses or high-variance questions found in the selected runs.[/green]")

    console.print()


def print_comparison_report(diffs: list[dict]):
    """Print a regression comparison report."""
    console.print("\n[bold]Run Comparison[/bold]")
    console.print(f"{'─' * 50}")

    for d in diffs:
        arrow = "↑" if d["delta"] > 0 else "↓" if d["delta"] < 0 else "="
        color = "red" if d.get("regression") else "green" if d["delta"] > 0 else ""
        style = f"[{color}]" if color else ""
        end_style = f"[/{color}]" if color else ""
        flag = " ⚠ REGRESSION" if d.get("regression") else ""

        console.print(
            f"  {d['metric']:<20s} {d['before']:.3f} → {d['after']:.3f} "
            f"{style}({arrow}{abs(d['delta']):.3f}){end_style}{flag}"
        )
