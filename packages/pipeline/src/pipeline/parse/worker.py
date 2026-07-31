"""Minimal multiprocessing bootstrap for isolated parser workers."""

from __future__ import annotations

import importlib
import multiprocessing
import sys
import sysconfig
from pathlib import Path


def _preload_stdlib_typing() -> None:
    """Load stdlib typing before importing converter dependencies.

    OpenCV temporarily exposes its package directory as an import root. Python
    spawn workers can inherit that path from their parent, which otherwise
    allows cv2/typing to shadow the standard-library module.
    """
    stdlib_path = Path(sysconfig.get_path("stdlib")).resolve()
    existing = sys.modules.get("typing")
    existing_path = getattr(existing, "__file__", None)
    if existing_path is not None and not Path(existing_path).resolve().is_relative_to(
        stdlib_path
    ):
        del sys.modules["typing"]

    original_path = sys.path[:]
    try:
        sys.path.insert(0, str(stdlib_path))
        typing_module = importlib.import_module("typing")
    finally:
        sys.path[:] = original_path

    typing_path = Path(typing_module.__file__).resolve()
    if not typing_path.is_relative_to(stdlib_path):
        raise ImportError(
            f"expected stdlib typing from {stdlib_path}, loaded {typing_path}"
        )


def _configure_semaphore_prefix(semaphore_prefix: str | None) -> None:
    """Give this spawn worker an ownership-safe POSIX semaphore namespace."""
    if not semaphore_prefix:
        return
    process_config = getattr(multiprocessing.current_process(), "_config")
    process_config["semprefix"] = semaphore_prefix


def parse_supported_file_worker(
    source_path_str: str,
    source_type: str,
    result_connection,
    semaphore_prefix: str | None = None,
) -> None:
    """Enter the heavy parser only after repairing the inherited import path."""
    try:
        _configure_semaphore_prefix(semaphore_prefix)
        _preload_stdlib_typing()

        from pipeline.parse.converter import _parse_supported_file_worker

        _parse_supported_file_worker(source_path_str, source_type, result_connection)
    except Exception as error:  # pragma: no cover - parent wrapper owns reporting
        result_connection.send(
            {
                "ok": False,
                "error_message": f"{type(error).__name__}: {error}"[:4096],
            }
        )
    finally:
        result_connection.close()
