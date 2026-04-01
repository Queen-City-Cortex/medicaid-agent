"""Helpers for chunking bulk database writes."""

from collections.abc import Iterable, Iterator


def chunked(items: Iterable, size: int) -> Iterator[list]:
    """Yield lists of at most ``size`` items from an iterable."""
    batch: list = []
    for item in items:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch
