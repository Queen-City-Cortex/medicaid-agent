"""Bounded, complete read-only identity scans; no catalog-based filtering."""

import hashlib

from pipeline.source_lifecycle import stable_hash

PAGE_SIZE = 50
IDS_QUERY = """
MATCH (:Document)-[:HAS_SECTION]->(s:Section)
WITH DISTINCT s
RETURN elementId(s) AS identity, s.id AS section_id,
  COUNT { (:Document)-[:HAS_SECTION]->(s) } AS documents,
  COUNT { (s)<-[:PARENT_OF]-(:Section) } AS parents,
  COUNT { (:Section)-[:NEXT_SIBLING]->(s) } AS previous,
  COUNT { (s)-[:NEXT_SIBLING]->(:Section) } AS next
ORDER BY identity
"""
ROWS_QUERY = """
UNWIND $identities AS identity
MATCH (s:Section) WHERE elementId(s) = identity
MATCH (d:Document)-[:HAS_SECTION]->(s)
OPTIONAL MATCH (s)<-[:PARENT_OF]-(p:Section)
OPTIONAL MATCH (previous:Section)-[:NEXT_SIBLING]->(s)
OPTIONAL MATCH (s)-[:NEXT_SIBLING]->(next:Section)
RETURN s.id AS section_id, d.source_url AS source_url,
  d.document_type AS source_family, s.section_number AS section_number,
  s.content_text AS content_text, s.title AS section_title, s.level AS level,
  previous.content_text AS previous_content, next.content_text AS next_content,
  previous.title AS previous_title, previous.level AS previous_level,
  next.title AS next_title, next.level AS next_level,
  p.section_number AS parent_number, p.content_text AS parent_content
ORDER BY identity, elementId(d), elementId(p), elementId(previous), elementId(next)
"""


def _rows(session, identities, page_size):
    for start in range(0, len(identities), page_size):
        for row in session.run(
            ROWS_QUERY, identities=identities[start : start + page_size]
        ):
            yield dict(row)


def _neighbor_hashes(row):
    row = dict(row)
    for side in ["previous", "next", "parent"]:
        content = " ".join((row.pop(side + "_content") or "").split())
        row[side + "_content_hash"] = (
            hashlib.sha256(content.encode()).hexdigest() if content else None
        )
    return row


def _identities(session):
    identities, seen = [], set()
    digest = hashlib.sha256()
    for record in session.run(IDS_QUERY):
        row = dict(record)
        if row["section_id"] in seen or row["documents"] != 1 or any(
            row[key] > 1 for key in ["parents", "previous", "next"]
        ):
            raise ValueError(
                "Ambiguous graph evidence: duplicate raw section IDs or multiple parents/siblings/documents"
            )
        seen.add(row["section_id"])
        identities.append(row["identity"])
        digest.update(stable_hash(row).encode())
    return identities, digest.digest()


def graph_rows(session, page_size=PAGE_SIZE):
    """Yield full matching evidence, then reject any changed or partial scan.

    Only node IDs are collected globally. LIMIT/fetch_size on the original
    joined query did not bound its full-body result; seek these small ID batches
    before fetching bodies. A second complete hash scan detects content and
    topology changes, including changes to sections unrelated to the catalog.
    """
    if not 1 <= page_size <= PAGE_SIZE:
        raise ValueError("Identity pages must contain 1–50 section IDs")
    identities, metadata_hash = _identities(session)
    first = hashlib.sha256()
    for row in _rows(session, identities, page_size):
        first.update(stable_hash(row).encode())
        yield _neighbor_hashes(row)
    second = hashlib.sha256()
    for row in _rows(session, identities, page_size):
        second.update(stable_hash(row).encode())
    final_ids, final_metadata_hash = _identities(session)
    if (
        first.digest() != second.digest()
        or identities != final_ids
        or metadata_hash != final_metadata_hash
    ):
        raise ValueError("Graph changed during evidence identity normalization")
