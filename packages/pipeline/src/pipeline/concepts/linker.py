"""Link PolicyConcept nodes to Section nodes based on content matching."""

import re

from rich.console import Console
from rich.progress import track

from pipeline.graph.connection import get_session
from pipeline.graph.corpus_types import ConceptLink
from pipeline.graph.corpus_writer import graph_writer
from pipeline.concepts.seed import SEED_CONCEPTS, slugify

console = Console()

# Acronym terms (all-caps, e.g. "PA", "POC", "PACE", "DME") must match
# case-sensitively, otherwise they collide with common English words
# ("pace", "at home", ...). Genuinely ambiguous acronyms — e.g. "HHS" for
# Home Health Services, which the federal department dominates in this
# corpus — are not aliases at all (see pipeline.concepts.seed).
MIN_ACRONYM_LENGTH = 2

# Minimum term length for case-insensitive matching
MIN_ALIAS_LENGTH = 3


def _is_acronym(term: str) -> bool:
    """True for all-caps terms like 'PA', 'PACE', 'CAP/DA', 'M-AA'."""
    return term.isupper()


def _build_term_pattern(term: str) -> re.Pattern[str] | None:
    """Compile a whole-word pattern for a concept term.

    Acronyms match case-sensitively; everything else case-insensitively.
    Returns None for terms too short to match safely.
    """
    min_length = MIN_ACRONYM_LENGTH if _is_acronym(term) else MIN_ALIAS_LENGTH
    if len(term) < min_length:
        return None
    flags = 0 if _is_acronym(term) else re.IGNORECASE
    return re.compile(r"\b" + re.escape(term) + r"\b", flags)


def _determine_relationship(section_title: str | None) -> str:
    """Determine the relationship type based on section heading context."""
    if not section_title:
        return "COVERS"
    title_lower = section_title.lower()
    if "definition" in title_lower:
        return "DEFINES"
    # Check restrictive patterns BEFORE permissive ones — "Services Not Covered"
    # must match RESTRICTS, not COVERS
    if any(w in title_lower for w in ("limitation", "exclusion", "restriction", "not covered", "non-covered", "noncovered")):
        return "RESTRICTS"
    if any(w in title_lower for w in ("coverage", "service", "covered")):
        return "COVERS"
    return "COVERS"


def link_concepts() -> dict:
    """Link concepts to sections based on keyword matching."""
    stats = {"edges_created": 0}

    # Build search patterns: concept_id → compiled whole-word patterns
    search_map: list[tuple[str, str, list[re.Pattern[str]]]] = []
    for concept in SEED_CONCEPTS:
        concept_id = f"concept:{slugify(concept['name'])}"
        terms = [concept["name"]] + concept["aliases"]
        patterns = [
            pattern
            for pattern in (_build_term_pattern(term) for term in terms)
            if pattern is not None
        ]
        search_map.append((concept_id, concept["name"], patterns))

    # Get all sections
    with get_session() as session:
        result = session.run(
            "MATCH (s:Section) RETURN s.id, s.title, s.content_text"
        )
        sections = list(result)

    console.print(f"Linking {len(search_map)} concepts to {len(sections)} sections...")

    # Collect all edges to create, then batch-write in a single session
    edges_to_create: set[tuple[str, str, str]] = set()

    for record in track(sections, description="Scanning sections..."):
        section_id = record["s.id"]
        section_title = record["s.title"]
        content_raw = record["s.content_text"] or ""

        if not content_raw:
            continue

        rel_type = _determine_relationship(section_title)

        for concept_id, _concept_name, patterns in search_map:
            if any(pattern.search(content_raw) for pattern in patterns):
                edges_to_create.add((section_id, concept_id, rel_type))

    concept_links = [
        ConceptLink(section_id=sid, concept_id=cid, relationship_type=edge_rel_type)
        for sid, cid, edge_rel_type in sorted(edges_to_create)
    ]
    stats["edges_created"] = graph_writer.merge_concept_links(concept_links)

    return stats
