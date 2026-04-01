"""Test amendment detection batching behavior."""

from contextlib import contextmanager

from pipeline.references import amendments


class FakeResult(list):
    pass


class FakeSession:
    def __init__(self):
        self.writes: list[tuple[str, dict]] = []

    def run(self, query: str, params: dict | None = None):
        params = params or {}
        if "RETURN d.id AS doc_id, d.title AS title" in query:
            return FakeResult([
                {
                    "doc_id": "doc:change",
                    "title": "CHANGE NOTICE FOR MANUAL NO. 01-24, MA-3200",
                    "doc_type": "dhhs_policy",
                    "policy_number": "CN-01-24",
                },
                {
                    "doc_id": "doc:base",
                    "title": "MA-3200 Base Policy",
                    "doc_type": "dhhs_policy",
                    "policy_number": "MA-3200",
                },
            ])
        if "RETURN d.id AS doc_id, collect(s.content_text) AS texts" in query:
            return FakeResult([
                {
                    "doc_id": "doc:change",
                    "texts": ["See MA-3200 for the revised eligibility rule."],
                }
            ])

        self.writes.append((query, params))
        return FakeResult()


def test_detect_amendments_batches_edge_and_status_writes(monkeypatch):
    session = FakeSession()

    @contextmanager
    def fake_get_session():
        yield session

    monkeypatch.setattr(amendments, "get_session", fake_get_session)

    stats = amendments.detect_amendments()

    assert stats["change_notices"] == 1
    assert stats["edges_created"] == 1

    merge_call = next(query for query, _ in session.writes if "MERGE (src)-[:AMENDS]->(tgt)" in query)
    status_params = next(params for query, params in session.writes if "SET d.status = $status" in query)

    assert "UNWIND $pairs AS pair" in merge_call
    assert status_params == {"doc_ids": ["doc:change"], "status": "amendment"}
