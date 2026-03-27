"""Resolve extracted references to Neo4j graph nodes."""

import json
import re
from pathlib import Path

from pipeline.graph.connection import get_session
from pipeline.graph import queries
from pipeline.references.extractor import ReferenceMatch
from pipeline.config import PARSED_DATA_DIR

# Matches "42 CFR 440.70" and variants with optional § and spaces
CFR_CITATION_RE = re.compile(
    r"(\d+)\s*CFR\s*§?\s*([\d]+(?:\.[\d]+)*)"
)

# Superseded CFR parts: old → current. Citations to the old part
# resolve to the replacement part instead.
# 45 CFR 74 was superseded by 45 CFR 75 in Dec 2014 (OMB Uniform Guidance).
CFR_SUPERSESSIONS: dict[tuple[int, int], tuple[int, int]] = {
    (45, 74): (45, 75),
}


def parse_cfr_citation(text: str) -> dict | None:
    """
    Parse a CFR citation string into its components.

    Input: "42 CFR 440.70" or "42 CFR §440.70(b)(3)"
    Output: {"title": 42, "section": "440.70", "part": 440}
    Returns None if the text does not match a CFR citation pattern.
    """
    match = CFR_CITATION_RE.search(text)
    if not match:
        return None

    title = int(match.group(1))
    section = match.group(2)

    # Derive part number: integer part of section number (before the dot)
    part = int(section.split(".")[0])

    # Redirect superseded parts to their current replacements
    redirect = CFR_SUPERSESSIONS.get((title, part))
    if redirect:
        new_title, new_part = redirect
        # Remap section number: 74.x → 75.x
        section = str(new_part) + section[len(str(part)):]
        title = new_title
        part = new_part

    return {"title": title, "section": section, "part": part}


def resolve_reference(
    ref: ReferenceMatch,
    source_section_id: str,
    source_document_id: str,
) -> dict:
    """
    Attempt to resolve a reference to a graph node.

    Returns a dict with resolution result:
    {
        "resolved": bool,
        "target_node_id": str | None,
        "target_type": "section" | "document" | None,
        "edge_type": str,
    }
    """
    with get_session() as session:
        if ref.ref_type == "cross_document":
            # Look up document by policy number
            result = session.run(
                "MATCH (d:Document {policy_number: $pn}) RETURN d.id",
                {"pn": ref.target_id},
            )
            record = result.single()
            if record:
                return {
                    "resolved": True,
                    "target_node_id": record["d.id"],
                    "target_type": "document",
                    "edge_type": "REFERENCES_DOCUMENT",
                }

        elif ref.ref_type == "section":
            # Look for section within the same document first
            result = session.run(
                "MATCH (s:Section {document_id: $doc_id, section_number: $sn}) RETURN s.id",
                {"doc_id": source_document_id, "sn": ref.target_id},
            )
            record = result.single()
            if record:
                return {
                    "resolved": True,
                    "target_node_id": record["s.id"],
                    "target_type": "section",
                    "edge_type": "REFERENCES",
                }

        elif ref.ref_type == "federal_regulation":
            parsed = parse_cfr_citation(ref.target_id)
            if parsed:
                doc_id = f"doc:federal_regulation:{parsed['title']}-CFR-{parsed['part']}"
                result = session.run(
                    "MATCH (s:Section {document_id: $doc_id, section_number: $sn}) RETURN s.id",
                    {"doc_id": doc_id, "sn": parsed["section"]},
                )
                record = result.single()
                if record:
                    return {
                        "resolved": True,
                        "target_node_id": record["s.id"],
                        "target_type": "section",
                        "edge_type": "REFERENCES",
                    }

    return {
        "resolved": False,
        "target_node_id": None,
        "target_type": None,
        "edge_type": None,
    }


def extract_and_resolve_all() -> dict:
    """Run cross-reference extraction and resolution across all loaded sections."""
    stats = {"extracted": 0, "resolved": 0, "unresolved": 0}
    unresolved: list[dict] = []

    from pipeline.references.extractor import extract_references

    with get_session() as session:
        # Get all sections
        result = session.run(
            "MATCH (s:Section) RETURN s.id, s.document_id, s.content_text"
        )
        sections = list(result)

    for record in sections:
        section_id = record["s.id"]
        document_id = record["s.document_id"]
        content = record["s.content_text"] or ""

        refs = extract_references(content)
        stats["extracted"] += len(refs)

        for ref in refs:
            resolution = resolve_reference(ref, section_id, document_id)

            if resolution["resolved"]:
                stats["resolved"] += 1
                with get_session() as session:
                    if resolution["edge_type"] == "REFERENCES":
                        session.run(queries.MERGE_REFERENCES, {
                            "source_id": section_id,
                            "target_id": resolution["target_node_id"],
                            "reference_text": ref.matched_text,
                            "reference_type": ref.ref_type,
                        })
                    elif resolution["edge_type"] == "REFERENCES_DOCUMENT":
                        session.run(queries.MERGE_REFERENCES_DOCUMENT, {
                            "source_id": section_id,
                            "target_id": resolution["target_node_id"],
                            "reference_text": ref.matched_text,
                        })
            else:
                stats["unresolved"] += 1
                unresolved.append({
                    "source_section": section_id,
                    "ref_type": ref.ref_type,
                    "target_id": ref.target_id,
                    "matched_text": ref.matched_text,
                })

    # Save unresolved references
    unresolved_path = PARSED_DATA_DIR.parent / "unresolved-references.json"
    unresolved_path.write_text(json.dumps(unresolved, indent=2))

    return stats
