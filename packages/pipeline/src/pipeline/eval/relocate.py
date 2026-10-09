"""Find where golden supporting quotes live once their sections have moved.

An agency that republishes a document gives it a new address, and so a new
document id; a re-parse can renumber unnumbered sections. Either leaves a
golden key citing section ids the corpus no longer holds. This reads the
parsed corpus, with no graph, and reports for each such id the sections that
now contain the key's quotes. It proposes; a person re-points the key.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Iterator

from pipeline.eval.dataset import normalize_quote

EVIDENCE_KINDS = ("primary_sections", "supporting_sections")
# Read from federal caches, not from the parsed corpus this scans.
_FEDERAL_FAMILIES = frozenset({"federal_regulation", "federal_statute"})


def family_of(section_or_document_id: str) -> str:
    """`dhhs_policy` from `sec:doc:dhhs_policy:…` or `doc:dhhs_policy:…`."""
    parts = section_or_document_id.split(":")
    return parts[2] if parts[0] == "sec" else parts[1]


def corpus_sections(source_types: Iterable[str]) -> Iterator[dict]:
    """Sections of every loadable parsed document of these source types."""
    from pipeline.config import CRAWLER_DATA_DIR, PARSED_DATA_DIR, SOURCE_TYPE_DIRS
    from pipeline.crawler_registry import (
        PAYLOAD_RETAINED_STATUSES,
        normalize_local_path,
        read_registry_rows,
    )
    from pipeline.graph.loader import (
        build_sections_from_items,
        build_sections_from_synthetic_items,
    )
    from pipeline.identity import build_document_id

    registry = {
        normalize_local_path(row["local_path"]): row
        for row in read_registry_rows()
        if row.get("local_path") and row["status"] in PAYLOAD_RETAINED_STATUSES
    }
    for source_type in sorted(set(source_types)):
        directory = PARSED_DATA_DIR / SOURCE_TYPE_DIRS.get(source_type, source_type)
        for meta_file in sorted(directory.glob("*.meta.json")):
            meta = json.loads(meta_file.read_text())
            if meta.get("parse_status", "parsed") != "parsed" or meta.get("answer_ready") is False:
                continue
            row = registry.get(
                normalize_local_path(
                    meta.get("source_file") or meta.get("source_pdf"), CRAWLER_DATA_DIR
                )
            )
            artifact = meta_file.with_name(meta_file.name.removesuffix(".meta.json") + ".json")
            if not row or row["source_type"] != source_type or not artifact.is_file():
                continue
            document_id = build_document_id(source_type, row["source_url"])
            payload = json.loads(artifact.read_text())
            sections = (
                build_sections_from_synthetic_items(payload, document_id)
                if "synthetic_sections" in payload
                else build_sections_from_items(payload, document_id)
            )
            for section in sections:
                yield {
                    "section_id": section["id"],
                    "document_id": document_id,
                    "section_number": section.get("section_number"),
                    "section_title": section.get("title"),
                    "document_title": row.get("title"),
                    "source_url": row["source_url"],
                    "content_text": section.get("content_text") or "",
                }


def relocate_golden_sections(entries: list[dict], sections: Iterable[dict] | None = None) -> dict:
    """Where the quotes of each cited section the corpus lacks are found now.

    Every quoted entry is checked, validated or not. A cited section with no
    quote cannot be traced and is listed without candidates.
    """
    quoted = [entry for entry in entries if entry.get("supporting_quotes")]
    cited = {
        section["section_id"]
        for entry in quoted
        for kind in EVIDENCE_KINDS
        for section in entry["evidence"].get(kind, [])
    }
    families = {family_of(section_id) for section_id in cited} - _FEDERAL_FAMILIES
    by_family: dict[str, list[dict]] = {family: [] for family in families}
    for section in corpus_sections(families) if sections is None else sections:
        by_family.setdefault(family_of(section["section_id"]), []).append(
            {**section, "normalized": normalize_quote(section["content_text"])}
        )
    present = {section["section_id"] for rows in by_family.values() for section in rows}

    moved = []
    for entry in quoted:
        for kind in EVIDENCE_KINDS:
            for cited_section in entry["evidence"].get(kind, []):
                section_id = cited_section["section_id"]
                family = family_of(section_id)
                if family in _FEDERAL_FAMILIES or section_id in present:
                    continue
                quotes = [
                    quote["quote"]
                    for quote in entry["supporting_quotes"]
                    if quote["section_id"] == section_id
                ]
                moved.append({
                    "id": entry["id"],
                    "status": entry.get("status"),
                    "kind": kind,
                    "section_id": section_id,
                    "relevance": cited_section.get("relevance"),
                    "quotes": [
                        {
                            "quote": quote,
                            "found_in": [
                                {key: section[key] for key in (
                                    "section_id", "document_id", "section_number",
                                    "section_title", "document_title", "source_url",
                                )}
                                for section in by_family.get(family, [])
                                if normalize_quote(quote) in section["normalized"]
                            ],
                        }
                        for quote in quotes
                    ],
                })
    return {
        "families_scanned": sorted(by_family),
        "sections_scanned": len(present),
        "cited_sections": len(cited),
        "moved": moved,
    }
