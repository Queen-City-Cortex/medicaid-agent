"""Shared in-memory fakes for the Neo4j session / graph-writer seams.

Production modules reach Neo4j through ``get_session()`` and the
``graph_writer`` singleton; tests monkeypatch both with the recorders below.
Fakes with genuinely module-specific protocols (e.g. test_corpus_writer's
failure-injecting session) stay local to their test file.
"""

from contextlib import contextmanager


class FakeResult(list):
    """List of records that also supports neo4j's ``Result.single()``."""

    def single(self):
        return self[0] if self else None


class RecordingSession:
    """Fake Neo4j session that records every ``run()`` call.

    ``handlers`` is an iterable of ``(match, records)`` pairs; the first pair
    whose ``match(query, params)`` is truthy determines the returned records.
    Unmatched queries return an empty result.
    """

    def __init__(self, handlers=()):
        self.handlers = list(handlers)
        self.calls: list[tuple[str, dict]] = []
        self.commits = 0

    @property
    def queries(self) -> list[str]:
        return [query for query, _ in self.calls]

    def run(self, query: str, params: dict | None = None):
        params = params or {}
        self.calls.append((query, params))
        for match, records in self.handlers:
            if match(query, params):
                return FakeResult(records)
        return FakeResult()

    def execute_write(self, fn, *args, **kwargs):
        # The transaction is the session: fn's tx.run() keeps recording.
        result = fn(self, *args, **kwargs)
        self.commits += 1
        return result


def session_factory(session):
    """A ``get_session`` / ``_session_factory`` replacement yielding ``session``."""

    @contextmanager
    def factory():
        yield session

    return factory


def _first_argument(args: tuple, kwargs: dict):
    if args:
        return args[0]
    return next(iter(kwargs.values()), None)


class RecordingGraphWriter:
    """Stand-in for the ``graph_writer`` singleton recording every method call.

    Method names are validated against the real ``CorpusGraphWriter`` so a
    typo'd or renamed writer method fails the test loudly instead of being
    recorded silently. Like the real ``merge_*`` methods, a recorded call
    returns ``len(first argument)`` when it is sized.
    """

    def __init__(self):
        self.calls: dict[str, list[tuple[tuple, dict]]] = {}

    def __getattr__(self, name):
        from pipeline.graph.corpus_writer import CorpusGraphWriter

        if name.startswith("_") or not callable(getattr(CorpusGraphWriter, name, None)):
            raise AttributeError(f"CorpusGraphWriter has no method {name!r}")

        def record(*args, **kwargs):
            self.calls.setdefault(name, []).append((args, kwargs))
            first = _first_argument(args, kwargs)
            return len(first) if hasattr(first, "__len__") else None

        return record

    def received(self, method: str) -> list:
        """The first argument (positional or keyword) of each recorded call."""
        return [_first_argument(args, kwargs) for args, kwargs in self.calls.get(method, [])]
