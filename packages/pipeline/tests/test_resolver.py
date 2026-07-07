"""Tests for reference resolution and batched write planning."""

import json

from pipeline.references.extractor import ReferenceMatch
from pipeline.references import extractor, resolver
from tests.fakes import RecordingGraphWriter, RecordingSession, session_factory


def test_resolve_reference_uses_normalized_policy_number_fallback(monkeypatch):
    session = RecordingSession([
        (lambda query, params: "MATCH (d:Document {policy_number: $pn})" in query, []),
        (
            lambda query, params: "REPLACE(d.policy_number, '-', '') = $normalized" in query,
            [{"d.id": "doc:clinical:1H"}],
        ),
    ])

    monkeypatch.setattr(resolver, "get_session", session_factory(session))

    result = resolver.resolve_reference(
        ReferenceMatch(
            ref_type="cross_document",
            target_id="1-H",
            matched_text="Clinical Coverage Policy 1-H",
            start=0,
            end=27,
        ),
        source_document_id="doc:source",
    )

    assert result == {
        "resolved": True,
        "target_node_id": "doc:clinical:1H",
        "target_type": "document",
        "edge_type": "REFERENCES_DOCUMENT",
    }
    assert len(session.calls) == 2


def test_resolve_reference_resolves_spa_documents(monkeypatch):
    session = RecordingSession([
        (
            lambda query, params: "d.document_type = 'state_plan_amendment'" in query,
            [{"d.id": "doc:spa:24-0001"}],
        ),
    ])

    monkeypatch.setattr(resolver, "get_session", session_factory(session))

    result = resolver.resolve_reference(
        ReferenceMatch(
            ref_type="spa",
            target_id="24-0001",
            matched_text="SPA 24-0001",
            start=0,
            end=11,
        ),
        source_document_id="doc:source",
    )

    assert result == {
        "resolved": True,
        "target_node_id": "doc:spa:24-0001",
        "target_type": "document",
        "edge_type": "REFERENCES_DOCUMENT",
    }


def test_resolve_reference_uses_attachment_title_fallback(monkeypatch):
    session = RecordingSession([
        (
            lambda query, params: "section_number: $sn" in query and params.get("sn") == "Attachment I",
            [],
        ),
        (
            lambda query, params: "CONTAINS toLower($needle)" in query and params.get("needle") == "Attachment I",
            [{"s.id": "sec:attachment-i"}],
        ),
    ])

    monkeypatch.setattr(resolver, "get_session", session_factory(session))

    result = resolver.resolve_reference(
        ReferenceMatch(
            ref_type="attachment",
            target_id="I",
            matched_text="Attachment I",
            start=0,
            end=12,
        ),
        source_document_id="doc:source",
    )

    assert result == {
        "resolved": True,
        "target_node_id": "sec:attachment-i",
        "target_type": "section",
        "edge_type": "REFERENCES",
    }


def test_extract_and_resolve_all_batches_edges_through_graph_writer(monkeypatch, tmp_path):
    session = RecordingSession([
        (
            lambda query, params: "MATCH (s:Section) RETURN s.id, s.document_id, s.content_text" in query,
            [{"s.id": "sec:1", "s.document_id": "doc:1", "s.content_text": "Policy 8C"}],
        ),
    ])

    fake_writer = RecordingGraphWriter()
    monkeypatch.setattr(resolver, "get_session", session_factory(session))
    monkeypatch.setattr(resolver, "graph_writer", fake_writer)
    monkeypatch.setattr(extractor, "extract_references", lambda text: [
        ReferenceMatch(
            ref_type="cross_document",
            target_id="8C",
            matched_text="Policy 8C",
            start=0,
            end=9,
        )
    ])
    monkeypatch.setattr(
        resolver,
        "resolve_reference",
        lambda ref, source_document_id: {
            "resolved": True,
            "target_node_id": "doc:8c",
            "target_type": "document",
            "edge_type": "REFERENCES_DOCUMENT",
        },
    )
    monkeypatch.setattr(resolver, "PARSED_DATA_DIR", tmp_path / "parsed")

    stats = resolver.extract_and_resolve_all()

    assert stats == {"extracted": 1, "resolved": 1, "unresolved": 0}
    (edges,) = fake_writer.received("merge_reference_edges")
    assert len(edges) == 1
    assert edges[0].target_id == "doc:8c"
    unresolved_path = tmp_path / "unresolved-references.json"
    assert json.loads(unresolved_path.read_text()) == []


def test_extract_and_resolve_all_uses_cross_document_context_for_section_refs(monkeypatch, tmp_path):
    session = RecordingSession([
        (
            lambda query, params: "MATCH (s:Section) RETURN s.id, s.document_id, s.content_text" in query,
            [{
                "s.id": "sec:source",
                "s.document_id": "doc:source",
                "s.content_text": "See Clinical Coverage Policy 3K-2, Section 5.1 for details.",
            }],
        ),
        (
            lambda query, params: "MATCH (d:Document {policy_number: $pn})" in query and params.get("pn") == "3K-2",
            [{"d.id": "doc:clinical:3K-2"}],
        ),
        (
            lambda query, params: "section_number: $sn" in query
            and params.get("doc_id") == "doc:clinical:3K-2"
            and params.get("sn") == "5.1",
            [{"s.id": "sec:clinical:3K-2:5.1"}],
        ),
    ])

    fake_writer = RecordingGraphWriter()
    monkeypatch.setattr(resolver, "get_session", session_factory(session))
    monkeypatch.setattr(resolver, "graph_writer", fake_writer)
    monkeypatch.setattr(resolver, "PARSED_DATA_DIR", tmp_path / "parsed")

    stats = resolver.extract_and_resolve_all()

    assert stats == {"extracted": 2, "resolved": 2, "unresolved": 0}
    (edges,) = fake_writer.received("merge_reference_edges")
    assert [(edge.edge_type, edge.target_id) for edge in edges] == [
        ("REFERENCES_DOCUMENT", "doc:clinical:3K-2"),
        ("REFERENCES", "sec:clinical:3K-2:5.1"),
    ]


# ── CFR_SUPERSESSIONS data-file loader ─────────────────────────────────────


def test_cfr_supersessions_loaded_from_data_file():
    """Every entry in cfr-supersessions.json should round-trip through parse_cfr_citation."""
    assert resolver.CFR_SUPERSESSIONS, "CFR_SUPERSESSIONS loaded empty — check data file"
    # 45 CFR 74 and 75 are both superseded — they now point to 2 CFR Part 200
    # (HHS rescinded Part 75 in late 2025; OMB Uniform Guidance lives at 2 CFR 200).
    entry_74 = resolver.CFR_SUPERSESSIONS.get((45, 74))
    assert (entry_74.new_title, entry_74.new_part) == (2, 200)
    # Provenance now survives loading — the federal loader writes it to the
    # graph so the agent can narrate the supersession chain.
    assert entry_74.effective
    assert entry_74.reason
    assert (lambda e: (e.new_title, e.new_part))(resolver.CFR_SUPERSESSIONS.get((45, 75))) == (2, 200)

    # Every entry should correctly remap when given a citation to the old part.
    for (old_title, old_part), entry in resolver.CFR_SUPERSESSIONS.items():
        new_title, new_part = entry.new_title, entry.new_part
        parsed = resolver.parse_cfr_citation(f"{old_title} CFR {old_part}.101")
        assert parsed is not None, f"Failed to parse {old_title} CFR {old_part}.101"
        assert parsed["title"] == new_title
        assert parsed["part"] == new_part
        # Part-level redirect only — never fabricate cross-part section numbers.
        assert parsed["section"] == str(new_part)
        assert parsed["redirected_from"] == {
            "title": old_title,
            "section": f"{old_part}.101",
            "part": old_part,
        }


def test_parse_cfr_citation_non_superseded_passes_through():
    parsed = resolver.parse_cfr_citation("42 CFR 441.301")
    assert parsed == {"title": 42, "section": "441.301", "part": 441}


def test_parse_cfr_citation_returns_none_for_non_cfr_text():
    assert resolver.parse_cfr_citation("This sentence has no CFR citation.") is None
