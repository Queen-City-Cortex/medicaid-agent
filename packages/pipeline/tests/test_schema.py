"""Test Neo4j schema helpers."""

from pipeline.graph import schema
from tests.fakes import RecordingSession, session_factory


def test_ensure_schema_runs_constraints_and_indexes(monkeypatch):
    session = RecordingSession()

    monkeypatch.setattr(schema, "get_session", session_factory(session))

    schema.ensure_schema()

    assert len(session.queries) == len(schema.CONSTRAINTS) + len(schema.INDEXES)
    for constraint in schema.CONSTRAINTS:
        assert constraint in session.queries
    for index in schema.INDEXES:
        assert index in session.queries
