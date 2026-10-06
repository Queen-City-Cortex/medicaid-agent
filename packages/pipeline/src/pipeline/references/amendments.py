"""Detect amendment relationships between documents and create AMENDS edges."""

import re

from rich.console import Console

from pipeline.graph.connection import get_session
from pipeline.graph import queries
from pipeline.graph.corpus_types import AmendmentEdge, DocumentNode
from pipeline.graph.corpus_writer import graph_writer, normalize_source_timestamp

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

# Clinical coverage policies embed their revision history as a markdown table in
# a section titled "Revision Information:" or "N.0 Policy Implementation/
# Revision Information". Rows are `| MM/DD/YYYY | Section revised | Change |`.
# This pattern matches a single data row; header and `|:---|:---|...` separator
# rows fail the date group and are skipped.
_CCP_REVISION_ROW_RE = re.compile(
    r"^\|\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$",
)


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


def _is_sentence_boundary(text: str, pos: int) -> bool:
    """Check if a period at `pos` is a sentence boundary (not part of a reference like MA-2180.IV)."""
    if text[pos] == '\n':
        return True
    if text[pos] != '.':
        return False
    # Period followed by letter/digit is part of a reference (e.g., "MA-2180.IV.I")
    if pos + 1 < len(text) and text[pos + 1].isalnum():
        return False
    return True


def _extract_context(text: str, ma_number: str, max_chars: int = 300) -> str:
    """Extract the sentence/paragraph around an MA-number mention.

    Grabs from the previous sentence boundary to the next, capped at max_chars.
    A period is only a boundary if followed by whitespace or end-of-string,
    not when followed by a letter/digit (e.g., "MA-2180.IV.I").
    """
    pattern = re.compile(re.escape(ma_number), re.IGNORECASE)
    m = pattern.search(text)
    if not m:
        return ""

    start = m.start()
    end = m.end()

    # Walk backward to sentence start
    sent_start = start
    for i in range(start - 1, max(start - max_chars, -1), -1):
        if i < 0:
            sent_start = 0
            break
        if _is_sentence_boundary(text, i):
            sent_start = i + 1
            break
    else:
        sent_start = max(start - max_chars, 0)

    # Walk forward to sentence end
    sent_end = end
    for i in range(end, min(end + max_chars, len(text))):
        if _is_sentence_boundary(text, i):
            sent_end = i + 1
            break
    else:
        sent_end = min(end + max_chars, len(text))

    return text[sent_start:sent_end].strip()


def _parse_revision_rows(content: str) -> list[dict]:
    """Parse clinical-policy revision-table rows out of a section's content.

    Each row yields `{effective_date (ISO), section_revised, change_summary}`.
    Malformed dates are skipped so a corrupted row never breaks the pipeline.
    """
    rows: list[dict] = []
    for line in content.splitlines():
        match = _CCP_REVISION_ROW_RE.match(line)
        if not match:
            continue
        month, day, year, section_revised, change_summary = match.groups()
        try:
            iso_date = f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
        except (ValueError, TypeError):
            continue
        rows.append({
            "effective_date": iso_date,
            "section_revised": section_revised.strip(),
            "change_summary": change_summary.strip(),
        })
    return rows


def _detect_clinical_policy_revisions(
    session,
    all_docs: list[dict],
) -> tuple[dict, list[DocumentNode], list[AmendmentEdge]]:
    """Extract clinical-policy revision tables into synthetic change_notice
    documents + AMENDS edges.

    Clinical coverage policies publish revision history as a markdown table
    inside a "Revision Information:" section rather than as separate change-
    notice PDFs. This function parses those tables and materializes each row
    as its own `change_notice` Document node so `getAmendments` on the base
    CCP returns a real amendment chain.

    Synthetic docs have IDs shaped like `doc:change_notice:<policy>:<iso>[:n]`
    (the `:n` suffix disambiguates multiple revisions on the same date). They
    are retrieval_ready=False so they don't surface in primary search, but
    they participate in graph traversal and getAmendments lookups.
    """
    clinical_docs = [d for d in all_docs if d.get("doc_type") == "clinical_policy"]
    stats = {"clinical_policies_scanned": len(clinical_docs), "clinical_revisions_parsed": 0}
    if not clinical_docs:
        return stats, [], []

    doc_ids = [d["doc_id"] for d in clinical_docs]

    # Hydrate each clinical doc with its source_url so synthetic change_notices
    # can inherit a real, verifiable URL (the revision table lives inside the
    # base PDF, so the base URL is the correct citation target).
    source_url_result = session.run(
        "MATCH (d:Document) WHERE d.id IN $doc_ids RETURN d.id AS doc_id, d.source_url AS source_url",
        {"doc_ids": doc_ids},
    )
    source_url_by_doc: dict[str, str] = {
        rec["doc_id"]: (rec["source_url"] or "") for rec in source_url_result
    }

    result = session.run(
        """
        MATCH (d:Document)-[:HAS_SECTION]->(s:Section)
        WHERE d.id IN $doc_ids
          AND s.content_text IS NOT NULL
          AND s.content_text <> ''
          AND (
            toLower(coalesce(s.title, '')) CONTAINS 'revision information'
          )
        RETURN d.id AS doc_id, s.id AS sec_id, s.content_text AS content
        """,
        {"doc_ids": doc_ids},
    )
    revision_sections_by_doc: dict[str, list[str]] = {}
    for rec in result:
        revision_sections_by_doc.setdefault(rec["doc_id"], []).append(rec["content"] or "")

    doc_meta = {d["doc_id"]: d for d in clinical_docs}
    synthetic_docs: list[DocumentNode] = []
    amendment_edges: list[AmendmentEdge] = []
    seen_synth_ids: set[str] = set()

    for base_doc_id, contents in revision_sections_by_doc.items():
        meta = doc_meta.get(base_doc_id) or {}
        policy = (meta.get("policy_number") or "").strip()
        if not policy:
            continue

        # Collect every parsed revision across all revision sections (some CCPs
        # have multiple — e.g. title-only "Revision Information:" plus the
        # numbered "N.0 Policy Implementation/Revision Information").
        all_rows: list[dict] = []
        for content in contents:
            all_rows.extend(_parse_revision_rows(content))
        if not all_rows:
            continue

        stats["clinical_revisions_parsed"] += 1
        date_counters: dict[str, int] = {}
        for row in all_rows:
            iso = row["effective_date"]
            date_counters[iso] = date_counters.get(iso, 0) + 1
            count = date_counters[iso]
            suffix = "" if count == 1 else f":{count}"
            synth_id = f"doc:change_notice:{policy}:{iso}{suffix}"
            if synth_id in seen_synth_ids:
                continue
            seen_synth_ids.add(synth_id)

            title = f"Policy {policy} Revision — {iso} ({row['section_revised']})"
            # Inherit the base CCP's source_url so the citation link points to
            # the authoritative PDF that actually contains this revision-table
            # row. Fall back to the base doc id only if no URL is on record.
            base_source_url = source_url_by_doc.get(base_doc_id) or f"derived:revision-table:{base_doc_id}"
            synthetic_docs.append(
                DocumentNode(
                    id=synth_id,
                    title=title,
                    document_type="change_notice",
                    policy_number=policy,
                    category="Clinical Coverage Policy Revision",
                    status="amendment",
                    source_url=base_source_url,
                    local_path="",
                    pdf_path="",
                    page_count=0,
                    section_count=0,
                    effective_date=iso,
                    authority_tier="supporting",
                    answer_role=None,
                    source_format="derived",
                    answer_ready=True,
                    corpus_bucket=None,
                    variant_group=None,
                    variant_date=iso,
                    retrieval_ready=False,
                )
            )
            amendment_edges.append(
                AmendmentEdge(
                    source_id=synth_id,
                    target_id=base_doc_id,
                    change_description=f"{row['section_revised']}: {row['change_summary']}",
                )
            )

    return stats, synthetic_docs, amendment_edges


def _upsert_synthetic_documents(session, docs: list[DocumentNode]) -> None:
    for doc in docs:
        session.run(queries.MERGE_DOCUMENT, {
            "id": doc.id,
            "title": doc.title,
            "document_type": doc.document_type,
            "policy_number": doc.policy_number,
            "category": doc.category,
            "status": doc.status,
            "source_url": doc.source_url,
            "local_path": doc.local_path,
            "pdf_path": doc.pdf_path,
            "page_count": doc.page_count,
            "section_count": doc.section_count,
            "effective_date": doc.effective_date,
            "change_year": doc.change_year,
            "change_sequence": doc.change_sequence,
            "source_modified_date": doc.source_modified_date,
            "retrieved_at": doc.retrieved_at,
            "authority_tier": doc.authority_tier,
            "answer_role": doc.answer_role,
            "source_format": doc.source_format,
            "answer_ready": doc.answer_ready,
            "corpus_bucket": doc.corpus_bucket,
            "variant_group": doc.variant_group,
            "variant_date": doc.variant_date,
            "retrieval_ready": doc.retrieval_ready,
            "archived": doc.archived,
            "source_checked_at": normalize_source_timestamp(doc.source_checked_at),
            "source_changed_at": normalize_source_timestamp(doc.source_changed_at),
        })


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

            for sec_title, content in sections_to_scan:
                # Extract MA numbers from both section title and body
                body_ma_numbers = _extract_ma_numbers_from_text(content)
                title_section_ma = _extract_ma_numbers_from_text(sec_title)
                all_ma_in_section = body_ma_numbers | title_section_ma
                for ma_num in all_ma_in_section:
                    for target_id in pn_to_docs.get(ma_num, []):
                        if target_id != doc_id:
                            key = (doc_id, target_id)
                            excerpt = _extract_context(content, ma_num)
                            if not excerpt:
                                # MA found only in section title, use title + content
                                excerpt = f"{sec_title}: {content}".strip()
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

    amendment_edges = [
        AmendmentEdge(
            source_id=src,
            target_id=tgt,
            change_description="\n".join(
                dict.fromkeys(edge_descriptions[(src, tgt)])  # dedupe preserving order
            ),
        )
        for src, tgt in edges_to_create
    ]

    # Phase 5.4: clinical-policy revision tables → synthetic change_notice docs.
    # CCPs don't publish separate change-notice PDFs; their revision history
    # lives in a "Revision Information:" table inside the base PDF. Extract
    # each row as its own amendment node so getAmendments on the CCP works.
    with get_session() as session:
        ccp_stats, synthetic_docs, ccp_amendment_edges = _detect_clinical_policy_revisions(
            session, all_docs,
        )
        if synthetic_docs:
            _upsert_synthetic_documents(session, synthetic_docs)
    stats.update(ccp_stats)
    stats["clinical_revision_edges"] = len(ccp_amendment_edges)
    amendment_edges.extend(ccp_amendment_edges)
    console.print(
        f"  Clinical-policy revisions: {ccp_stats.get('clinical_revisions_parsed', 0)} "
        f"policies parsed, {len(ccp_amendment_edges)} synthetic AMENDS edges"
    )

    ccp_synth_ids = [doc.id for doc in synthetic_docs]
    stats["edges_created"] = graph_writer.merge_amendments(
        amendment_edges,
        sorted(set(change_notice_ids + revised_spa_ids + ccp_synth_ids)),
    )

    return stats
