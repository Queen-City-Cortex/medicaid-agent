"""CLI entry point for the NC Medicaid document pipeline.

The CLI is split by domain across this package; importing the package wires
every command onto the shared `cli` group. The group and `console` live in
`_shared`; importing the command submodules below is what registers their
commands. Private stage helpers are re-exported here so callers (and tests)
can keep referring to them as `pipeline.cli.<helper>`.
"""

from pipeline.cli._shared import cli, console

# Importing each command module registers its commands on `cli`.
from pipeline.cli import build, references, federal, graph, eval, audit  # noqa: F401

# Back-compat re-exports: these helpers used to live directly in cli.py.
from pipeline.cli.build import _run_mixed_corpus_build, _fail_on_embed_errors  # noqa: F401
from pipeline.cli.eval import _run_eval_level, _print_eval_result, _run_eval_levels  # noqa: F401
from pipeline.cli.audit import _run_fee_schedule_backlog  # noqa: F401

__all__ = ["cli", "console"]
