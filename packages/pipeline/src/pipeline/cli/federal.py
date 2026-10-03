"""Federal source ingestion commands: eCFR regulations and the Social Security Act."""

import click

from pipeline.cli._shared import cli, console


@cli.command("ingest-cfr")
@click.option("--part", type=int, help="Ingest only this CFR part number")
@click.option("--refresh", is_flag=True, help="Force re-fetch even if cached (use when CMS finalizes major rules)")
def ingest_cfr(part: int | None, refresh: bool):
    """Fetch and load Medicaid-relevant federal regulations from eCFR."""
    from pipeline.federal.loader import load_all_cfr

    stats = load_all_cfr(part_filter=part, refresh=refresh)
    console.print(f"\n[bold]eCFR ingest complete:[/bold] {stats['parts_loaded']} parts, {stats['sections_total']} sections, {stats['errors']} errors")
    if stats["errors"]:
        raise click.ClickException("Federal regulation ingestion failed")


@cli.command("ingest-ssa")
@click.option("--refresh", is_flag=True, help="Force re-fetch from ssa.gov")
def ingest_ssa(refresh: bool):
    """Fetch and load Social Security Act Title XIX (Medicaid) and XXI (CHIP)."""
    from pipeline.federal.loader import load_ssa
    stats = load_ssa(refresh=refresh)
    console.print(f"\n[bold]SSA ingest complete:[/bold] {stats['titles_loaded']} titles, {stats['sections_total']} sections, {stats['errors']} errors")
    if stats["errors"]:
        raise click.ClickException("Federal statute ingestion failed")
