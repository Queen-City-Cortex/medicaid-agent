"""Test Neo4j schema helpers."""

from contextlib import contextmanager

from pipeline.graph import schema


class FakeSession:
    def __init__(self):
        self.commands: list[str] = []

    def run(self, query: str):
        self.commands.append(query)


def test_ensure_schema_runs_constraints_and_indexes(monkeypatch):
    session = FakeSession()

    @contextmanager
    def fake_get_session():
        yield session

    monkeypatch.setattr(schema, "get_session", fake_get_session)

    schema.ensure_schema()

    assert len(session.commands) == len(schema.CONSTRAINTS) + len(schema.INDEXES)
    for constraint in schema.CONSTRAINTS:
        assert constraint in session.commands
    for index in schema.INDEXES:
        assert index in session.commands
