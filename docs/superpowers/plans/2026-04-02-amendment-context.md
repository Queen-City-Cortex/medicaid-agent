# Amendment Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix agent confusion when checking amendments by storing per-target change descriptions on AMENDS edges and simplifying the getAmendments tool to use them.

**Architecture:** Two-tier extraction in the Python pipeline prefers structured "CONTENT OF CHANGE" / "POLICY UPDATE" sections, falls back to full body text. Each AMENDS edge gets a `change_description` property with the relevant excerpt. The TypeScript agent tool reads this property via depth-1 Cypher instead of scanning section text at runtime. System prompt replaces brittle routing rules with taxonomy context.

**Tech Stack:** Python 3.11+ (pipeline), TypeScript (agent), Neo4j (graph), pytest, vitest

**Spec:** `docs/superpowers/specs/2026-04-02-amendment-context-design.md`

---

### Task 1: Pipeline — two-tier section extraction and change_description

**Files:**
- Modify: `packages/pipeline/src/pipeline/references/amendments.py`
- Modify: `packages/pipeline/src/pipeline/graph/queries.py:175-180`
- Test: `packages/pipeline/tests/test_amendments.py`

- [ ] **Step 1: Write failing tests for two-tier extraction and change_description**

In `packages/pipeline/tests/test_amendments.py`, replace the entire file:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/pipeline && python -m pytest tests/test_amendments.py -v`
Expected: FAIL — the new tests expect a `_sections` attribute and new query shape that don't exist yet.

- [ ] **Step 3: Update the Cypher query in queries.py**

In `packages/pipeline/src/pipeline/graph/queries.py`, replace `MERGE_AMENDS_BATCH`:

```python
MERGE_AMENDS_BATCH = """
UNWIND $pairs AS pair
MATCH (src:Document {id: pair.source_id})
MATCH (tgt:Document {id: pair.target_id})
MERGE (src)-[r:AMENDS]->(tgt)
SET r.change_description = pair.change_description
"""
```

- [ ] **Step 4: Rewrite detect_amendments() in amendments.py**

Replace the entire `detect_amendments` function and add `_extract_context` and `_is_signal_section` helpers. The full file becomes:

```python
"""Detect amendment relationships between documents and create AMENDS edges."""

import re

from rich.console import Console

from pipeline.config import GRAPH_BATCH_SIZE
from pipeline.graph.connection import get_session
from pipeline.graph import queries
from pipeline.utils.batching import chunked

console = Console()

# Pattern for DHHS change notice titles: "CHANGE NOTICE FOR MANUAL NO. 01-14, ..."
_CHANGE_NOTICE_RE = re.compile(
    r"CHANGE\s+NOTICE\s+FOR\s+MANUAL\s+NO\.\s*([\w\-]+)",
    re.IGNORECASE,
)

# MA-series policy number anywhere in text: MA-2180, DMA-5097, DHB-5097, DSS-8110
_MA_SERIES_RE = re.compile(r"((?:MA|DMA|DHB|DSS)-\d+)", re.IGNORECASE)

# Pattern for "REVISED" SPA titles — capture multi-part SPA numbers
# e.g. "NC SPA 12-001 REVISED", "REVISED - SPA 14 047"
_REVISED_SPA_RE = re.compile(
    r"SPA\s+(\d+[\s\-]+\d+)",
    re.IGNORECASE,
)

# Signal section patterns — these sections describe what a change notice amends
_SIGNAL_PATTERNS = [
    "content of change",
    "policy update",
    "maintenance of manual",
]


def _normalize_spa_number(num: str) -> str:
    """Normalize SPA number: '14 047' -> '14-047'."""
    return re.sub(r'\s+', '-', num.strip())


def _is_change_notice(title: str) -> bool:
    return bool(_CHANGE_NOTICE_RE.search(title))


def _is_revised_spa(title: str) -> bool:
    return bool(re.search(r"\bREVISED\b", title, re.IGNORECASE)) and bool(
        _REVISED_SPA_RE.search(title)
    )


def _parse_spa_number(title: str) -> str | None:
    m = _REVISED_SPA_RE.search(title)
    if m:
        return m.group(1).strip()
    return None


def _extract_ma_numbers_from_text(text: str) -> set[str]:
    """Extract all unique MA-series policy numbers from text, uppercased."""
    return {m.upper() for m in _MA_SERIES_RE.findall(text)}


def _is_signal_section(sec_title: str, content: str) -> bool:
    """Return True if a section is a signal section (describes amendments).

    Signal sections are identified by:
    1. Title or body containing CONTENT OF CHANGE, POLICY UPDATE, or MAINTENANCE OF MANUAL
    2. Title containing an MA-series number (e.g., "A. MA-3550.VIII, Determining Need...")
    """
    title_lower = sec_title.lower()
    content_lower = content.lower() if content else ""
    for pattern in _SIGNAL_PATTERNS:
        if pattern in title_lower or pattern in content_lower:
            return True
    # Section title contains an MA-number (per-policy subsections)
    if _MA_SERIES_RE.search(sec_title):
        return True
    return False


def _extract_context(text: str, ma_number: str, max_chars: int = 300) -> str:
    """Extract the sentence/paragraph around an MA-number mention.

    Grabs from the previous period/newline to the next, capped at max_chars.
    """
    pattern = re.compile(re.escape(ma_number), re.IGNORECASE)
    m = pattern.search(text)
    if not m:
        return ""

    # Find sentence boundaries
    start = m.start()
    end = m.end()

    # Walk backward to sentence start
    sent_start = start
    for i in range(start - 1, max(start - max_chars, -1), -1):
        if i < 0:
            sent_start = 0
            break
        if text[i] in '.\n':
            sent_start = i + 1
            break
    else:
        sent_start = max(start - max_chars, 0)

    # Walk forward to sentence end
    sent_end = end
    for i in range(end, min(end + max_chars, len(text))):
        if text[i] in '.\n':
            sent_end = i + 1
            break
    else:
        sent_end = min(end + max_chars, len(text))

    return text[sent_start:sent_end].strip()


def detect_amendments() -> dict:
    """Detect amendment/change-notice relationships and write AMENDS edges.

    Uses a two-tier approach for change notices:
    - Tier 1: Extract MA-numbers from signal sections (CONTENT OF CHANGE,
      POLICY UPDATE, MAINTENANCE OF MANUAL, MA-number titled sections)
    - Tier 2: Fall back to all section text when no signal sections exist

    Each AMENDS edge stores a change_description with the relevant excerpt.
    """
    stats = {"change_notices": 0, "revised_spas": 0, "edges_created": 0}

    with get_session() as session:
        result = session.run(
            "MATCH (d:Document) "
            "RETURN d.id AS doc_id, d.title AS title, d.document_type AS doc_type, "
            "       d.policy_number AS policy_number"
        )
        all_docs = [
            {
                "doc_id": r["doc_id"],
                "title": r["title"] or "",
                "doc_type": r["doc_type"] or "",
                "policy_number": r["policy_number"],
            }
            for r in result
        ]

    console.print(f"Scanning {len(all_docs)} documents for amendment patterns...")

    # Build policy_number → doc_id lookup for MA-series matching
    pn_to_docs: dict[str, list[str]] = {}
    for d in all_docs:
        pn = d["policy_number"]
        if pn:
            pn_to_docs.setdefault(pn.upper(), []).append(d["doc_id"])

    # Build title index for SPA matching
    title_index: list[tuple[str, str, str]] = [
        (d["title"].lower(), d["doc_id"], d["doc_type"]) for d in all_docs
    ]

    # (source_id, target_id) -> list of excerpts
    edge_descriptions: dict[tuple[str, str], list[str]] = {}
    change_notice_ids: list[str] = []
    revised_spa_ids: list[str] = []

    # Fetch section titles + content for change notices (two-tier needs both)
    change_notice_candidates = [
        doc["doc_id"]
        for doc in all_docs
        if _is_change_notice(doc["title"])
    ]
    # doc_id -> list of (sec_title, content, is_signal)
    change_notice_sections: dict[str, list[tuple[str, str, bool]]] = {}
    if change_notice_candidates:
        with get_session() as session:
            sec_result = session.run(
                """
                MATCH (d:Document)-[:HAS_SECTION]->(s:Section)
                WHERE d.id IN $doc_ids
                  AND s.content_text IS NOT NULL
                RETURN d.id AS doc_id, s.title AS sec_title, s.content_text AS content
                """,
                {"doc_ids": change_notice_candidates},
            )
            for rec in sec_result:
                doc_id = rec["doc_id"]
                sec_title = rec["sec_title"] or ""
                content = rec["content"] or ""
                is_signal = _is_signal_section(sec_title, content)
                change_notice_sections.setdefault(doc_id, []).append(
                    (sec_title, content, is_signal)
                )

    # Build a lookup of doc titles for title-based descriptions
    doc_titles: dict[str, str] = {d["doc_id"]: d["title"] for d in all_docs}

    for doc in all_docs:
        title = doc["title"]
        doc_id = doc["doc_id"]

        # --- DHHS Change Notices ---
        if _is_change_notice(title):
            stats["change_notices"] += 1
            change_notice_ids.append(doc_id)

            # Title-based extraction (always unconditional)
            title_ma_numbers = _extract_ma_numbers_from_text(title)
            for ma_num in title_ma_numbers:
                for target_id in pn_to_docs.get(ma_num, []):
                    if target_id != doc_id:
                        key = (doc_id, target_id)
                        edge_descriptions.setdefault(key, [])
                        # Title match: use the full CN title as description
                        # (only if no body excerpt is added later)

            # Body-based extraction with two-tier logic
            all_sections = change_notice_sections.get(doc_id, [])
            signal_sections = [(t, c) for t, c, s in all_sections if s]
            fallback_sections = [(t, c) for t, c, _ in all_sections]

            # Tier 1: use signal sections if any exist
            # Tier 2: fall back to all sections
            sections_to_scan = signal_sections if signal_sections else fallback_sections

            for _sec_title, content in sections_to_scan:
                body_ma_numbers = _extract_ma_numbers_from_text(content)
                for ma_num in body_ma_numbers:
                    for target_id in pn_to_docs.get(ma_num, []):
                        if target_id != doc_id:
                            key = (doc_id, target_id)
                            excerpt = _extract_context(content, ma_num)
                            if excerpt:
                                edge_descriptions.setdefault(key, []).append(excerpt)

            # For title-only matches with no body excerpts, use the CN title
            for ma_num in title_ma_numbers:
                for target_id in pn_to_docs.get(ma_num, []):
                    if target_id != doc_id:
                        key = (doc_id, target_id)
                        if not edge_descriptions.get(key):
                            edge_descriptions[key] = [title]

        # --- Revised SPAs ---
        elif _is_revised_spa(title):
            spa_num = _parse_spa_number(title)
            if not spa_num:
                continue
            stats["revised_spas"] += 1
            revised_spa_ids.append(doc_id)
            spa_num_normalized = _normalize_spa_number(spa_num)
            spa_lower = spa_num_normalized.lower()
            for target_title_lower, target_id, target_type in title_index:
                if target_id == doc_id:
                    continue
                if target_type != "state_plan_amendment":
                    continue
                if spa_lower in target_title_lower and "revised" not in target_title_lower:
                    key = (doc_id, target_id)
                    edge_descriptions.setdefault(key, []).append(title)

    edges_to_create = sorted(edge_descriptions.keys())

    console.print(
        f"  Found {stats['change_notices']} change notices, "
        f"{stats['revised_spas']} revised SPAs — "
        f"{len(edges_to_create)} AMENDS edges to create"
    )

    # Write edges with change_description
    with get_session() as session:
        pairs_with_desc = [
            {
                "source_id": src,
                "target_id": tgt,
                "change_description": "\n".join(
                    dict.fromkeys(edge_descriptions[(src, tgt)])  # dedupe preserving order
                ),
            }
            for src, tgt in edges_to_create
        ]
        for batch in chunked(pairs_with_desc, GRAPH_BATCH_SIZE):
            session.run(queries.MERGE_AMENDS_BATCH, {"pairs": batch})
        stats["edges_created"] = len(edges_to_create)

        # Mark change notice documents as status='amendment'
        amendment_doc_ids = sorted(set(change_notice_ids + revised_spa_ids))
        for batch in chunked(amendment_doc_ids, GRAPH_BATCH_SIZE):
            session.run(
                queries.SET_DOCUMENT_STATUS_BATCH,
                {"doc_ids": batch, "status": "amendment"},
            )

    return stats
```

- [ ] **Step 5: Update FakeSession to match new query shape**

The tests use `FakeSession` which needs to handle the new query that returns `sec_title` and `content` per section instead of `collect(s.content_text) AS texts`. Update the `run` method routing in the test file's `FakeSession`:

```python
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
```

(This is already in the test file from Step 1 — just confirming the routing logic.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/pipeline && python -m pytest tests/test_amendments.py -v`
Expected: All 7 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/pipeline/src/pipeline/references/amendments.py packages/pipeline/src/pipeline/graph/queries.py packages/pipeline/tests/test_amendments.py
git commit -m "feat(pipeline): two-tier amendment extraction with change_description on edges

Signal sections (CONTENT OF CHANGE, POLICY UPDATE, MAINTENANCE OF MANUAL,
MA-number titles) are preferred for body extraction. Falls back to all
body text when no signal sections exist. Each AMENDS edge now stores a
change_description property with the relevant excerpt."
```

---

### Task 2: Agent tool — simplify getAmendments to depth-1

**Files:**
- Modify: `packages/agent/src/tools/navigate.ts:64-154`
- Test: `packages/agent/tests/tools/navigate.test.ts`

- [ ] **Step 1: Update navigate.test.ts mock data**

In `packages/agent/tests/tools/navigate.test.ts`, the `getAmendments` tests mock `firstSectionText` from the section query. Change them to mock `changeDescription` from the relationship. Replace the `getAmendments` describe block (lines 96-241):

```typescript
// ── getAmendments ────────────────────────────────────────────────────────────

describe('getAmendments', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns amendments and base document', async () => {
    setupSession([
      {
        // Current document metadata
        records: [
          mockRecord({
            id: 'doc-1',
            title: 'Current Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2025-01-01',
            url: 'https://example.com/8C',
            status: 'current',
          }),
        ],
      },
      {
        // Amendments (direct AMENDS edges with change_description)
        records: [
          mockRecord({
            id: 'amend-2',
            title: 'Change Notice 2025-03',
            documentType: 'change_notice',
            policyNumber: '8C-CN-03',
            effectiveDate: '2025-08-01',
            url: 'https://example.com/cn-03',
            status: 'amendment',
            changeDescription: 'This change notice supersedes the prior revision.',
          }),
          mockRecord({
            id: 'amend-1',
            title: 'Change Notice 2025-01',
            documentType: 'change_notice',
            policyNumber: '8C-CN-01',
            effectiveDate: '2025-06-01',
            url: 'https://example.com/cn-01',
            status: 'amendment',
            changeDescription: 'MA-2180 is revised in the following way...',
          }),
        ],
      },
      {
        // Base document (direct AMENDS in reverse)
        records: [
          mockRecord({
            id: 'doc-base',
            title: 'Original Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2024-01-01',
            url: 'https://example.com/8C',
            status: 'current',
          }),
        ],
      },
    ]);

    const result = await getAmendments.execute({ documentId: 'doc-1' }, {});

    expect(result.amendments).toHaveLength(2);
    expect(result.amendments[0]).toEqual({
      id: 'amend-2',
      title: 'Change Notice 2025-03',
      documentType: 'change_notice',
      policyNumber: '8C-CN-03',
      effectiveDate: '2025-08-01',
      url: 'https://example.com/cn-03',
      status: 'amendment',
      changeSummary: 'This change notice supersedes the prior revision.',
    });
    expect(result.amendments[1]).toEqual({
      id: 'amend-1',
      title: 'Change Notice 2025-01',
      documentType: 'change_notice',
      policyNumber: '8C-CN-01',
      effectiveDate: '2025-06-01',
      url: 'https://example.com/cn-01',
      status: 'amendment',
      changeSummary: 'MA-2180 is revised in the following way...',
    });
    expect(result.baseDocument).toEqual({
      id: 'doc-base',
      title: 'Original Policy 8C',
      documentType: 'dhhs_policy',
      policyNumber: '8C',
      effectiveDate: '2024-01-01',
      url: 'https://example.com/8C',
      status: 'current',
    });
    expect(result.authoritativeDocument).toEqual({
      id: 'amend-2',
      title: 'Change Notice 2025-03',
      documentType: 'change_notice',
      policyNumber: '8C-CN-03',
      effectiveDate: '2025-08-01',
      url: 'https://example.com/cn-03',
      status: 'amendment',
    });
  });

  it('returns null baseDocument when none exists', async () => {
    setupSession([
      {
        records: [
          mockRecord({
            id: 'doc-1',
            title: 'Current Policy',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2025-01-01',
            url: 'https://example.com/8C',
            status: 'current',
          }),
        ],
      },
      {
        records: [
          mockRecord({
            id: 'amend-1',
            title: 'Change Notice',
            documentType: 'change_notice',
            policyNumber: '8C-CN',
            effectiveDate: '2025-01-01',
            url: null,
            status: 'amendment',
            changeDescription: 'A short summary.',
          }),
        ],
      },
      { records: [] }, // No base document
    ]);

    const result = await getAmendments.execute({ documentId: 'doc-1' }, {});

    expect(result.amendments).toHaveLength(1);
    expect(result.amendments[0].changeSummary).toBe('A short summary.');
    expect(result.baseDocument).toBeNull();
    expect(result.authoritativeDocument?.id).toBe('amend-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/agent && npx vitest run tests/tools/navigate.test.ts`
Expected: FAIL — the implementation still reads `firstSectionText`.

- [ ] **Step 3: Rewrite getAmendments in navigate.ts**

Replace lines 64-154 of `packages/agent/src/tools/navigate.ts`:

```typescript
// ─── getAmendments ─────────────────────────────────────────────────────────────

export const getAmendments = createTool({
  id: 'get-amendments',
  description:
    'Find all change notices that directly amend a given document. ' +
    'Returns each amendment with a changeSummary describing what was changed, ' +
    'the base document this one amends, and the authoritative document to cite now.',
  inputSchema: z.object({
    documentId: z.string().describe('The document ID to look up amendments for'),
  }),
  outputSchema: z.object({
    amendments: z.array(
      DocumentMetadataSchema.extend({
        changeSummary: z.string().nullable(),
      }),
    ),
    baseDocument: DocumentMetadataSchema.nullable(),
    authoritativeDocument: DocumentMetadataSchema.nullable(),
  }),
  execute: async (inputData) => {
    const { documentId } = inputData;

    return await withSession(async (session) => {
      const currentResult = await session.run(
        `MATCH (d:Document {id: $id})
         RETURN
           ${documentMetadataReturn('d')}`,
        { id: documentId },
      );
      const currentDocument =
        currentResult.records.length > 0 ? mapDocumentMetadataRecord(currentResult.records[0]) : null;

      // Direct amendments: change notices that amend this document
      const amendResult = await session.run(
        `MATCH (d:Document {id: $id})
         OPTIONAL MATCH (amend:Document)-[r:AMENDS]->(d)
         WHERE amend IS NOT NULL
         RETURN
           ${documentMetadataReturn('amend')},
           r.change_description AS changeDescription
         ORDER BY amend.effective_date DESC, amend.id ASC`,
        { id: documentId },
      );

      const amendments = amendResult.records.map((rec) => ({
        ...mapDocumentMetadataRecord(rec),
        changeSummary: rec.get('changeDescription') as string | null,
      }));

      // Base document: the document this one directly amends
      const baseResult = await session.run(
        `MATCH (d:Document {id: $id})-[:AMENDS]->(base:Document)
         RETURN
           ${documentMetadataReturn('base')}
         LIMIT 1`,
        { id: documentId },
      );

      const baseDocument =
        baseResult.records.length > 0
          ? mapDocumentMetadataRecord(baseResult.records[0])
          : null;

      const latestAmendment = amendments[0];
      const authoritativeDocument = latestAmendment
        ? {
            id: latestAmendment.id,
            title: latestAmendment.title,
            documentType: latestAmendment.documentType,
            policyNumber: latestAmendment.policyNumber,
            effectiveDate: latestAmendment.effectiveDate,
            url: latestAmendment.url,
            status: latestAmendment.status,
          }
        : currentDocument;

      return { amendments, baseDocument, authoritativeDocument };
    });
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/agent && npx vitest run tests/tools/navigate.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/tools/navigate.ts packages/agent/tests/tools/navigate.test.ts
git commit -m "feat(agent): simplify getAmendments to depth-1 with change_description

Read change_description directly from the AMENDS relationship instead of
scanning section text at runtime. Variable-length path traversal replaced
with direct edge match — no real transitive chains exist in the graph."
```

---

### Task 3: Agent tool — update integration test fixtures

**Files:**
- Modify: `packages/agent/tests/integration/neo4j-tools.integration.test.ts`

- [ ] **Step 1: Update the amendment fixture to use direct edges with change_description**

In the integration test, find the `getAmendments` test (around line 180). Replace the fixture setup and assertions. The key changes:
1. `early` and `late` both amend `current` directly (not a chain)
2. AMENDS edges include `change_description`
3. Section nodes are no longer needed for changeSummary
4. Assert `changeSummary` matches the edge property

Replace the `CREATE` block and assertions in the `getAmendments` test:

```typescript
    await run(
      `
      CREATE (base:Document {
        id: $baseDocId,
        title: 'Policy 8C (2024)',
        document_type: 'dhhs_policy',
        policy_number: '8C',
        effective_date: '2024-01-01',
        source_url: 'https://example.com/base',
        status: 'current'
      })
      CREATE (current:Document {
        id: $currentDocId,
        title: 'Policy 8C (2025)',
        document_type: 'dhhs_policy',
        policy_number: '8C',
        effective_date: '2025-01-01',
        source_url: 'https://example.com/current',
        status: 'current'
      })
      CREATE (early:Document {
        id: $amendEarlyId,
        title: 'Change Notice 2025-02',
        document_type: 'change_notice',
        policy_number: '8C-CN-02',
        effective_date: '2025-02-01',
        source_url: 'https://example.com/early',
        status: 'amendment'
      })
      CREATE (late:Document {
        id: $amendLateId,
        title: 'Change Notice 2025-06',
        document_type: 'change_notice',
        policy_number: '8C-CN-06',
        effective_date: '2025-06-01',
        source_url: 'https://example.com/late',
        status: 'amendment'
      })
      CREATE (current)-[:AMENDS]->(base)
      CREATE (early)-[re:AMENDS]->(current)
      CREATE (late)-[rl:AMENDS]->(current)
      SET re.change_description = $earlyDesc
      SET rl.change_description = $lateDesc
      `,
      {
        baseDocId,
        currentDocId,
        amendEarlyId,
        amendLateId,
        earlyDesc: 'Updated eligibility criteria in section IV.A.',
        lateDesc: 'Revised premium chart in section IV.I.',
      },
    );

    const result = await getAmendments.execute({ documentId: currentDocId }, {});

    expect(result.baseDocument?.id).toBe(baseDocId);
    expect(result.amendments.map((doc) => doc.id)).toEqual([amendLateId, amendEarlyId]);
    expect(result.authoritativeDocument?.id).toBe(amendLateId);
    expect(result.authoritativeDocument?.url).toBe('https://example.com/late');
    expect(result.amendments[0].changeSummary).toBe('Revised premium chart in section IV.I.');
    expect(result.amendments[1].changeSummary).toBe('Updated eligibility criteria in section IV.A.');
```

- [ ] **Step 2: Run the integration test**

Run: `cd packages/agent && RUN_NEO4J_INTEGRATION=1 npx vitest run tests/integration/neo4j-tools.integration.test.ts`
Expected: PASS (or skip if Neo4j isn't running locally — that's OK, the unit tests cover the logic).

- [ ] **Step 3: Commit**

```bash
git add packages/agent/tests/integration/neo4j-tools.integration.test.ts
git commit -m "test(agent): update integration test for depth-1 AMENDS with change_description"
```

---

### Task 4: Agent prompt — taxonomy context and amendment guidance

**Files:**
- Modify: `packages/agent/src/index.ts:87-109`

- [ ] **Step 1: Replace the document-type routing block and program routing rule**

In `packages/agent/src/index.ts`, replace lines 87-109 of the `SYSTEM_PROMPT` string (the `## Document-type routing` section and the program routing rule on line 109). Replace:

```
## Document-type routing
When searching, route queries to the appropriate document types:
- **Eligibility and enrollment questions** → documentTypes: ["dhhs_policy"]
- **Coverage decisions and medical necessity** → documentTypes: ["clinical_policy"]
- **Federal requirements and compliance** → documentTypes: ["federal_regulation"]
- **Recent rule changes and updates** → documentTypes: ["change_notice"]
- **Broad questions** → search without type filter, then refine
```

With:

```
## Document types in the knowledge base
- **dhhs_policy** — MA-series manual sections covering eligibility, enrollment, financial rules, and program administration (e.g., MA-2180 HCWD, MA-2250 Income, MA-2280 CAP). This is the largest collection and the primary source for "who qualifies" and "how much" questions.
- **clinical_policy** — Clinical Coverage Policies (CCPs) governing what services are covered, medical necessity criteria, and provider billing (e.g., CCP 1A-1 Dental, CCP 3L CAP/DA services). Use for "what's covered" and "is this medically necessary" questions.
- **federal_regulation** — 42 CFR and other federal rules that NC policies implement.
- **change_notice** — Amendments to the above. Usually found automatically via getAmendments; search directly only when asking about recent rule changes.

When unsure which type applies, search without a filter first, then refine based on what comes back.
```

- [ ] **Step 2: Update the amendment awareness section**

Replace line 98 of the prompt:

```
- If a change notice exists, read its sections to determine what was modified.
```

With:

```
- Each amendment includes a **changeSummary** describing what was changed in the target document. Use this to assess relevance before reading the full change notice. Only use getSection on a change notice's sections when the changeSummary indicates the amendment is relevant to the question at hand.
```

- [ ] **Step 3: Remove the program-specific routing rule**

Delete line 109:

```
2. **If the question asks about a specific program** (CAP/DA, HCWD, PACE, CAP/C), search with documentTypes: ["clinical_policy"] first. Only try ["dhhs_policy"] if clinical policy results are insufficient.
```

And renumber the subsequent steps (3→2, 4→3, etc.).

- [ ] **Step 4: Run typecheck**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: No errors (prompt is a string, no type changes).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/index.ts
git commit -m "fix(agent): replace rigid routing rules with document taxonomy context

Removes hard-coded document-type routing and program-specific rules.
Teaches the agent the taxonomy so it can make routing decisions itself.
Updates amendment guidance to use changeSummary for relevance assessment
instead of diving into full change notice sections."
```

---

### Task 5: Pipeline integration check — re-run and verify

**Files:** None (verification only)

- [ ] **Step 1: Delete existing AMENDS edges**

```bash
cd packages/pipeline
python -c "
from pipeline.graph.connection import get_session
with get_session() as s:
    result = s.run('MATCH ()-[r:AMENDS]->() DELETE r RETURN count(r) AS deleted')
    print(f'Deleted {result.single()[\"deleted\"]} AMENDS edges')
"
```

- [ ] **Step 2: Re-run amendment detection**

```bash
cd packages/pipeline
python -c "
from pipeline.references.amendments import detect_amendments
stats = detect_amendments()
print(stats)
"
```

Expected: `edges_created` should be lower than the previous 851 (signal-section filtering removes noise). Exact count depends on the data.

- [ ] **Step 3: Spot-check MA-2180 amendments**

```bash
node -e "
const neo4j = require('neo4j-driver');
const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'medicaid-dev'));
const session = driver.session();
session.run(\`
  MATCH (cn:Document)-[r:AMENDS]->(d:Document {id: 'doc:dhhs_policy:MA-2180'})
  RETURN cn.title AS title, r.change_description AS desc
  ORDER BY cn.effective_date DESC
\`)
  .then(r => {
    console.log('MA-2180 amendments:');
    r.records.forEach(rec => {
      console.log('  ' + rec.get('title'));
      console.log('  desc: ' + (rec.get('desc') || '(none)').substring(0, 150));
      console.log();
    });
  })
  .then(() => session.close())
  .then(() => driver.close());
"
```

Expected: Each amendment has a meaningful `change_description` instead of null/random text.

- [ ] **Step 4: Commit (no code changes — just verification)**

No commit needed. Move to next task.

---

### Task 6: Smoke test — HCWD earned income question

- [ ] **Step 1: Run the HCWD question through the CLI**

```bash
cd packages/agent
npx tsx src/index.ts "What is the earned income limit for HCWD?"
```

Expected: The agent should answer definitively that there is no earned income limit for HCWD, citing MA-2180 Section F. It should NOT hedge about "unrelated change notices" or "unable to verify."

- [ ] **Step 2: Verify amendment narration is helpful**

In the output, look for the agent's narration when it calls getAmendments. It should reference specific change descriptions (e.g., "updated resource limits" or "revised premium chart") instead of confusing titles like "Long Term Care Partnership Program."

- [ ] **Step 3: Final commit if any adjustments were needed**

If the smoke test reveals prompt wording that needs tweaking, commit the fix:

```bash
git add -A
git commit -m "fix(agent): adjust prompt wording based on HCWD smoke test"
```
