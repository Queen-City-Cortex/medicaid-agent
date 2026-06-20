"""Logging configuration for the pipeline.

The pipeline uses `rich.console` for human-facing progress output, but
operational events — Voyage retries, Neo4j write failures, parse exceptions —
go through the stdlib `logging` module so they carry levels and can be filtered,
redirected, or asserted in tests (`caplog`). Stdlib logging was previously
unconfigured (no handler), so those records went nowhere; `configure_logging`
wires a handler once at CLI startup.

Module loggers should be `logging.getLogger(__name__)` (so names are
`pipeline.<module>`); they need no handler of their own — they propagate to the
root handler installed here.
"""

import logging
import os

_configured = False


def configure_logging(level: str | None = None) -> None:
    """Install a stderr log handler once. Idempotent.

    Level resolves from the `level` arg, then `LOG_LEVEL`, then `INFO`.
    Safe to call from every CLI entry; the first call wins.
    """
    global _configured
    if _configured:
        return
    resolved = (level or os.environ.get("LOG_LEVEL") or "INFO").upper()
    # force=True so our handler/format actually installs even if something
    # (a library, an earlier import) already configured the root logger —
    # otherwise basicConfig is a silent no-op and the logs go nowhere.
    logging.basicConfig(
        level=getattr(logging, resolved, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        force=True,
    )
    _configured = True
