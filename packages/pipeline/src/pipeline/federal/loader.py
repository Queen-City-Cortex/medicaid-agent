"""Load parsed CFR sections into Neo4j."""

from rich.console import Console

from pipeline.config import CFR_PARTS
from pipeline.federal.ecfr_client import fetch_part_xml
from pipeline.federal.parser import parse_part_xml
from pipeline.graph.corpus_types import DocumentBundle, DocumentNode, SectionNode
from pipeline.graph.corpus_writer import graph_writer
from pipeline.graph.schema import ensure_schema

console = Console()


def _add_sequential_siblings(sections: list[dict]) -> list[dict]:
    """Annotate sequential sections with NEXT_SIBLING-compatible pointers."""
    prev_section_id = None
    for section in sections:
        section["prev_sibling_id"] = prev_section_id
        prev_section_id = section["id"]
    return sections


def _build_federal_document_bundle(
    *,
    document_id: str,
    title: str,
    document_type: str,
    policy_number: str,
    source_url: str,
    sections: list[dict],
) -> DocumentBundle:
    section_nodes = [
        SectionNode(
            id=section["id"],
            document_id=document_id,
            section_number=section.get("section_number"),
            title=section.get("title"),
            level=section.get("level", 0),
            content_text=section.get("content_text", ""),
            content_length=section.get("content_length", 0),
            has_tables=section.get("has_tables", False),
            has_definitions=section.get("has_definitions", False),
            parent_id=section.get("parent_id"),
            prev_sibling_id=section.get("prev_sibling_id"),
            federal_register_cite=section.get("federal_register_cite"),
            last_revised=section.get("last_revised"),
        )
        for section in sections
    ]

    return DocumentBundle(
        document=DocumentNode(
            id=document_id,
            title=title,
            document_type=document_type,
            policy_number=policy_number,
            category="federal",
            status="current",
            source_url=source_url,
            local_path="",
            pdf_path="",
            page_count=0,
            section_count=len(section_nodes),
            effective_date=None,
            authority_tier="authoritative",
            answer_role="federal_authority",
            source_format="xml",
            answer_ready=True,
        ),
        sections=section_nodes,
    )


def load_cfr_part(title: int, part: int, refresh: bool = False) -> dict:
    """Fetch, parse, and load one CFR part into Neo4j. Returns stats."""
    xml_text = fetch_part_xml(title, part, refresh=refresh)
    sections = _add_sequential_siblings(parse_part_xml(xml_text, title, part))

    doc_id = f"doc:federal_regulation:{title}-CFR-{part}"
    graph_writer.upsert_document_bundle(
        _build_federal_document_bundle(
            document_id=doc_id,
            title=f"{title} CFR Part {part}",
            document_type="federal_regulation",
            policy_number=f"{title}-CFR-{part}",
            source_url=f"https://www.ecfr.gov/current/title-{title}/part-{part}",
            sections=sections,
        )
    )

    return {
        "document_id": doc_id,
        "sections": len(sections),
    }


def load_ssa(refresh: bool = False) -> dict:
    """Fetch, parse, and load SSA Title XIX and XXI into Neo4j.

    Uses uscode.house.gov (ssa.gov blocks automated access).
    Section numbers are SSA-style (1902, 1905) since that's what
    NC Medicaid documents cite.
    """
    from pipeline.federal.ssa_client import fetch_usc_subchapter
    from pipeline.federal.ssa_parser import parse_usc_subchapter
    from pipeline.graph.schema import ensure_schema

    ensure_schema()
    stats = {"titles_loaded": 0, "sections_total": 0, "errors": 0}

    for title_num in [19, 21]:
        doc_id = f"doc:federal_statute:ssa-title-{title_num}"
        title_name = "XIX" if title_num == 19 else "XXI"
        program = "Medicaid" if title_num == 19 else "CHIP"
        console.print(f"  SSA Title {title_name} ({program})...", end=" ")

        try:
            html = fetch_usc_subchapter(title_num, refresh=refresh)
            section_list = _add_sequential_siblings(parse_usc_subchapter(html, title_num))
            graph_writer.upsert_document_bundle(
                _build_federal_document_bundle(
                    document_id=doc_id,
                    title=f"Social Security Act — Title {title_name} ({program})",
                    document_type="federal_statute",
                    policy_number=f"SSA-Title-{title_num}",
                    source_url=f"https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title42-chapter7-subchapter{title_num}",
                    sections=section_list,
                )
            )
            stats["sections_total"] += len(section_list)

            console.print(f"[green]OK[/green] ({len(section_list)} sections)")
            stats["titles_loaded"] += 1

        except Exception as e:
            console.print(f"[red]ERROR: {e}[/red]")
            stats["errors"] += 1

    return stats


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
