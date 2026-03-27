"""Link PolicyConcept nodes to Section nodes based on content matching."""

import re

from rich.console import Console
from rich.progress import track

from pipeline.graph.connection import get_session
from pipeline.concepts.seed import SEED_CONCEPTS, slugify

console = Console()


def _determine_relationship(section_title: str | None) -> str:
    """Determine the relationship type based on section heading context."""
    if not section_title:
        return "COVERS"
    title_lower = section_title.lower()
    if "definition" in title_lower:
        return "DEFINES"
    if any(w in title_lower for w in ("coverage", "service", "covered")):
        return "COVERS"
    if any(w in title_lower for w in ("limitation", "exclusion", "restriction", "not covered")):
        return "RESTRICTS"
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
    edges_to_create: list[tuple[str, str, str]] = []  # (section_id, concept_id, rel_type)

    for record in track(sections, description="Scanning sections..."):
        section_id = record["s.id"]
        section_title = record["s.title"]
        content = (record["s.content_text"] or "").lower()

        if not content:
            continue

        rel_type = _determine_relationship(section_title)

        for concept_id, concept_name, terms in search_map:
            found = any(
                re.search(r"\b" + re.escape(term.lower()) + r"\b", content)
                for term in terms
            )
            if found:
                edges_to_create.append((section_id, concept_id, rel_type))

    # Batch write all edges
    with get_session() as session:
        for sid, cid, rel_type in edges_to_create:
            session.run(f"""
                MATCH (s:Section {{id: $sid}})
                MATCH (c:PolicyConcept {{id: $cid}})
                MERGE (s)-[:{rel_type}]->(c)
            """, {"sid": sid, "cid": cid})
            stats["edges_created"] += 1

    return stats
