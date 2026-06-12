"""Resolve extracted references to Neo4j graph nodes."""

import json
import re
from pathlib import Path

from pipeline.graph.connection import get_session
from pipeline.graph.corpus_types import ReferenceEdge
from pipeline.graph.corpus_writer import graph_writer
from pipeline.references.extractor import ReferenceMatch
from pipeline.config import PARSED_DATA_DIR

# Matches "42 CFR 440.70" and variants with optional § and spaces
CFR_CITATION_RE = re.compile(
    r"(\d+)\s*C\.?\s?F\.?\s?R\.?\s*(?:Part\s+)?§{0,2}\s*([\d]+(?:\.[\d]+)*)",
    re.IGNORECASE,
)

_CFR_SUPERSESSIONS_PATH = (
    Path(__file__).resolve().parents[3] / "data" / "references" / "cfr-supersessions.json"
)


def _load_cfr_supersessions() -> dict[tuple[int, int], tuple[int, int]]:
    """Load the (title, part) → (title, part) supersession map from the data file.

    The file format uses 'TITLE:PART' string keys and a `replaces_with` object so
    entries can carry provenance (effective date, reason). Fails open to an empty
    mapping if the file is missing or malformed so reference resolution still works.
    """
    try:
        payload = json.loads(_CFR_SUPERSESSIONS_PATH.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

    raw = payload.get("supersessions") or {}
    result: dict[tuple[int, int], tuple[int, int]] = {}
    for key, entry in raw.items():
        try:
            old_title_str, old_part_str = key.split(":", 1)
            old_title, old_part = int(old_title_str), int(old_part_str)
            replacement = entry["replaces_with"]
            new_title = int(replacement["title"])
            new_part = int(replacement["part"])
        except (ValueError, KeyError, TypeError):
            continue
        result[(old_title, old_part)] = (new_title, new_part)
    return result


# Superseded CFR parts: old → current. Citations to the old part resolve to the
# replacement part instead. Data lives in packages/pipeline/data/references/
# cfr-supersessions.json so additional supersessions can be added without code
# changes.
CFR_SUPERSESSIONS: dict[tuple[int, int], tuple[int, int]] = _load_cfr_supersessions()

_CONTEXTUAL_DOCUMENT_REF_TYPES = {"cross_document", "spa", "waiver"}

_CANONICAL_DOCUMENT_ORDER = (
    "ORDER BY "
    "CASE WHEN toUpper(COALESCE(d.title, '')) CONTAINS 'CHANGE NOTICE' THEN 1 ELSE 0 END, "
    "CASE WHEN COALESCE(d.status, '') = 'amendment' THEN 1 ELSE 0 END, "
    "CASE WHEN d.effective_date IS NULL THEN 1 ELSE 0 END, "
    "d.effective_date DESC, "
    "size(COALESCE(d.title, '')) ASC, "
    "d.id ASC "
    "LIMIT 1"
)


def _resolve_section_in_document(
    session,
    document_id: str,
    section_number: str,
    *,
    title_hint: str | None = None,
):
    result = session.run(
        "MATCH (s:Section {document_id: $doc_id, section_number: $sn}) "
        "RETURN s.id ORDER BY s.id LIMIT 1",
        {"doc_id": document_id, "sn": section_number},
    )
    record = result.single()
    if record:
        return record["s.id"]

    if title_hint:
        result = session.run(
            "MATCH (s:Section {document_id: $doc_id}) "
            "WHERE toLower(coalesce(s.title, '')) CONTAINS toLower($needle) "
            "RETURN s.id ORDER BY s.id LIMIT 1",
            {"doc_id": document_id, "needle": title_hint},
        )
        record = result.single()
        if record:
            return record["s.id"]

    return None


def _spa_candidates(target_id: str) -> list[str]:
    raw = target_id.strip().upper()
    normalized = re.sub(r"^SPA\s+", "", raw)
    normalized = re.sub(r"\s+", "-", normalized).strip("-")

    candidates = [raw]
    if normalized:
        candidates.extend([
            normalized,
            f"SPA {normalized}",
            f"SPA NC {normalized}",
        ])

    deduped: list[str] = []
    for candidate in candidates:
        if candidate and candidate not in deduped:
            deduped.append(candidate)
    return deduped


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

    # Redirect superseded parts to their current replacements — at PART level
    # only. Replacement parts do not share section numbering with what they
    # superseded (45 CFR 75.326 is procurement; 2 CFR 200.326 is bonding), so
    # rewriting the section number across parts fabricates citations. The
    # redirected citation resolves to the replacement part as a document.
    redirect = CFR_SUPERSESSIONS.get((title, part))
    if redirect:
        new_title, new_part = redirect
        return {
            "title": new_title,
            "section": str(new_part),
            "part": new_part,
            "redirected_from": {"title": title, "section": section, "part": part},
        }

    return {"title": title, "section": section, "part": part}


def resolve_reference(
    ref: ReferenceMatch,
    source_section_id: str,
    source_document_id: str,
    preferred_document_id: str | None = None,
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
                f"MATCH (d:Document {{policy_number: $pn}}) "
                f"RETURN d.id {_CANONICAL_DOCUMENT_ORDER}",
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
                f"RETURN d.id {_CANONICAL_DOCUMENT_ORDER}",
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
                f"RETURN d.id {_CANONICAL_DOCUMENT_ORDER}",
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
            target_documents = []
            if preferred_document_id and preferred_document_id != source_document_id:
                target_documents.append(preferred_document_id)
            target_documents.append(source_document_id)

            for target_document_id in target_documents:
                section_id = _resolve_section_in_document(
                    session,
                    target_document_id,
                    ref.target_id,
                    title_hint=ref.target_id,
                )
                if section_id:
                    return {
                        "resolved": True,
                        "target_node_id": section_id,
                        "target_type": "section",
                        "edge_type": "REFERENCES",
                    }

        elif ref.ref_type == "attachment":
            section_num = f"Attachment {ref.target_id}"
            section_id = _resolve_section_in_document(
                session,
                source_document_id,
                section_num,
                title_hint=section_num,
            )
            if section_id:
                return {
                    "resolved": True,
                    "target_node_id": section_id,
                    "target_type": "section",
                    "edge_type": "REFERENCES",
                }

        elif ref.ref_type == "spa":
            candidates = _spa_candidates(ref.target_id)
            result = session.run(
                "MATCH (d:Document) "
                "WHERE d.document_type = 'state_plan_amendment' "
                "AND (toUpper(coalesce(d.policy_number, '')) IN $candidates "
                "     OR any(candidate IN $candidates WHERE toUpper(coalesce(d.title, '')) CONTAINS candidate)) "
                f"RETURN d.id {_CANONICAL_DOCUMENT_ORDER}",
                {"candidates": candidates},
            )
            record = result.single()
            if record:
                return {
                    "resolved": True,
                    "target_node_id": record["d.id"],
                    "target_type": "document",
                    "edge_type": "REFERENCES_DOCUMENT",
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
                f"MATCH (d:Document {{policy_number: $pn}}) "
                f"RETURN d.id {_CANONICAL_DOCUMENT_ORDER}",
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


def _resolve_reference_edge(
    ref: ReferenceMatch,
    section_id: str,
    document_id: str,
    stats: dict,
    unresolved: list[dict],
    *,
    preferred_document_id: str | None = None,
    resolution: dict | None = None,
) -> ReferenceEdge | None:
    """Resolve a single reference and return the edge payload if successful."""
    resolution = resolution or resolve_reference(
        ref,
        section_id,
        document_id,
        preferred_document_id=preferred_document_id,
    )

    if resolution["resolved"]:
        # Skip self-references (section linking back to its own document)
        target_id = resolution["target_node_id"]
        if resolution["target_type"] == "document" and target_id == document_id:
            return None
        if resolution["target_type"] == "section" and target_id == section_id:
            return None

        stats["resolved"] += 1
        return ReferenceEdge(
            source_id=section_id,
            target_id=resolution["target_node_id"],
            edge_type=resolution["edge_type"],
            reference_text=ref.matched_text,
            reference_type=ref.ref_type if resolution["edge_type"] == "REFERENCES" else None,
            extraction_method=ref.extraction_method,
        )
    else:
        stats["unresolved"] += 1
        unresolved.append({
            "source_section": section_id,
            "ref_type": ref.ref_type,
            "target_id": ref.target_id,
            "matched_text": ref.matched_text,
            "extraction_method": ref.extraction_method,
        })
        return None


def _pick_contextual_target_document_id(
    ref_index: int,
    refs: list[ReferenceMatch],
    contextual_documents: dict[int, str],
) -> str | None:
    ref = refs[ref_index]
    if ref.ref_type != "section":
        return None

    candidates: list[tuple[int, int, int, str]] = []
    for other_index, document_id in contextual_documents.items():
        if other_index == ref_index:
            continue

        other = refs[other_index]
        precedes = 0 if other.end <= ref.start else 1
        distance = (
            ref.start - other.end
            if other.end <= ref.start
            else abs(other.start - ref.end)
        )
        candidates.append((precedes, distance, abs(other_index - ref_index), document_id))

    if not candidates:
        return None

    candidates.sort()
    return candidates[0][3]


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
    resolved_edges: list[ReferenceEdge] = []

    # Phase 1: Regex extraction
    for record in sections:
        section_id = record["s.id"]
        document_id = record["s.document_id"]
        content = record["s.content_text"] or ""

        refs = extract_references(content)
        stats["extracted"] += len(refs)

        precomputed_resolutions: dict[int, dict] = {}
        contextual_documents: dict[int, str] = {}
        for ref_index, ref in enumerate(refs):
            if ref.ref_type in _CONTEXTUAL_DOCUMENT_REF_TYPES:
                resolution = resolve_reference(ref, section_id, document_id)
                precomputed_resolutions[ref_index] = resolution
                if resolution["resolved"] and resolution["target_type"] == "document":
                    contextual_documents[ref_index] = resolution["target_node_id"]

        for ref_index, ref in enumerate(refs):
            preferred_document_id = _pick_contextual_target_document_id(
                ref_index,
                refs,
                contextual_documents,
            )
            edge = _resolve_reference_edge(
                ref,
                section_id,
                document_id,
                stats,
                unresolved,
                preferred_document_id=preferred_document_id,
                resolution=precomputed_resolutions.get(ref_index),
            )
            if edge:
                resolved_edges.append(edge)
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
                edge = _resolve_reference_edge(ref, section_id, document_id, llm_stats, llm_unresolved)
                if edge:
                    resolved_edges.append(edge)

        stats["llm_extracted"] = llm_stats["extracted"]
        stats["llm_resolved"] = llm_stats["resolved"]
        stats["llm_unresolved"] = llm_stats["unresolved"]
        unresolved.extend(llm_unresolved)

    graph_writer.merge_reference_edges(resolved_edges)

    # Save unresolved references
    unresolved_path = PARSED_DATA_DIR.parent / "unresolved-references.json"
    unresolved_path.write_text(json.dumps(unresolved, indent=2))

    return stats
