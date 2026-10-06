"""Test amendment detection: two-tier extraction and change_description."""

from pipeline.references import amendments
from tests.fakes import RecordingSession, session_factory


class FakeGraphWriter:
    def __init__(self):
        self.edges = []
        self.amendment_doc_ids = []
        self.revisions = None

    def merge_amendments(self, edges, amendment_doc_ids):
        self.edges = list(edges)
        self.amendment_doc_ids = list(amendment_doc_ids)
        return len(edges)

    def replace_policy_revisions(self, revisions):
        self.revisions = list(revisions)
        return len(revisions)


def _detect(monkeypatch, docs, sections, revision_sections=(), source_urls=()) -> FakeGraphWriter:
    """Run detect_amendments() against an in-memory doc/section corpus."""
    session = RecordingSession(handlers=[
        (lambda q, p: "RETURN d.id AS doc_id, d.title AS title" in q, docs),
        (lambda q, p: "RETURN d.id AS doc_id, s.title AS sec_title" in q, sections),
        (lambda q, p: "RETURN d.id AS doc_id, d.source_url AS source_url" in q, list(source_urls)),
        (lambda q, p: "CONTAINS 'revision information'" in q, list(revision_sections)),
    ])
    fake_writer = FakeGraphWriter()
    monkeypatch.setattr(amendments, "get_session", session_factory(session))
    monkeypatch.setattr(amendments, "graph_writer", fake_writer)
    amendments.detect_amendments()
    return fake_writer


# ── Tier 1: signal sections preferred ────────────────────────────────────────


def test_signal_sections_preferred_over_background(monkeypatch):
    """MA-number in BACKGROUND is ignored when CONTENT OF CHANGE section exists."""
    docs = [
        {"doc_id": "doc:cn", "title": "CHANGE NOTICE FOR MANUAL NO. 02-11, LTC", "doc_type": "dhhs_policy", "policy_number": None},
        {"doc_id": "doc:target-a", "title": "MA-2230", "doc_type": "dhhs_policy", "policy_number": "MA-2230"},
        {"doc_id": "doc:target-b", "title": "MA-2180", "doc_type": "dhhs_policy", "policy_number": "MA-2180"},
    ]
    sections = [
        {
            "doc_id": "doc:cn",
            "sec_title": "I. BACKGROUND",
            "content": "This relates to MA-2180 resource limits.",
            "is_signal": False,
        },
        {
            "doc_id": "doc:cn",
            "sec_title": "V. CONTENT OF CHANGE",
            "content": "MA-2230, Financial Resources, is revised to include new limits.",
            "is_signal": True,
        },
    ]
    fake_writer = _detect(monkeypatch, docs, sections)

    # Should create edge to MA-2230 (in signal section) but NOT MA-2180 (only in background)
    target_ids = {edge.target_id for edge in fake_writer.edges}
    assert "doc:target-a" in target_ids
    assert "doc:target-b" not in target_ids


def test_policy_update_heading_is_signal(monkeypatch):
    """Newer COLA notices use 'POLICY UPDATE' instead of 'CONTENT OF CHANGE'."""
    docs = [
        {"doc_id": "doc:cn", "title": "CHANGE NOTICE FOR MANUAL NO. 07-25, COLA", "doc_type": "dhhs_policy", "policy_number": None},
        {"doc_id": "doc:target", "title": "MA-3315", "doc_type": "dhhs_policy", "policy_number": "MA-3315"},
    ]
    sections = [
        {
            "doc_id": "doc:cn",
            "sec_title": "II. POLICY UPDATE",
            "content": "MA-3315 IV.C., Medicaid Deductible policy has been updated.",
            "is_signal": True,
        },
    ]
    fake_writer = _detect(monkeypatch, docs, sections)

    assert fake_writer.edges[0].target_id == "doc:target"


def test_ma_number_in_section_title_is_signal(monkeypatch):
    """Section titles like 'A. MA-3550.VIII, Determining Need...' are signal."""
    docs = [
        {"doc_id": "doc:cn", "title": "CHANGE NOTICE FOR MANUAL NO. 04-22, NEMT", "doc_type": "dhhs_policy", "policy_number": None},
        {"doc_id": "doc:target", "title": "MA-3550", "doc_type": "dhhs_policy", "policy_number": "MA-3550"},
    ]
    sections = [
        {
            "doc_id": "doc:cn",
            "sec_title": "A. MA-3550.VIII, Determining Need for Transportation",
            "content": "This section has been reorganized.",
            "is_signal": True,
        },
    ]
    fake_writer = _detect(monkeypatch, docs, sections)

    assert fake_writer.edges[0].target_id == "doc:target"


# ── Tier 2: fallback to all body text ────────────────────────────────────────


def test_fallback_to_all_text_when_no_signal_sections(monkeypatch):
    """When no signal sections exist, extract from all body text (no regression)."""
    docs = [
        {"doc_id": "doc:cn", "title": "CHANGE NOTICE FOR MANUAL NO. 05-20, Tribal", "doc_type": "dhhs_policy", "policy_number": None},
        {"doc_id": "doc:target", "title": "MA-2504", "doc_type": "dhhs_policy", "policy_number": "MA-2504"},
    ]
    sections = [
        {
            "doc_id": "doc:cn",
            "sec_title": "I. BACKGROUND",
            "content": "MA-2504 alien requirements have changed.",
            "is_signal": False,
        },
    ]
    fake_writer = _detect(monkeypatch, docs, sections)

    assert fake_writer.edges[0].target_id == "doc:target"


# ── change_description ────────────────────────────────────────────────────────


def test_change_description_stored_on_edge(monkeypatch):
    """Each AMENDS edge includes the relevant excerpt as change_description."""
    docs = [
        {"doc_id": "doc:cn", "title": "CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III", "doc_type": "dhhs_policy", "policy_number": None},
        {"doc_id": "doc:target", "title": "MA-2180", "doc_type": "dhhs_policy", "policy_number": "MA-2180"},
    ]
    sections = [
        {
            "doc_id": "doc:cn",
            "sec_title": "V. CONTENT OF CHANGE",
            "content": "MA-2180, HCWD, is revised to remove the 150% FPL earned income cap.",
            "is_signal": True,
        },
    ]
    fake_writer = _detect(monkeypatch, docs, sections)

    assert "MA-2180" in fake_writer.edges[0].change_description
    assert "earned income cap" in fake_writer.edges[0].change_description


def test_change_description_concatenates_multiple_excerpts(monkeypatch):
    """Multi-part amendments: both CONTENT OF CHANGE and MAINTENANCE excerpts are kept."""
    docs = [
        {"doc_id": "doc:cn", "title": "CHANGE NOTICE FOR MANUAL NO. 02-11, LTC", "doc_type": "dhhs_policy", "policy_number": None},
        {"doc_id": "doc:target", "title": "MA-2230", "doc_type": "dhhs_policy", "policy_number": "MA-2230"},
    ]
    sections = [
        {
            "doc_id": "doc:cn",
            "sec_title": "V. CONTENT OF CHANGE",
            "content": "MA-2230, Financial Resources, is revised to include new limits.",
            "is_signal": True,
        },
        {
            "doc_id": "doc:cn",
            "sec_title": "MAINTENANCE OF MANUAL",
            "content": "Remove: MA-2230, Financial Resources, pages 1-8",
            "is_signal": True,
        },
    ]
    fake_writer = _detect(monkeypatch, docs, sections)

    desc = fake_writer.edges[0].change_description
    assert "is revised" in desc
    assert "Remove:" in desc


def test_title_only_match_uses_title_as_description(monkeypatch):
    """When MA-number is only in the title, change_description = title."""
    docs = [
        {"doc_id": "doc:cn", "title": "CHANGE NOTICE FOR MANUAL NO. 03-18, MA-2180 Premiums", "doc_type": "dhhs_policy", "policy_number": None},
        {"doc_id": "doc:target", "title": "MA-2180", "doc_type": "dhhs_policy", "policy_number": "MA-2180"},
    ]
    sections = []  # No sections at all
    fake_writer = _detect(monkeypatch, docs, sections)

    assert fake_writer.edges[0].change_description == "CHANGE NOTICE FOR MANUAL NO. 03-18, MA-2180 Premiums"


# ── Phase 5.4: Clinical-policy revision-table extraction ───────────────────


def test_parse_revision_rows_handles_the_8c_table_format():
    from pipeline.references.amendments import _parse_revision_rows

    content = """\
| Date       | Section Revised    | Change                       |
|:-----------|:-------------------|:-----------------------------|
| 05/01/2005 | Section 6.0        | Nurse practitioner changes.  |
| 09/01/2005 | Section 2.0        | EPSDT special provision.     |
| 06/01/2007 | Subsection 8.3     | Changed mental health codes. |
| 06/01/2007 | Section 6.0        | Updated Licensed Clinical.   |
"""
    rows = _parse_revision_rows(content)
    assert len(rows) == 4
    assert rows[0] == {
        "effective_date": "2005-05-01",
        "section_revised": "Section 6.0",
        "change_summary": "Nurse practitioner changes.",
    }
    # Same-date rows are kept here; the caller collapses them into one revision.
    assert rows[2]["effective_date"] == "2007-06-01"
    assert rows[3]["effective_date"] == "2007-06-01"


def test_parse_revision_rows_skips_header_and_separator():
    from pipeline.references.amendments import _parse_revision_rows

    content = """\
| Date | Section Revised | Change |
|:---|:---|:---|
| 01/15/2020 | 2.1 | First real row. |
"""
    rows = _parse_revision_rows(content)
    assert len(rows) == 1
    assert rows[0]["effective_date"] == "2020-01-15"


def test_parse_revision_rows_skips_malformed_dates():
    from pipeline.references.amendments import _parse_revision_rows

    content = """\
| 2020-01-15 | bad ISO | row |
| not a date | also bad | row |
| 03/15/2021 | good | row |
"""
    rows = _parse_revision_rows(content)
    assert len(rows) == 1
    assert rows[0]["effective_date"] == "2021-03-15"


_REVISION_TABLE = """\
| Date       | Section Revised    | Change                       |
|:-----------|:-------------------|:-----------------------------|
| 05/01/2005 | Section 6.0        | Nurse practitioner changes.  |
| 06/01/2007 | Subsection 8.3     | Changed mental health codes. |
| 06/01/2007 | Section 6.0        | Updated Licensed Clinical.   |
"""

_CLINICAL_DOC = {"doc_id": "doc:clinical_policy:8c", "title": "8C Outpatient Behavioral Health", "doc_type": "clinical_policy", "policy_number": "8C"}


def test_same_date_revision_rows_collapse_into_one_revision(monkeypatch):
    fake_writer = _detect(
        monkeypatch,
        [_CLINICAL_DOC],
        [],
        # The table appears in two revision sections; repeated rows count once.
        revision_sections=[
            {"doc_id": "doc:clinical_policy:8c", "sec_id": "sec:a", "title": "Revision Information:", "content": _REVISION_TABLE},
            {"doc_id": "doc:clinical_policy:8c", "sec_id": "sec:b", "title": "Revision Information:", "content": _REVISION_TABLE},
        ],
        source_urls=[{"doc_id": "doc:clinical_policy:8c", "source_url": "https://example.org/8C.pdf"}],
    )

    assert [revision.id for revision in fake_writer.revisions] == [
        "doc:change_notice:8C:2005-05-01",
        "doc:change_notice:8C:2007-06-01",
    ]
    single, collapsed = fake_writer.revisions
    assert single.title == "Policy 8C Revision — 2005-05-01 (Section 6.0)"
    assert single.change_description == "Section 6.0: Nurse practitioner changes."
    assert collapsed.title == "Policy 8C Revision — 2007-06-01 (2 changes)"
    assert collapsed.change_description == (
        "Subsection 8.3: Changed mental health codes.\n"
        "Section 6.0: Updated Licensed Clinical."
    )
    assert collapsed.effective_date == "2007-06-01"
    assert collapsed.base_document_id == "doc:clinical_policy:8c"
    assert collapsed.source_url == "https://example.org/8C.pdf"
    # Revisions are not documents: nothing asks the Document status or
    # AMENDS writers to match them.
    assert fake_writer.edges == []
    assert fake_writer.amendment_doc_ids == []


def test_revisions_are_replaced_even_when_no_table_parses(monkeypatch):
    """An empty list still reaches the writer, which deletes stale revisions."""
    fake_writer = _detect(monkeypatch, [_CLINICAL_DOC], [])
    assert fake_writer.revisions == []

    fake_writer = _detect(monkeypatch, [], [])
    assert fake_writer.revisions == []


def test_two_documents_with_one_policy_number_share_one_revision_per_date(monkeypatch):
    twin = {**_CLINICAL_DOC, "doc_id": "doc:clinical_policy:8c-older"}
    fake_writer = _detect(
        monkeypatch,
        [twin, _CLINICAL_DOC],
        [],
        revision_sections=[
            {"doc_id": twin["doc_id"], "sec_id": "sec:t", "title": "Revision Information:", "content": _REVISION_TABLE},
            {"doc_id": _CLINICAL_DOC["doc_id"], "sec_id": "sec:a", "title": "Revision Information:", "content": _REVISION_TABLE},
        ],
    )

    assert len(fake_writer.revisions) == 2
    # The lower document id owns the ids on every run.
    assert {revision.base_document_id for revision in fake_writer.revisions} == {"doc:clinical_policy:8c"}
