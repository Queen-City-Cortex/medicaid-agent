"""Resolve extracted references to Neo4j graph nodes."""

import json
import re

from pipeline.graph.connection import get_session
from pipeline.graph.corpus_types import ReferenceEdge
from pipeline.graph.corpus_writer import graph_writer
from pipeline.references.citations import (
    CFR_CITATION_RE,
    federal_regulation_doc_id,
    federal_statute_doc_id,
)
from pipeline.references.extractor import ReferenceMatch
from pipeline.references.supersessions import CfrSupersession, load_cfr_supersessions
from pipeline.config import PARSED_DATA_DIR

# Superseded CFR parts: old → current. Citations to the old part resolve to the
# replacement part instead. The shared loader keeps the effective/reason
# provenance, which the federal loader writes to the graph; the resolver only
# needs the replacement tuple.
CFR_SUPERSESSIONS: dict[tuple[int, int], CfrSupersession] = load_cfr_supersessions()

# A section reference names another policy only through one of these literal
# connectives, matched against the whole text between the two citations:
# "Section 5.0 of clinical coverage policy 10A" and "Clinical Coverage Policy
# 3K-2, Section 5.1". Proximity alone bound revision-table rows and unrelated
# sentences to whichever policy happened to be mentioned nearby.
_SECTION_OF_POLICY_RE = re.compile(r"\s+of\s+(?:the\s+)?(?:NC\s+)?(?:Medicaid\s+)?")
_POLICY_THEN_SECTION_RE = re.compile(r",\s*")

_WAIVER_AUTHORITY_RE = re.compile(r"1915\s*\(([a-zA-Z])\)")

_CANONICAL_DOCUMENT_ORDER = (
    "ORDER BY "
    "CASE WHEN toUpper(COALESCE(d.title, '')) CONTAINS 'CHANGE NOTICE' THEN 1 ELSE 0 END, "
    "CASE WHEN COALESCE(d.status, '') = 'amendment' THEN 1 ELSE 0 END, "
    "CASE WHEN d.effective_date IS NULL THEN 1 ELSE 0 END, "
    "d.effective_date DESC, "
    "COALESCE(d.change_year, 0) DESC, "
    "COALESCE(d.change_sequence, 0) DESC, "
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
        new_title, new_part = redirect.new_title, redirect.new_part
        return {
            "title": new_title,
            "section": str(new_part),
            "part": new_part,
            "redirected_from": {"title": title, "section": section, "part": part},
        }

    return {"title": title, "section": section, "part": part}


def _document_result(node_id: str) -> dict:
    """Successful resolution payload for a document-level target."""
    return {
        "resolved": True,
        "target_node_id": node_id,
        "target_type": "document",
        "edge_type": "REFERENCES_DOCUMENT",
    }


def _section_result(node_id: str) -> dict:
    """Successful resolution payload for a section-level target."""
    return {
        "resolved": True,
        "target_node_id": node_id,
        "target_type": "section",
        "edge_type": "REFERENCES",
    }


def _unresolved_result() -> dict:
    return {
        "resolved": False,
        "target_node_id": None,
        "target_type": None,
        "edge_type": None,
    }


def _find_canonical_document(session, match_clause: str, params: dict) -> str | None:
    """Run a document MATCH clause with the canonical ordering; return d.id or None."""
    result = session.run(
        f"{match_clause}RETURN d.id {_CANONICAL_DOCUMENT_ORDER}",
        params,
    )
    record = result.single()
    return record["d.id"] if record else None


def _find_document_by_id(session, doc_id: str) -> str | None:
    result = session.run(
        "MATCH (d:Document {id: $doc_id}) RETURN d.id",
        {"doc_id": doc_id},
    )
    record = result.single()
    return record["d.id"] if record else None


def _find_section_by_number(session, doc_id: str, section_number: str) -> str | None:
    result = session.run(
        "MATCH (s:Section {document_id: $doc_id, section_number: $sn}) RETURN s.id",
        {"doc_id": doc_id, "sn": section_number},
    )
    record = result.single()
    return record["s.id"] if record else None


def _resolve_cross_document(session, ref, source_document_id, bound_document_id):
    # 1. Exact match on policy_number
    doc_id = _find_canonical_document(
        session,
        "MATCH (d:Document {policy_number: $pn}) ",
        {"pn": ref.target_id},
    )
    if doc_id:
        return _document_result(doc_id)

    # 2. Normalized match (strip hyphens): "1-H" matches "1H", "8-D2" matches "8D-2"
    normalized = ref.target_id.replace("-", "")
    doc_id = _find_canonical_document(
        session,
        "MATCH (d:Document) "
        "WHERE REPLACE(d.policy_number, '-', '') = $normalized ",
        {"normalized": normalized},
    )
    if doc_id:
        return _document_result(doc_id)

    # A family citation ("11A", "5A") names no single sibling, so it stays
    # unresolved rather than being linked to one of them.
    return None


def _resolve_section(session, ref, source_document_id, bound_document_id):
    # A reference bound to another policy resolves there or not at all, and by
    # exact section number only: the title fallback would match "3.1.1" inside
    # that policy's "5.3.1.1".
    if bound_document_id and bound_document_id != source_document_id:
        section_id = _resolve_section_in_document(
            session,
            bound_document_id,
            ref.target_id,
        )
    else:
        section_id = _resolve_section_in_document(
            session,
            source_document_id,
            ref.target_id,
            title_hint=ref.target_id,
        )
    if section_id:
        return _section_result(section_id)

    return None


def _resolve_attachment(session, ref, source_document_id, bound_document_id):
    section_num = f"Attachment {ref.target_id}"
    section_id = _resolve_section_in_document(
        session,
        source_document_id,
        section_num,
        title_hint=section_num,
    )
    if section_id:
        return _section_result(section_id)

    return None


def _resolve_spa(session, ref, source_document_id, bound_document_id):
    candidates = _spa_candidates(ref.target_id)
    doc_id = _find_canonical_document(
        session,
        "MATCH (d:Document) "
        "WHERE d.document_type = 'state_plan_amendment' "
        "AND (toUpper(coalesce(d.policy_number, '')) IN $candidates "
        "     OR any(candidate IN $candidates WHERE toUpper(coalesce(d.title, '')) CONTAINS candidate)) ",
        {"candidates": candidates},
    )
    if doc_id:
        return _document_result(doc_id)

    return None


def _resolve_federal(session, ref, source_document_id, bound_document_id):
    # Handle SSA-Title references (LLM outputs like "SSA-Title-19")
    ssa_match = re.match(r"^SSA-Title-(\d+|XIX|XXI?)$", ref.target_id, re.IGNORECASE)
    if ssa_match:
        raw = ssa_match.group(1)
        roman_map = {"XIX": 19, "XXI": 21, "XX": 20}
        title_num = roman_map.get(raw.upper()) or int(raw)
        found_id = _find_document_by_id(session, federal_statute_doc_id(title_num))
        if found_id:
            return _document_result(found_id)

    # Try standard CFR parse: "42 CFR 440.70"
    parsed = parse_cfr_citation(ref.target_id)

    # Fallback: normalize LLM hyphenated format "42-CFR-441" → "42 CFR 441"
    if not parsed:
        cfr_norm = re.match(r"^(\d+)-CFR-(.+)$", ref.target_id)
        if cfr_norm:
            normalized = f"{cfr_norm.group(1)} CFR {cfr_norm.group(2)}"
            parsed = parse_cfr_citation(normalized)

    if parsed:
        doc_id = federal_regulation_doc_id(parsed["title"], parsed["part"])

        # Section-level resolution (has dot in section number)
        if "." in parsed["section"]:
            section_id = _find_section_by_number(session, doc_id, parsed["section"])
            if section_id:
                return _section_result(section_id)

        # Document-level fallback (e.g., "42-CFR-441" with no specific section)
        found_id = _find_document_by_id(session, doc_id)
        if found_id:
            return _document_result(found_id)

    return None


def _resolve_ssa_section(session, ref, source_document_id, bound_document_id):
    for title_num in [19, 21]:
        doc_id = federal_statute_doc_id(title_num)
        section_id = _find_section_by_number(session, doc_id, ref.target_id)
        if section_id:
            return _section_result(section_id)

    return None


def _resolve_waiver(session, ref, source_document_id, bound_document_id):
    # "1915(c)" cites the statutory authority, not one of the waiver documents
    # that share it as a policy number. "1915 (C)" → "1915(c)"; the parent
    # section stands in when the statute was loaded without that subsection.
    match = _WAIVER_AUTHORITY_RE.search(ref.target_id)
    if not match:
        return None

    doc_id = federal_statute_doc_id(19)
    for section_number in (f"1915({match.group(1).lower()})", "1915"):
        section_id = _find_section_by_number(session, doc_id, section_number)
        if section_id:
            return _section_result(section_id)

    return None


# Per-ref_type resolution handlers, each (session, ref, source_document_id,
# bound_document_id) -> resolution dict | None (None means unresolved).
_REF_TYPE_HANDLERS = {
    "cross_document": _resolve_cross_document,
    "section": _resolve_section,
    "attachment": _resolve_attachment,
    "spa": _resolve_spa,
    "federal_regulation": _resolve_federal,
    "federal_statute": _resolve_federal,
    "ssa_section": _resolve_ssa_section,
    "waiver": _resolve_waiver,
}


def resolve_reference(
    ref: ReferenceMatch,
    source_document_id: str,
    bound_document_id: str | None = None,
) -> dict:
    """
    Attempt to resolve a reference to a graph node.

    ``bound_document_id`` is the policy a section reference literally names;
    such a reference resolves in that policy only.

    Returns a dict with resolution result:
    {
        "resolved": bool,
        "target_node_id": str | None,
        "target_type": "section" | "document" | None,
        "edge_type": str,
        }
    """
    handler = _REF_TYPE_HANDLERS.get(ref.ref_type)
    if handler:
        with get_session() as session:
            resolution = handler(session, ref, source_document_id, bound_document_id)
            if resolution:
                return resolution

    return _unresolved_result()


def _resolve_reference_edge(
    ref: ReferenceMatch,
    section_id: str,
    document_id: str,
    stats: dict,
    unresolved: list[dict],
    *,
    resolution: dict | None = None,
) -> ReferenceEdge | None:
    """Resolve a single reference and return the edge payload if successful."""
    resolution = resolution or resolve_reference(ref, document_id)

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


def _bound_policy_index(
    ref_index: int,
    refs: list[ReferenceMatch],
    text: str,
) -> int | None:
    """Index of the policy citation a section reference is literally joined to."""
    ref = refs[ref_index]
    if ref.ref_type != "section":
        return None

    for other_index, other in enumerate(refs):
        if other.ref_type != "cross_document":
            continue
        if other.start >= ref.end and _SECTION_OF_POLICY_RE.fullmatch(
            text, ref.end, other.start
        ):
            return other_index
        if other.end <= ref.start and _POLICY_THEN_SECTION_RE.fullmatch(
            text, other.end, ref.start
        ):
            return other_index

    return None


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

        resolutions: dict[int, dict] = {
            ref_index: resolve_reference(ref, document_id)
            for ref_index, ref in enumerate(refs)
            if ref.ref_type == "cross_document"
        }
        for ref_index, ref in enumerate(refs):
            policy_index = _bound_policy_index(ref_index, refs, content)
            if policy_index is not None:
                # The policy named beside the section decides the target. If
                # that policy is unknown the reference is unresolved; falling
                # back to the citing document would invent a link.
                policy = resolutions[policy_index]
                resolutions[ref_index] = (
                    resolve_reference(
                        ref,
                        document_id,
                        bound_document_id=policy["target_node_id"],
                    )
                    if policy["resolved"]
                    else _unresolved_result()
                )

        for ref_index, ref in enumerate(refs):
            edge = _resolve_reference_edge(
                ref,
                section_id,
                document_id,
                stats,
                unresolved,
                resolution=resolutions.get(ref_index),
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

    graph_writer.rebuild_reference_edges(resolved_edges)

    # Save unresolved references
    unresolved_path = PARSED_DATA_DIR.parent / "unresolved-references.json"
    unresolved_path.write_text(json.dumps(unresolved, indent=2))

    return stats
