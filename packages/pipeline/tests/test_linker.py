"""Tests for concept link planning through the graph writer boundary."""

from contextlib import contextmanager

from pipeline.concepts import linker


class FakeSession:
    def __init__(self, sections):
        self.sections = sections

    def run(self, query: str, params: dict | None = None):
        if "MATCH (s:Section) RETURN s.id, s.title, s.content_text" in query:
            return self.sections
        return []


def test_link_concepts_emits_relationships_through_graph_writer(monkeypatch):
    session = FakeSession([
        {"s.id": "sec:1", "s.title": "Definitions", "s.content_text": "EPSDT means Early and Periodic Screening."},
        {"s.id": "sec:2", "s.title": "Services Not Covered", "s.content_text": "Durable Medical Equipment is excluded here."},
    ])

    @contextmanager
    def fake_get_session():
        yield session

    class FakeWriter:
        def __init__(self):
            self.links = None

        def merge_concept_links(self, links):
            self.links = list(links)
            return len(links)

    fake_writer = FakeWriter()

    monkeypatch.setattr(linker, "get_session", fake_get_session)
    monkeypatch.setattr(linker, "graph_writer", fake_writer)
    monkeypatch.setattr(linker, "track", lambda iterable, description=None: iterable)

    stats = linker.link_concepts()

    assert stats["edges_created"] == len(fake_writer.links)
    assert ("concept:epsdt", "DEFINES") in {
        (link.concept_id, link.relationship_type) for link in fake_writer.links
    }
    assert ("concept:durable-medical-equipment", "RESTRICTS") in {
        (link.concept_id, link.relationship_type) for link in fake_writer.links
    }
