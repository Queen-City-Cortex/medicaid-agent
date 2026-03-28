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

# Pattern for "REVISED" SPA titles — capture the SPA number
# e.g. "NC SPA 12-001 REVISED" or "REVISED - SPA 12-001"
_REVISED_SPA_RE = re.compile(
    r"SPA\s+([\w\-]+)",
    re.IGNORECASE,
)


def _parse_manual_number(title: str) -> str | None:
    """Extract manual number from a DHHS change-notice title."""
    m = _CHANGE_NOTICE_RE.search(title)
    if m:
        return m.group(1).strip()
    return None


def _is_revised_spa(title: str) -> bool:
    return bool(re.search(r"\bREVISED\b", title, re.IGNORECASE)) and bool(
        _REVISED_SPA_RE.search(title)
    )


def _parse_spa_number(title: str) -> str | None:
    m = _REVISED_SPA_RE.search(title)
    if m:
        return m.group(1).strip()
    return None


def detect_amendments() -> dict:
    """Detect amendment/change-notice relationships and write AMENDS edges.

    Returns a dict with keys:
      - change_notices: number of change-notice documents found
      - revised_spas:   number of revised-SPA documents found
      - edges_created:  total AMENDS edges created
    """
    stats = {"change_notices": 0, "revised_spas": 0, "edges_created": 0}

    with get_session() as session:
        # Fetch all documents with id and title
        result = session.run(
            "MATCH (d:Document) RETURN d.id AS doc_id, d.title AS title"
        )
        all_docs = [{"doc_id": r["doc_id"], "title": r["title"] or ""} for r in result]

    console.print(f"Scanning {len(all_docs)} documents for amendment patterns...")

    # Build lookup: lower-case title → doc_id (for substring matching)
    title_index: list[tuple[str, str]] = [
        (d["title"].lower(), d["doc_id"]) for d in all_docs
    ]

    edges_to_create: list[tuple[str, str]] = []  # (source_id, target_id)
    change_notice_ids: list[str] = []
    revised_spa_ids: list[str] = []

    for doc in all_docs:
        title = doc["title"]
        doc_id = doc["doc_id"]

        # --- DHHS Change Notices ---
        manual_num = _parse_manual_number(title)
        if manual_num:
            stats["change_notices"] += 1
            change_notice_ids.append(doc_id)
            # Find documents whose title contains the manual number
            manual_lower = manual_num.lower()
            for target_title_lower, target_id in title_index:
                if target_id == doc_id:
                    continue
                if manual_lower in target_title_lower:
                    edges_to_create.append((doc_id, target_id))

        # --- Revised SPAs ---
        elif _is_revised_spa(title):
            spa_num = _parse_spa_number(title)
            if not spa_num:
                continue
            stats["revised_spas"] += 1
            revised_spa_ids.append(doc_id)
            spa_lower = spa_num.lower()
            for target_title_lower, target_id in title_index:
                if target_id == doc_id:
                    continue
                # Match by SPA number but exclude other revised SPAs
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
