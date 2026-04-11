"""Link PolicyConcept nodes to Section nodes based on content matching."""

import re

from rich.console import Console
from rich.progress import track

from pipeline.graph.connection import get_session
from pipeline.graph.corpus_types import ConceptLink
from pipeline.graph.corpus_writer import graph_writer
from pipeline.concepts.seed import SEED_CONCEPTS, slugify

console = Console()

# Short aliases that match common English words — require case-sensitive match
# to avoid false positives like "at home" matching Assistive Technology
CASE_SENSITIVE_ALIASES = {"PA", "POC", "HHS", "MAA", "MAB", "MAD"}

# Minimum alias length for case-insensitive matching
MIN_ALIAS_LENGTH = 3


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

    # Build search terms: concept_id → list of terms to search for
    search_map: list[tuple[str, str, list[str]]] = []
    for concept in SEED_CONCEPTS:
        concept_id = f"concept:{slugify(concept['name'])}"
        terms = [concept["name"]] + concept["aliases"]
        search_map.append((concept_id, concept["name"], terms))

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
        content_lower = content_raw.lower()

        if not content_lower:
            continue

        rel_type = _determine_relationship(section_title)

        for concept_id, concept_name, terms in search_map:
            found = False
            for term in terms:
                if term in CASE_SENSITIVE_ALIASES:
                    # Case-sensitive match for short ambiguous aliases
                    if re.search(r"\b" + re.escape(term) + r"\b", content_raw):
                        found = True
                        break
                elif len(term) < MIN_ALIAS_LENGTH:
                    # Skip very short aliases entirely — too many false positives
                    continue
                else:
                    if re.search(r"\b" + re.escape(term.lower()) + r"\b", content_lower):
                        found = True
                        break
            if found:
                edges_to_create.add((section_id, concept_id, rel_type))

    concept_links = [
        ConceptLink(section_id=sid, concept_id=cid, relationship_type=edge_rel_type)
        for sid, cid, edge_rel_type in sorted(edges_to_create)
    ]
    stats["edges_created"] = graph_writer.merge_concept_links(concept_links)

    return stats
