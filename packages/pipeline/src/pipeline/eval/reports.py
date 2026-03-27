"""Human-readable report generation for eval results."""

from rich.console import Console
from rich.table import Table

console = Console()


def print_retrieval_report(result: dict):
    """Print a formatted retrieval eval report to the terminal."""
    config = result["config"]
    agg = result["aggregate"]
    by_diff = result.get("by_difficulty", {})
    by_cat = result.get("by_category", {})
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
        console.print(f"\n  [bold]By Difficulty[/bold]")
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
        console.print(f"\n  [bold red]Failures (primary section not in top-k)[/bold red]")
        console.print(f"  {'─' * 45}")
        for f in failures:
            console.print(f"  {f['id']}  [{f['difficulty']}/{f['reasoning_type']}]")

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
