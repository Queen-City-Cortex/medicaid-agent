"""Shared CLI group and console for the NC Medicaid document pipeline.

The command modules in this package import `cli` from here and register their
commands with `@cli.command(...)`. Keeping the group and console in their own
module (rather than in `__init__`) means the command modules never import the
partially-initialized package, so there are no import-ordering hazards.
"""

import click
from rich.console import Console

from pipeline.logging_setup import configure_logging

console = Console()


@click.group()
def cli():
    """NC Medicaid Document Pipeline — parse, load, embed, and inspect."""
    # Wire stdlib logging so operational logs (Voyage retries, Neo4j write
    # failures, parse exceptions) actually reach a handler on every CLI run.
    configure_logging()
