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


def _run_linker(monkeypatch, sections):
    session = FakeSession(sections)

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
    return stats, fake_writer.links


def test_link_concepts_emits_relationships_through_graph_writer(monkeypatch):
    stats, links = _run_linker(monkeypatch, [
        {"s.id": "sec:1", "s.title": "Definitions", "s.content_text": "EPSDT means Early and Periodic Screening."},
        {"s.id": "sec:2", "s.title": "Services Not Covered", "s.content_text": "Durable Medical Equipment is excluded here."},
    ])

    assert stats["edges_created"] == len(links)
    assert ("concept:epsdt", "DEFINES") in {
        (link.concept_id, link.relationship_type) for link in links
    }
    assert ("concept:durable-medical-equipment", "RESTRICTS") in {
        (link.concept_id, link.relationship_type) for link in links
    }


def test_hhs_does_not_link_to_home_health_services(monkeypatch):
    # "HHS" is the federal department across the CFR corpus, never an alias
    # for Home Health Services.
    _, links = _run_linker(monkeypatch, [
        {
            "s.id": "sec:cfr",
            "s.title": "Federal Oversight",
            "s.content_text": "The Secretary of HHS shall approve the state plan.",
        },
    ])

    assert "concept:home-health-services" not in {link.concept_id for link in links}


def test_home_health_services_full_name_still_links(monkeypatch):
    _, links = _run_linker(monkeypatch, [
        {
            "s.id": "sec:1",
            "s.title": "Coverage",
            "s.content_text": "Home health services are covered for eligible beneficiaries.",
        },
    ])

    assert "concept:home-health-services" in {link.concept_id for link in links}


def test_lowercase_pace_does_not_link_to_pace_program(monkeypatch):
    _, links = _run_linker(monkeypatch, [
        {
            "s.id": "sec:1",
            "s.title": "Service Delivery",
            "s.content_text": "Providers must keep pace with documentation requirements.",
        },
        {
            "s.id": "sec:2",
            "s.title": "Cardiac Devices",
            "s.content_text": "Coverage of pacemaker implantation and PACEMAKER follow-up.",
        },
    ])

    assert "concept:pace" not in {link.concept_id for link in links}


def test_uppercase_pace_and_full_name_link_to_pace_program(monkeypatch):
    _, links = _run_linker(monkeypatch, [
        {
            "s.id": "sec:1",
            "s.title": "Coverage",
            "s.content_text": "PACE participants receive comprehensive services.",
        },
        {
            "s.id": "sec:2",
            "s.title": "Coverage",
            "s.content_text": "The program of all-inclusive care for the elderly serves adults 55 and older.",
        },
    ])

    linked = {(link.section_id, link.concept_id) for link in links}
    assert ("sec:1", "concept:pace") in linked
    assert ("sec:2", "concept:pace") in linked


def test_acronym_aliases_require_exact_case(monkeypatch):
    _, links = _run_linker(monkeypatch, [
        # "pa" inside ordinary prose must not trigger Prior Authorization
        {
            "s.id": "sec:1",
            "s.title": "General",
            "s.content_text": "The pa system announced visiting hours.",
        },
        # Uppercase acronym as a whole word does trigger it
        {
            "s.id": "sec:2",
            "s.title": "Approval",
            "s.content_text": "A PA request must be submitted before services begin.",
        },
        # Acronym embedded in a longer word must not match
        {
            "s.id": "sec:3",
            "s.title": "General",
            "s.content_text": "DMERC and DMEPOS suppliers are out of scope here.",
        },
    ])

    linked = {(link.section_id, link.concept_id) for link in links}
    assert ("sec:1", "concept:prior-authorization") not in linked
    assert ("sec:2", "concept:prior-authorization") in linked
    assert ("sec:3", "concept:durable-medical-equipment") not in linked


def test_build_term_pattern_rules():
    # Acronyms compile to case-sensitive whole-word patterns
    pattern = linker._build_term_pattern("PACE")
    assert pattern.search("PACE enrollment") is not None
    assert pattern.search("keep pace with") is None
    assert pattern.search("PACEMAKER") is None

    # Mixed-case terms compile to case-insensitive whole-word patterns
    pattern = linker._build_term_pattern("Personal Care Services")
    assert pattern.search("personal care services are covered") is not None

    # Terms shorter than the safety thresholds are skipped
    assert linker._build_term_pattern("a") is None
    assert linker._build_term_pattern("at") is None  # lowercase, < MIN_ALIAS_LENGTH
    assert linker._build_term_pattern("PA") is not None  # acronym, allowed at 2
