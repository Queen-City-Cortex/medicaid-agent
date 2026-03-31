"""Detect amendment relationships between documents and create AMENDS edges."""

import re

from rich.console import Console

from pipeline.graph.connection import get_session
from pipeline.graph import queries

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


def detect_amendments() -> dict:
    """Detect amendment/change-notice relationships and write AMENDS edges.

    For change notices, identifies the documents being amended by:
    1. Extracting MA-series policy numbers from the change notice title and
       section content (e.g., MA-2180, DMA-5097)
    2. Creating AMENDS edges to documents with matching policy_number

    Returns a dict with keys:
      - change_notices: number of change-notice documents found
      - revised_spas:   number of revised-SPA documents found
      - edges_created:  total AMENDS edges created
    """
    stats = {"change_notices": 0, "revised_spas": 0, "edges_created": 0}

    with get_session() as session:
        # Fetch all documents
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

    edges_to_create: list[tuple[str, str]] = []
    change_notice_ids: list[str] = []
    revised_spa_ids: list[str] = []

    for doc in all_docs:
        title = doc["title"]
        doc_id = doc["doc_id"]

        # --- DHHS Change Notices ---
        if _is_change_notice(title):
            stats["change_notices"] += 1
            change_notice_ids.append(doc_id)

            # Extract MA-series numbers from the title
            ma_numbers = _extract_ma_numbers_from_text(title)

            # Also extract from all section content of this change notice
            with get_session() as session:
                sec_result = session.run(
                    "MATCH (d:Document {id: $doc_id})-[:HAS_SECTION]->(s:Section) "
                    "WHERE s.content_text IS NOT NULL "
                    "RETURN s.content_text",
                    {"doc_id": doc_id},
                )
                for rec in sec_result:
                    content = rec["s.content_text"] or ""
                    ma_numbers.update(_extract_ma_numbers_from_text(content))

            # Create AMENDS edges to documents with matching policy_numbers
            for ma_num in ma_numbers:
                target_doc_ids = pn_to_docs.get(ma_num, [])
                for target_id in target_doc_ids:
                    if target_id != doc_id:
                        edges_to_create.append((doc_id, target_id))

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
                    edges_to_create.append((doc_id, target_id))

    # Deduplicate edges
    edges_to_create = list(set(edges_to_create))

    console.print(
        f"  Found {stats['change_notices']} change notices, "
        f"{stats['revised_spas']} revised SPAs — "
        f"{len(edges_to_create)} AMENDS edges to create"
    )

    # Write edges and mark amendment documents
    with get_session() as session:
        for source_id, target_id in edges_to_create:
            session.run(queries.MERGE_AMENDS, {
                "source_id": source_id,
                "target_id": target_id,
            })
            stats["edges_created"] += 1

        # Mark change notice documents as status='amendment'
        for doc_id in change_notice_ids + revised_spa_ids:
            session.run(
                "MATCH (d:Document {id: $id}) SET d.status = 'amendment'",
                {"id": doc_id},
            )

    return stats
