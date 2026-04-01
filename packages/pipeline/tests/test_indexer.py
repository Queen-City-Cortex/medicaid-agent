"""Test grouped vector-search behavior."""

from contextlib import contextmanager

from pipeline.embeddings import indexer


class FakeSession:
    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def run(self, query: str, params: dict):
        self.calls.append((query, params))
        if "section_embeddings" in query:
            doc_types = tuple(params.get("doc_types") or [])
            if doc_types == ("clinical_policy",):
                return [
                    {
                        "section_id": "sec:clinical",
                        "section_number": "1",
                        "section_title": "Clinical",
                        "policy_number": "1A",
                        "document_type": "clinical_policy",
                        "doc_title": "Clinical Policy",
                        "content": "clinical content",
                        "score": 0.91,
                    }
                ]
            if doc_types == ("dhhs_policy",):
                return [
                    {
                        "section_id": "sec:dhhs",
                        "section_number": "2",
                        "section_title": "Eligibility",
                        "policy_number": "8C",
                        "document_type": "dhhs_policy",
                        "doc_title": "DHHS Policy",
                        "content": "dhhs content",
                        "score": 0.92,
                    }
                ]
            return []
        if "MATCH (c:PolicyConcept)" in query:
            return [
                {
                    "section_id": "sec:concept",
                    "section_number": "3",
                    "section_title": "Concept",
                    "policy_number": "8C",
                    "document_type": "dhhs_policy",
                    "doc_title": "DHHS Policy",
                    "content": "concept content",
                    "score": 0.75,
                }
            ]
        if "chunk_embeddings" in query:
            return [
                {
                    "section_id": "sec:clinical",
                    "section_number": "1",
                    "section_title": "Clinical",
                    "policy_number": "1A",
                    "document_type": "clinical_policy",
                    "doc_title": "Clinical Policy",
                    "content": "chunk content",
                    "score": 0.96,
                },
                {
                    "section_id": "sec:chunk",
                    "section_number": "4",
                    "section_title": "Chunk Winner",
                    "policy_number": "8C",
                    "document_type": "dhhs_policy",
                    "doc_title": "DHHS Policy",
                    "content": "chunk-only content",
                    "score": 0.93,
                },
            ]
        return []


def test_vector_search_matches_runtime_grouping_and_dedup(monkeypatch):
    session = FakeSession()

    @contextmanager
    def fake_get_session():
        yield session

    monkeypatch.setattr(indexer, "get_session", fake_get_session)

    results = indexer.vector_search(
        query_embedding=[0.1, 0.2, 0.3],
        top_k=3,
        query_text="prior authorization concept",
    )

    assert [row["section_id"] for row in results] == [
        "sec:clinical",
        "sec:chunk",
        "sec:dhhs",
    ]
    assert results[0]["content"] == "chunk content"
    assert any("MATCH (c:PolicyConcept)" in query for query, _ in session.calls)


def test_vector_search_respects_explicit_document_types(monkeypatch):
    session = FakeSession()

    @contextmanager
    def fake_get_session():
        yield session

    monkeypatch.setattr(indexer, "get_session", fake_get_session)

    indexer.vector_search(
        query_embedding=[0.1, 0.2, 0.3],
        top_k=2,
        document_types=["dhhs_policy"],
        query_text="eligibility",
    )

    section_calls = [params for query, params in session.calls if "section_embeddings" in query]
    assert len(section_calls) == 1
    assert section_calls[0]["doc_types"] == ["dhhs_policy"]


class GenericConceptSession(FakeSession):
    def run(self, query: str, params: dict):
        self.calls.append((query, params))
        if "section_embeddings" in query:
            return [
                {
                    "section_id": "sec:primary",
                    "section_number": "5.9.1",
                    "section_title": "Primary",
                    "policy_number": "3K-2",
                    "document_type": "clinical_policy",
                    "doc_title": "Clinical Policy",
                    "content": "primary content",
                    "score": 0.90,
                }
            ]
        if "MATCH (c:PolicyConcept)" in query:
            if "section.section_number IS NOT NULL" in query:
                return []
            return [
                {
                    "section_id": "sec:generic",
                    "section_number": None,
                    "section_title": "Revision Information:",
                    "policy_number": "3K-2",
                    "document_type": "clinical_policy",
                    "doc_title": "Clinical Policy",
                    "content": "generic concept content",
                    "score": 0.75,
                }
            ]
        if "chunk_embeddings" in query:
            return [
                {
                    "section_id": "sec:supporting",
                    "section_number": "3.4.5",
                    "section_title": "Supporting",
                    "policy_number": "3K-2",
                    "document_type": "clinical_policy",
                    "doc_title": "Clinical Policy",
                    "content": "supporting semantic content",
                    "score": 0.74,
                }
            ]
        return []


def test_vector_search_filters_generic_concept_matches(monkeypatch):
    session = GenericConceptSession()

    @contextmanager
    def fake_get_session():
        yield session

    monkeypatch.setattr(indexer, "get_session", fake_get_session)

    results = indexer.vector_search(
        query_embedding=[0.1, 0.2, 0.3],
        top_k=2,
        query_text="home modifications cap/da",
    )

    assert [row["section_id"] for row in results] == [
        "sec:primary",
        "sec:supporting",
    ]
    concept_queries = [query for query, _ in session.calls if "MATCH (c:PolicyConcept)" in query]
    assert len(concept_queries) == 1
    assert "section.section_number IS NOT NULL" in concept_queries[0]
