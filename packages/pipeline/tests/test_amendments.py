"""Test amendment detection: two-tier extraction and change_description."""

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
            return FakeResult(self._docs)
        if "RETURN d.id AS doc_id, s.title AS sec_title" in query:
            return FakeResult(self._sections)
        self.writes.append((query, params))
        return FakeResult()


def _make_session(docs, sections):
    session = FakeSession()
    session._docs = docs
    session._sections = sections
    return session


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
    session = _make_session(docs, sections)

    @contextmanager
    def fake_get_session():
        yield session

    monkeypatch.setattr(amendments, "get_session", fake_get_session)
    stats = amendments.detect_amendments()

    # Should create edge to MA-2230 (in signal section) but NOT MA-2180 (only in background)
    merge_writes = [p for _, p in session.writes if "pairs" in p]
    assert len(merge_writes) == 1
    pairs = merge_writes[0]["pairs"]
    target_ids = {p["target_id"] for p in pairs}
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
    session = _make_session(docs, sections)

    @contextmanager
    def fake_get_session():
        yield session

    monkeypatch.setattr(amendments, "get_session", fake_get_session)
    stats = amendments.detect_amendments()

    merge_writes = [p for _, p in session.writes if "pairs" in p]
    assert len(merge_writes) == 1
    pairs = merge_writes[0]["pairs"]
    assert pairs[0]["target_id"] == "doc:target"


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
    session = _make_session(docs, sections)

    @contextmanager
    def fake_get_session():
        yield session

    monkeypatch.setattr(amendments, "get_session", fake_get_session)
    stats = amendments.detect_amendments()

    merge_writes = [p for _, p in session.writes if "pairs" in p]
    assert len(merge_writes) == 1
    pairs = merge_writes[0]["pairs"]
    assert pairs[0]["target_id"] == "doc:target"


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
    session = _make_session(docs, sections)

    @contextmanager
    def fake_get_session():
        yield session

    monkeypatch.setattr(amendments, "get_session", fake_get_session)
    stats = amendments.detect_amendments()

    merge_writes = [p for _, p in session.writes if "pairs" in p]
    assert len(merge_writes) == 1
    pairs = merge_writes[0]["pairs"]
    assert pairs[0]["target_id"] == "doc:target"


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
    session = _make_session(docs, sections)

    @contextmanager
    def fake_get_session():
        yield session

    monkeypatch.setattr(amendments, "get_session", fake_get_session)
    amendments.detect_amendments()

    merge_writes = [p for _, p in session.writes if "pairs" in p]
    pairs = merge_writes[0]["pairs"]
    assert "change_description" in pairs[0]
    assert "MA-2180" in pairs[0]["change_description"]
    assert "earned income cap" in pairs[0]["change_description"]


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
    session = _make_session(docs, sections)

    @contextmanager
    def fake_get_session():
        yield session

    monkeypatch.setattr(amendments, "get_session", fake_get_session)
    amendments.detect_amendments()

    merge_writes = [p for _, p in session.writes if "pairs" in p]
    pairs = merge_writes[0]["pairs"]
    desc = pairs[0]["change_description"]
    assert "is revised" in desc
    assert "Remove:" in desc


def test_title_only_match_uses_title_as_description(monkeypatch):
    """When MA-number is only in the title, change_description = title."""
    docs = [
        {"doc_id": "doc:cn", "title": "CHANGE NOTICE FOR MANUAL NO. 03-18, MA-2180 Premiums", "doc_type": "dhhs_policy", "policy_number": None},
        {"doc_id": "doc:target", "title": "MA-2180", "doc_type": "dhhs_policy", "policy_number": "MA-2180"},
    ]
    sections = []  # No sections at all
    session = _make_session(docs, sections)

    @contextmanager
    def fake_get_session():
        yield session

    monkeypatch.setattr(amendments, "get_session", fake_get_session)
    amendments.detect_amendments()

    merge_writes = [p for _, p in session.writes if "pairs" in p]
    pairs = merge_writes[0]["pairs"]
    assert pairs[0]["change_description"] == "CHANGE NOTICE FOR MANUAL NO. 03-18, MA-2180 Premiums"
