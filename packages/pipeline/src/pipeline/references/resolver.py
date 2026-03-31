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
            # 1. Exact match on policy_number
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

            # 2. Normalized match (strip hyphens): "1-H" matches "1H", "8-D2" matches "8D-2"
            normalized = ref.target_id.replace("-", "")
            result = session.run(
                "MATCH (d:Document) "
                "WHERE REPLACE(d.policy_number, '-', '') = $normalized "
                "RETURN d.id LIMIT 1",
                {"normalized": normalized},
            )
            record = result.single()
            if record:
                return {
                    "resolved": True,
                    "target_node_id": record["d.id"],
                    "target_type": "document",
                    "edge_type": "REFERENCES_DOCUMENT",
                }

            # 3. Prefix match for parent references: "5A" → "5A-1", "3H" → "3H-1"
            result = session.run(
                "MATCH (d:Document) "
                "WHERE d.policy_number STARTS WITH $target "
                "AND d.document_type = 'clinical_policy' "
                "RETURN d.id ORDER BY d.policy_number LIMIT 1",
                {"target": ref.target_id},
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
            # 1. Exact section_number match within the same document
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

            # 2. Fallback: title contains the section number (Docling may have
            #    generated a synthetic ID like _s73 instead of preserving the number)
            result = session.run(
                "MATCH (s:Section {document_id: $doc_id}) "
                "WHERE s.title CONTAINS $sn "
                "RETURN s.id LIMIT 1",
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

        elif ref.ref_type == "attachment":
            section_num = f"Attachment {ref.target_id}"
            result = session.run(
                "MATCH (s:Section {document_id: $doc_id, section_number: $sn}) RETURN s.id",
                {"doc_id": source_document_id, "sn": section_num},
            )
            record = result.single()
            if record:
                return {
                    "resolved": True,
                    "target_node_id": record["s.id"],
                    "target_type": "section",
                    "edge_type": "REFERENCES",
                }

        elif ref.ref_type in ("federal_regulation", "federal_statute"):
            # Handle SSA-Title references (LLM outputs like "SSA-Title-19")
            ssa_match = re.match(r"^SSA-Title-(\d+|XIX|XXI?)$", ref.target_id, re.IGNORECASE)
            if ssa_match:
                raw = ssa_match.group(1)
                roman_map = {"XIX": 19, "XXI": 21, "XX": 20}
                title_num = roman_map.get(raw.upper()) or int(raw)
                doc_id = f"doc:federal_statute:ssa-title-{title_num}"
                result = session.run(
                    "MATCH (d:Document {id: $doc_id}) RETURN d.id",
                    {"doc_id": doc_id},
                )
                record = result.single()
                if record:
                    return {
                        "resolved": True,
                        "target_node_id": record["d.id"],
                        "target_type": "document",
                        "edge_type": "REFERENCES_DOCUMENT",
                    }

            # Try standard CFR parse: "42 CFR 440.70"
            parsed = parse_cfr_citation(ref.target_id)

            # Fallback: normalize LLM hyphenated format "42-CFR-441" → "42 CFR 441"
            if not parsed:
                cfr_norm = re.match(r"^(\d+)-CFR-(.+)$", ref.target_id)
                if cfr_norm:
                    normalized = f"{cfr_norm.group(1)} CFR {cfr_norm.group(2)}"
                    parsed = parse_cfr_citation(normalized)

            if parsed:
                doc_id = f"doc:federal_regulation:{parsed['title']}-CFR-{parsed['part']}"

                # Section-level resolution (has dot in section number)
                if "." in parsed["section"]:
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

                # Document-level fallback (e.g., "42-CFR-441" with no specific section)
                result = session.run(
                    "MATCH (d:Document {id: $doc_id}) RETURN d.id",
                    {"doc_id": doc_id},
                )
                record = result.single()
                if record:
                    return {
                        "resolved": True,
                        "target_node_id": record["d.id"],
                        "target_type": "document",
                        "edge_type": "REFERENCES_DOCUMENT",
                    }

        elif ref.ref_type == "ssa_section":
            for title_num in [19, 21]:
                doc_id = f"doc:federal_statute:ssa-title-{title_num}"
                result = session.run(
                    "MATCH (s:Section {document_id: $doc_id, section_number: $sn}) RETURN s.id",
                    {"doc_id": doc_id, "sn": ref.target_id},
                )
                record = result.single()
                if record:
                    return {
                        "resolved": True,
                        "target_node_id": record["s.id"],
                        "target_type": "section",
                        "edge_type": "REFERENCES",
                    }

        elif ref.ref_type == "waiver":
            # Normalize: "1915 (c)" → "1915(c)", "1915(C)" → "1915(c)"
            target = re.sub(
                r"1915\s*\(([a-zA-Z])\)",
                lambda m: f"1915({m.group(1).lower()})",
                ref.target_id,
            )
            result = session.run(
                "MATCH (d:Document {policy_number: $pn}) RETURN d.id LIMIT 1",
                {"pn": target},
            )
            record = result.single()
            if record:
                return {
                    "resolved": True,
                    "target_node_id": record["d.id"],
                    "target_type": "document",
                    "edge_type": "REFERENCES_DOCUMENT",
                }

    return {
        "resolved": False,
        "target_node_id": None,
        "target_type": None,
        "edge_type": None,
    }


def _resolve_and_create_edge(
    ref: ReferenceMatch,
    section_id: str,
    document_id: str,
    stats: dict,
    unresolved: list[dict],
) -> None:
    """Resolve a single reference and create the graph edge if successful."""
    resolution = resolve_reference(ref, section_id, document_id)

    if resolution["resolved"]:
        # Skip self-references (section linking back to its own document)
        target_id = resolution["target_node_id"]
        if resolution["target_type"] == "document" and target_id == document_id:
            return
        if resolution["target_type"] == "section" and target_id == section_id:
            return

        stats["resolved"] += 1
        with get_session() as session:
            if resolution["edge_type"] == "REFERENCES":
                session.run(queries.MERGE_REFERENCES, {
                    "source_id": section_id,
                    "target_id": resolution["target_node_id"],
                    "reference_text": ref.matched_text,
                    "reference_type": ref.ref_type,
                    "extraction_method": ref.extraction_method,
                })
            elif resolution["edge_type"] == "REFERENCES_DOCUMENT":
                session.run(queries.MERGE_REFERENCES_DOCUMENT, {
                    "source_id": section_id,
                    "target_id": resolution["target_node_id"],
                    "reference_text": ref.matched_text,
                    "extraction_method": ref.extraction_method,
                })
    else:
        stats["unresolved"] += 1
        unresolved.append({
            "source_section": section_id,
            "ref_type": ref.ref_type,
            "target_id": ref.target_id,
            "matched_text": ref.matched_text,
            "extraction_method": ref.extraction_method,
        })


def extract_and_resolve_all(llm_assist: bool = False) -> dict:
    """Run cross-reference extraction and resolution across all loaded sections."""
    import logging
    logger = logging.getLogger(__name__)

    stats = {"extracted": 0, "resolved": 0, "unresolved": 0}
    unresolved: list[dict] = []

    from pipeline.references.extractor import extract_references

    with get_session() as session:
        # Get all sections
        result = session.run(
            "MATCH (s:Section) RETURN s.id, s.document_id, s.content_text"
        )
        sections = list(result)

    # Track which sections got regex-resolved refs (for LLM candidate selection)
    sections_with_refs: set[str] = set()

    # Phase 1: Regex extraction
    for record in sections:
        section_id = record["s.id"]
        document_id = record["s.document_id"]
        content = record["s.content_text"] or ""

        refs = extract_references(content)
        stats["extracted"] += len(refs)

        for ref in refs:
            _resolve_and_create_edge(ref, section_id, document_id, stats, unresolved)
            if ref.ref_type in ("cross_document", "federal_regulation", "ssa_section"):
                sections_with_refs.add(section_id)

    # Phase 2: LLM extraction (optional)
    if llm_assist:
        from pipeline.references.llm_extractor import (
            extract_references_llm,
            fetch_document_catalog,
        )

        stats["llm_extracted"] = 0
        stats["llm_resolved"] = 0
        stats["llm_unresolved"] = 0

        # Fetch document catalog for LLM context
        with get_session() as session:
            catalog = fetch_document_catalog(session)

        # Candidate sections: those with prose content likely to contain
        # natural-language references. Skip sections that are just procedure
        # code tables, short fragments, or already have cross-doc refs.
        candidates = []
        for record in sections:
            section_id = record["s.id"]
            content = record["s.content_text"] or ""

            # Skip if already has cross-document refs from regex
            if section_id in sections_with_refs:
                continue

            # Skip short sections (unlikely to contain implicit refs)
            if len(content) < 500:
                continue

            # Skip sections that are mostly numeric/codes (procedure tables)
            alpha_chars = sum(1 for c in content if c.isalpha())
            if len(content) > 0 and alpha_chars / len(content) < 0.4:
                continue

            candidates.append({
                "id": section_id,
                "document_id": record["s.document_id"],
                "content_text": content,
            })

        logger.info(
            "LLM extraction: %d candidate sections (of %d total, %d already have cross-refs)",
            len(candidates), len(sections), len(sections_with_refs),
        )

        llm_refs = extract_references_llm(candidates, catalog)

        # Build a lookup from section_id -> document_id
        sec_to_doc = {r["s.id"]: r["s.document_id"] for r in sections}

        # Use separate stats/unresolved for LLM so they don't inflate regex counts
        llm_stats = {"extracted": 0, "resolved": 0, "unresolved": 0}
        llm_unresolved: list[dict] = []

        for section_id, refs in llm_refs.items():
            document_id = sec_to_doc.get(section_id, "")
            llm_stats["extracted"] += len(refs)

            for ref in refs:
                _resolve_and_create_edge(ref, section_id, document_id, llm_stats, llm_unresolved)

        stats["llm_extracted"] = llm_stats["extracted"]
        stats["llm_resolved"] = llm_stats["resolved"]
        stats["llm_unresolved"] = llm_stats["unresolved"]
        unresolved.extend(llm_unresolved)

    # Save unresolved references
    unresolved_path = PARSED_DATA_DIR.parent / "unresolved-references.json"
    unresolved_path.write_text(json.dumps(unresolved, indent=2))

    return stats
