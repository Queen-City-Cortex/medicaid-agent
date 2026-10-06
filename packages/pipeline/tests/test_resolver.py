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
    (edges,) = fake_writer.received("rebuild_reference_edges")
    assert len(edges) == 1
    assert edges[0].target_id == "doc:8c"
    unresolved_path = tmp_path / "unresolved-references.json"
    assert json.loads(unresolved_path.read_text()) == []


def test_extract_and_resolve_all_binds_section_after_policy_and_comma(monkeypatch, tmp_path):
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
    (edges,) = fake_writer.received("rebuild_reference_edges")
    assert [(edge.edge_type, edge.target_id) for edge in edges] == [
        ("REFERENCES_DOCUMENT", "doc:clinical:3K-2"),
        ("REFERENCES", "sec:clinical:3K-2:5.1"),
    ]


# ── Literal binding of section references (DATA-11) ────────────────────────

SECTIONS_QUERY = "MATCH (s:Section) RETURN s.id, s.document_id, s.content_text"


def _policy(policy_number: str, document_id: str):
    return (
        lambda query, params: "MATCH (d:Document {policy_number: $pn})" in query
        and params.get("pn") == policy_number,
        [{"d.id": document_id}],
    )


def _numbered_section(document_id: str, section_number: str, section_id: str):
    return (
        lambda query, params: "section_number: $sn" in query
        and params.get("doc_id") == document_id
        and params.get("sn") == section_number,
        [{"s.id": section_id}],
    )


def _resolve_section_text(monkeypatch, tmp_path, content: str, handlers: list):
    """Run the regex phase over one section of policy ``doc:source``."""
    session = RecordingSession([
        (
            lambda query, params: SECTIONS_QUERY in query,
            [{"s.id": "sec:source", "s.document_id": "doc:source", "s.content_text": content}],
        ),
        *handlers,
    ])
    fake_writer = RecordingGraphWriter()
    monkeypatch.setattr(resolver, "get_session", session_factory(session))
    monkeypatch.setattr(resolver, "graph_writer", fake_writer)
    monkeypatch.setattr(resolver, "PARSED_DATA_DIR", tmp_path / "parsed")

    resolver.extract_and_resolve_all()

    (edges,) = fake_writer.received("rebuild_reference_edges")
    unresolved = json.loads((tmp_path / "unresolved-references.json").read_text())
    return (
        [(edge.edge_type, edge.target_id) for edge in edges],
        [(item["ref_type"], item["target_id"]) for item in unresolved],
    )


def test_section_of_policy_connective_binds_to_the_named_policy(monkeypatch, tmp_path):
    edges, unresolved = _resolve_section_text(
        monkeypatch,
        tmp_path,
        "Providers shall follow Section 5.0 of clinical coverage policy 10A.",
        [
            _policy("10A", "doc:10A"),
            _numbered_section("doc:10A", "5.0", "sec:10A:5.0"),
            _numbered_section("doc:source", "5.0", "sec:source:5.0"),
        ],
    )

    assert edges == [
        ("REFERENCES_DOCUMENT", "doc:10A"),
        ("REFERENCES", "sec:10A:5.0"),
    ]
    assert unresolved == []


def test_bound_section_missing_from_named_policy_is_unresolved(monkeypatch, tmp_path):
    # The citing policy has its own 5.0, and policy 10A has a section whose
    # title merely contains "5.0"; neither may stand in for 10A's Section 5.0.
    edges, unresolved = _resolve_section_text(
        monkeypatch,
        tmp_path,
        "Providers shall follow Section 5.0 of clinical coverage policy 10A.",
        [
            _policy("10A", "doc:10A"),
            _numbered_section("doc:source", "5.0", "sec:source:5.0"),
            (
                lambda query, params: "CONTAINS toLower($needle)" in query
                and params.get("doc_id") == "doc:10A",
                [{"s.id": "sec:10A:15.5.0"}],
            ),
        ],
    )

    assert edges == [("REFERENCES_DOCUMENT", "doc:10A")]
    assert unresolved == [("section", "5.0")]


def test_section_bound_to_an_unknown_policy_is_unresolved(monkeypatch, tmp_path):
    edges, unresolved = _resolve_section_text(
        monkeypatch,
        tmp_path,
        "Refer to Section 5.0 of Clinical Coverage Policy 11A.",
        [_numbered_section("doc:source", "5.0", "sec:source:5.0")],
    )

    assert edges == []
    assert unresolved == [("cross_document", "11A"), ("section", "5.0")]


def test_revision_row_resolves_in_citing_policy_despite_other_policy_mention(monkeypatch, tmp_path):
    # Policy 1-I's revision table; policy 1-H is mentioned elsewhere in the section.
    edges, _ = _resolve_section_text(
        monkeypatch,
        tmp_path,
        "Refer to Clinical Coverage Policy 1-H for telehealth requirements.\n\n"
        "| 08/01/2017 | Subsection 3.2.2 | Added criteria for coverage |",
        [
            _policy("1-H", "doc:1-H"),
            _numbered_section("doc:1-H", "3.2.2", "sec:1-H:3.2.2"),
            _numbered_section("doc:source", "3.2.2", "sec:source:3.2.2"),
        ],
    )

    assert edges == [
        ("REFERENCES_DOCUMENT", "doc:1-H"),
        ("REFERENCES", "sec:source:3.2.2"),
    ]


def test_policy_named_later_in_the_sentence_does_not_bind_the_section(monkeypatch, tmp_path):
    edges, _ = _resolve_section_text(
        monkeypatch,
        tmp_path,
        "as described in Subsection 5.1, Prior Approval, and in clinical coverage policy 10A",
        [
            _policy("10A", "doc:10A"),
            _numbered_section("doc:10A", "5.1", "sec:10A:5.1"),
            _numbered_section("doc:source", "5.1", "sec:source:5.1"),
        ],
    )

    assert edges == [
        ("REFERENCES_DOCUMENT", "doc:10A"),
        ("REFERENCES", "sec:source:5.1"),
    ]


def test_adjacent_policy_without_connective_does_not_bind_the_section(monkeypatch, tmp_path):
    edges, unresolved = _resolve_section_text(
        monkeypatch,
        tmp_path,
        "State Plan, Section 6.2.1 NC Clinical Coverage Policy 2A-1",
        [
            _policy("2A-1", "doc:2A-1"),
            _numbered_section("doc:2A-1", "6.2.1", "sec:2A-1:6.2.1"),
        ],
    )

    assert edges == [("REFERENCES_DOCUMENT", "doc:2A-1")]
    assert unresolved == [("section", "6.2.1")]


def test_waiver_and_spa_citations_are_not_section_context(monkeypatch, tmp_path):
    edges, _ = _resolve_section_text(
        monkeypatch,
        tmp_path,
        "SPA 24-0001, Section 4.2 applies.",
        [
            (
                lambda query, params: "d.document_type = 'state_plan_amendment'" in query,
                [{"d.id": "doc:spa:24-0001"}],
            ),
            _numbered_section("doc:spa:24-0001", "4.2", "sec:spa:4.2"),
            _numbered_section("doc:source", "4.2", "sec:source:4.2"),
        ],
    )

    assert edges == [
        ("REFERENCES", "sec:source:4.2"),
        ("REFERENCES_DOCUMENT", "doc:spa:24-0001"),
    ]


# ── Family citations and 1915(x) authority (DATA-11) ───────────────────────


def test_family_citation_stays_unresolved_when_only_siblings_exist(monkeypatch):
    # Only 11A-10 and 11A-17 are loaded: no document has policy number "11A".
    siblings = {"11A-10": "doc:11A-10", "11A-17": "doc:11A-17"}
    session = RecordingSession([
        (
            lambda query, params: "{policy_number: $pn}" in query
            and params.get("pn") in siblings,
            [{"d.id": "doc:11A-10"}],
        ),
        (
            lambda query, params: "REPLACE(d.policy_number, '-', '') = $normalized" in query
            and params.get("normalized") in {"11A10", "11A17"},
            [{"d.id": "doc:11A-10"}],
        ),
        (
            lambda query, params: "STARTS WITH" in query,
            [{"d.id": "doc:11A-10"}],
        ),
    ])
    monkeypatch.setattr(resolver, "get_session", session_factory(session))

    result = resolver.resolve_reference(
        ReferenceMatch(
            ref_type="cross_document",
            target_id="11A",
            matched_text="Clinical Coverage Policy 11A",
            start=0,
            end=28,
        ),
        source_document_id="doc:source",
    )

    assert result["resolved"] is False
    assert not any("STARTS WITH" in query for query in session.queries)


def _ssa_title_19_session(section_numbers: set[str]):
    statute_id = resolver.federal_statute_doc_id(19)
    return statute_id, RecordingSession([
        (
            lambda query, params: "section_number: $sn" in query
            and params.get("doc_id") == statute_id
            and params.get("sn") in section_numbers,
            [{"s.id": f"sec:{statute_id}:1915-c"}],
        ),
        (
            # Four waiver documents carry policy_number "1915(c)".
            lambda query, params: "policy_number" in query,
            [{"d.id": "doc:waiver:innovations-2018"}],
        ),
    ])


def test_1915_citation_resolves_to_the_statute_subsection(monkeypatch):
    statute_id, session = _ssa_title_19_session({"1915(c)"})
    monkeypatch.setattr(resolver, "get_session", session_factory(session))

    for cited in ("1915(c)", "1915 (C)"):
        result = resolver.resolve_reference(
            ReferenceMatch(
                ref_type="waiver",
                target_id=cited,
                matched_text=cited,
                start=0,
                end=len(cited),
            ),
            source_document_id="doc:source",
        )

        assert result == {
            "resolved": True,
            "target_node_id": f"sec:{statute_id}:1915-c",
            "target_type": "section",
            "edge_type": "REFERENCES",
        }

    assert not any("policy_number" in query for query in session.queries)
    assert {params["sn"] for _, params in session.calls} == {"1915(c)"}


def test_1915_citation_falls_back_to_the_parent_statute_section(monkeypatch):
    statute_id, session = _ssa_title_19_session({"1915"})
    monkeypatch.setattr(resolver, "get_session", session_factory(session))

    result = resolver.resolve_reference(
        ReferenceMatch(
            ref_type="waiver",
            target_id="1915(i)",
            matched_text="1915(i)",
            start=0,
            end=7,
        ),
        source_document_id="doc:source",
    )

    assert result["resolved"] is True
    assert result["edge_type"] == "REFERENCES"
    assert [params["sn"] for _, params in session.calls] == ["1915(i)", "1915"]


def test_1915_mention_no_longer_links_a_section_to_a_waiver_document(monkeypatch, tmp_path):
    # CAP/DA policy 3K-2 operates under a different 1915(c) waiver than Innovations.
    statute_id = resolver.federal_statute_doc_id(19)
    edges, unresolved = _resolve_section_text(
        monkeypatch,
        tmp_path,
        "CAP/DA is authorized under a 1915(c) waiver. See Section 5.1.",
        [
            (
                lambda query, params: "section_number: $sn" in query
                and params.get("doc_id") == statute_id
                and params.get("sn") == "1915(c)",
                [{"s.id": f"sec:{statute_id}:1915-c"}],
            ),
            (
                lambda query, params: "policy_number" in query,
                [{"d.id": "doc:waiver:innovations-2018"}],
            ),
            _numbered_section("doc:waiver:innovations-2018", "5.1", "sec:waiver:5.1"),
            _numbered_section("doc:source", "5.1", "sec:source:5.1"),
        ],
    )

    assert edges == [
        ("REFERENCES", "sec:source:5.1"),
        ("REFERENCES", f"sec:{statute_id}:1915-c"),
    ]
    assert unresolved == []


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
