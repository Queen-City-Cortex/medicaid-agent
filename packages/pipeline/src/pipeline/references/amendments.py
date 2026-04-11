"""Detect amendment relationships between documents and create AMENDS edges."""

import re

from rich.console import Console

from pipeline.graph.connection import get_session
from pipeline.graph.corpus_types import AmendmentEdge
from pipeline.graph.corpus_writer import graph_writer

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
    stats["edges_created"] = graph_writer.merge_amendments(
        amendment_edges,
        sorted(set(change_notice_ids + revised_spa_ids)),
    )

    return stats
