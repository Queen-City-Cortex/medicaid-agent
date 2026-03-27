"""Load parsed CFR sections into Neo4j."""

from rich.console import Console

from pipeline.config import CFR_PARTS
from pipeline.federal.ecfr_client import fetch_part_xml
from pipeline.federal.parser import parse_part_xml
from pipeline.graph.connection import get_session
from pipeline.graph import queries
from pipeline.graph.schema import ensure_schema

console = Console()


def load_cfr_part(title: int, part: int, refresh: bool = False) -> dict:
    """Fetch, parse, and load one CFR part into Neo4j. Returns stats."""
    xml_text = fetch_part_xml(title, part, refresh=refresh)
    sections = parse_part_xml(xml_text, title, part)

    doc_id = f"doc:federal_regulation:{title}-CFR-{part}"

    with get_session() as session:
        # MERGE document node
        session.run(queries.MERGE_DOCUMENT, {
            "id": doc_id,
            "title": f"{title} CFR Part {part}",
            "document_type": "federal_regulation",
            "policy_number": f"{title}-CFR-{part}",
            "category": "federal",
            "status": "current",
            "source_url": f"https://www.ecfr.gov/current/title-{title}/part-{part}",
            "local_path": "",
            "pdf_path": "",
            "page_count": 0,
            "section_count": len(sections),
        })

        # MERGE section nodes
        prev_section_id = None
        for section in sections:
            session.run(queries.MERGE_SECTION, {
                "id": section["id"],
                "document_id": doc_id,
                "section_number": section["section_number"],
                "title": section["title"],
                "level": section["level"],
                "content_text": section["content_text"],
                "content_length": section["content_length"],
                "has_tables": section["has_tables"],
                "has_definitions": section["has_definitions"],
            })

            # HAS_SECTION edge
            session.run(queries.MERGE_HAS_SECTION, {
                "doc_id": doc_id,
                "sec_id": section["id"],
            })

            # NEXT_SIBLING edge
            if prev_section_id:
                session.run(queries.MERGE_NEXT_SIBLING, {
                    "prev_id": prev_section_id,
                    "next_id": section["id"],
                })
            prev_section_id = section["id"]

    return {
        "document_id": doc_id,
        "sections": len(sections),
    }


def load_all_cfr(part_filter: int | None = None, refresh: bool = False) -> dict:
    """Load all configured CFR parts into Neo4j."""
    ensure_schema()

    stats = {"parts_loaded": 0, "sections_total": 0, "errors": 0}

    parts = CFR_PARTS
    if part_filter:
        parts = [(t, p) for t, p in parts if p == part_filter]

    console.print(f"[bold]Loading {len(parts)} CFR parts...[/bold]")

    for title, part in parts:
        try:
            console.print(f"  {title} CFR Part {part}...", end=" ")
            result = load_cfr_part(title, part, refresh=refresh)
            console.print(f"[green]OK[/green] ({result['sections']} sections)")
            stats["parts_loaded"] += 1
            stats["sections_total"] += result["sections"]
        except Exception as e:
            console.print(f"[red]ERROR: {e}[/red]")
            stats["errors"] += 1

    return stats
