"""Load parsed Docling JSON into Neo4j as Document and Section nodes."""

import json
from pathlib import Path

from docling_core.types.doc import DoclingDocument, DocItemLabel
from rich.console import Console

from pipeline.config import PARSED_DATA_DIR, CRAWLER_DB_PATH, SOURCE_TYPE_DIRS
from pipeline.parse.post_process import (
    extract_section_number,
    infer_level_from_number,
    build_section_id,
    build_document_id,
)
from pipeline.graph.connection import get_session
from pipeline.graph import queries

console = Console()


def walk_docling_document(doc_dict: dict) -> list[dict]:
    """
    Walk a Docling document dict and extract raw items.

    Returns a list of item dicts with label and text.
    """
    doc = DoclingDocument.model_validate(doc_dict)
    items = []
    for item, level in doc.iterate_items():
        label = getattr(item, "label", None)
        text = getattr(item, "text", "") or ""
        items.append({"label": label, "text": text, "level": level, "item": item})
    return items


def build_sections_from_items(doc_dict: dict, document_id: str) -> list[dict]:
    """
    Walk a Docling document dict and extract sections with content.

    Returns a list of section dicts suitable for Neo4j node creation.
    """
    doc = DoclingDocument.model_validate(doc_dict)
    sections: list[dict] = []
    current_section: dict | None = None
    section_index = 0

    for item, level in doc.iterate_items():
        label = getattr(item, "label", None)
        text = getattr(item, "text", "") or ""

        if label in (DocItemLabel.SECTION_HEADER, DocItemLabel.TITLE):
            # Save previous section
            if current_section and current_section["content_text"].strip():
                sections.append(current_section)

            section_number = extract_section_number(text)
            inferred_level = infer_level_from_number(section_number) or level
            sec_id = build_section_id(document_id, section_number, section_index)
            section_index += 1

            current_section = {
                "id": sec_id,
                "document_id": document_id,
                "section_number": section_number,
                "title": text.strip(),
                "level": inferred_level,
                "content_text": "",
                "content_length": 0,
                "has_tables": False,
                "has_definitions": False,
                "parent_id": None,
                "prev_sibling_id": None,
            }

            # Check if this is a definitions section
            title_lower = text.strip().lower()
            if "definition" in title_lower:
                current_section["has_definitions"] = True

        elif label == DocItemLabel.TABLE:
            if current_section:
                # Export table to markdown and append to section content
                try:
                    table_item = item
                    df = table_item.export_to_dataframe(doc=doc)
                    table_md = df.to_markdown(index=False)
                    current_section["content_text"] += f"\n\n{table_md}\n"
                    current_section["has_tables"] = True
                except Exception:
                    current_section["content_text"] += "\n\n[table extraction failed]\n"
                    current_section["has_tables"] = True

        elif label in (DocItemLabel.PARAGRAPH, DocItemLabel.LIST_ITEM):
            if current_section:
                current_section["content_text"] += f"\n{text}"
            elif text.strip():
                # Content before the first section heading — create an implicit section
                if not current_section:
                    sec_id = build_section_id(document_id, None, section_index)
                    section_index += 1
                    current_section = {
                        "id": sec_id,
                        "document_id": document_id,
                        "section_number": None,
                        "title": None,
                        "level": 0,
                        "content_text": text,
                        "content_length": 0,
                        "has_tables": False,
                        "has_definitions": False,
                        "parent_id": None,
                        "prev_sibling_id": None,
                    }

    # Don't forget the last section
    if current_section and current_section["content_text"].strip():
        sections.append(current_section)

    # Set content_length
    for s in sections:
        s["content_text"] = s["content_text"].strip()
        s["content_length"] = len(s["content_text"])

    # Build hierarchy (parent_id and prev_sibling_id)
    _assign_hierarchy(sections)

    return sections


def _assign_hierarchy(sections: list[dict]):
    """Assign parent_id and prev_sibling_id based on level."""
    stack: list[dict] = []  # Stack of ancestor sections
    prev_at_level: dict[int, str] = {}  # Last section ID at each level

    for section in sections:
        level = section["level"]

        # Pop stack until we find the parent
        while stack and stack[-1]["level"] >= level:
            stack.pop()

        if stack:
            section["parent_id"] = stack[-1]["id"]

        # Track siblings at this level
        if level in prev_at_level:
            section["prev_sibling_id"] = prev_at_level[level]
        prev_at_level[level] = section["id"]

        # Clear sibling tracking for deeper levels
        for deeper in list(prev_at_level.keys()):
            if deeper > level:
                del prev_at_level[deeper]

        stack.append(section)


def read_crawler_metadata(source_type: str, filename_stem: str) -> dict:
    """Read metadata from the crawler's SQLite registry."""
    import sqlite3

    if not CRAWLER_DB_PATH.exists():
        return {}

    conn = sqlite3.connect(str(CRAWLER_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT * FROM documents WHERE source_type = ? AND local_path LIKE ?",
            (source_type, f"%{filename_stem}%"),
        ).fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()


def load_document(json_path: Path, source_type: str) -> dict:
    """Load a single parsed document into Neo4j. Returns stats."""
    meta_path = json_path.with_suffix("").with_suffix(".meta.json")
    doc_dict = json.loads(json_path.read_text())
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}

    # Read crawler metadata
    crawler_meta = read_crawler_metadata(source_type, json_path.stem)

    # Build document ID
    policy_number = crawler_meta.get("policy_number")
    doc_id = build_document_id(source_type, policy_number, json_path.stem)

    # Build sections
    sections = build_sections_from_items(doc_dict, doc_id)

    with get_session() as session:
        # MERGE document node
        session.run(queries.MERGE_DOCUMENT, {
            "id": doc_id,
            "title": crawler_meta.get("title", json_path.stem),
            "document_type": source_type,
            "policy_number": policy_number,
            "category": crawler_meta.get("category"),
            "status": "current",
            "source_url": crawler_meta.get("source_url", ""),
            "local_path": str(json_path),
            "pdf_path": meta.get("source_pdf", ""),
            "page_count": meta.get("page_count", 0),
            "section_count": len(sections),
        })

        # MERGE section nodes and edges
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

            # PARENT_OF edge
            if section["parent_id"]:
                session.run(queries.MERGE_PARENT_OF, {
                    "parent_id": section["parent_id"],
                    "child_id": section["id"],
                })

            # NEXT_SIBLING edge
            if section["prev_sibling_id"]:
                session.run(queries.MERGE_NEXT_SIBLING, {
                    "prev_id": section["prev_sibling_id"],
                    "next_id": section["id"],
                })

    return {
        "document_id": doc_id,
        "sections": len(sections),
    }


def load_all(source_type: str | None = None, reset: bool = False) -> dict:
    """Load all parsed documents into Neo4j."""
    from pipeline.graph.schema import ensure_schema, reset_database

    if reset:
        console.print("[yellow]Resetting database...[/yellow]")
        reset_database()

    ensure_schema()

    stats = {"loaded": 0, "sections_total": 0, "errors": 0}

    if source_type:
        dirs = [(source_type, SOURCE_TYPE_DIRS.get(source_type, source_type))]
    else:
        dirs = list(SOURCE_TYPE_DIRS.items())

    for st, dir_name in dirs:
        parsed_dir = PARSED_DATA_DIR / dir_name
        if not parsed_dir.exists():
            continue

        json_files = sorted(parsed_dir.glob("*.json"))
        # Exclude .meta.json files
        json_files = [f for f in json_files if not f.name.endswith(".meta.json")]

        for json_path in json_files:
            try:
                console.print(f"  Loading {json_path.name}...", end=" ")
                result = load_document(json_path, st)
                console.print(f"[green]OK[/green] ({result['sections']} sections)")
                stats["loaded"] += 1
                stats["sections_total"] += result["sections"]
            except Exception as e:
                console.print(f"[red]ERROR: {e}[/red]")
                stats["errors"] += 1

    return stats
