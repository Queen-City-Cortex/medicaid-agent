"""Load parsed Docling JSON into Neo4j as Document and Section nodes."""

import json
import re
import sqlite3
from functools import lru_cache
from pathlib import Path

from docling_core.types.doc import DoclingDocument, DocItemLabel
from rich.console import Console

from pipeline.config import PARSED_DATA_DIR, CRAWLER_DATA_DIR, CRAWLER_DB_PATH, SOURCE_TYPE_DIRS
from pipeline.corpus_manifest import get_source_family
from pipeline.parse.post_process import (
    extract_section_number,
    infer_level_from_number,
    build_section_id,
    build_document_id,
)
from pipeline.graph.corpus_types import DocumentBundle, DocumentNode, SectionNode
from pipeline.graph.corpus_writer import graph_writer
from pipeline.source_selection import (
    build_source_selection_index,
    resolve_source_selection_metadata,
)

console = Console()
_DHHS_CHANGE_NOTICE_RE = re.compile(
    r"CHANGE\s+NOTICE\s+FOR\s+MANUAL\s+NO\.",
    re.IGNORECASE,
)


def build_sections_from_items(doc_dict: dict, document_id: str) -> list[dict]:
    """
    Walk a Docling document dict and extract sections with content.

    Returns a list of section dicts suitable for Neo4j node creation.
    """
    doc = DoclingDocument.model_validate(doc_dict)
    sections: list[dict] = []
    current_section: dict | None = None
    section_index = 0
    section_number_occurrences: dict[str, int] = {}

    for item, level in doc.iterate_items():
        label = getattr(item, "label", None)
        text = getattr(item, "text", "") or ""

        if label in (DocItemLabel.SECTION_HEADER, DocItemLabel.TITLE):
            # Save previous section (keep even if empty — preserves hierarchy)
            if current_section:
                sections.append(current_section)

            section_number = extract_section_number(text)
            inferred_level = infer_level_from_number(section_number) or level
            occurrence = 0
            if section_number:
                occurrence = section_number_occurrences.get(section_number, 0)
                section_number_occurrences[section_number] = occurrence + 1
            sec_id = build_section_id(document_id, section_number, section_index, occurrence)
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
            if not current_section:
                sec_id = build_section_id(document_id, None, section_index)
                section_index += 1
                current_section = {
                    "id": sec_id,
                    "document_id": document_id,
                    "section_number": None,
                    "title": None,
                    "level": 0,
                    "content_text": "",
                    "content_length": 0,
                    "has_tables": False,
                    "has_definitions": False,
                    "parent_id": None,
                    "prev_sibling_id": None,
                }

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

        elif label in (
            DocItemLabel.PARAGRAPH,
            DocItemLabel.LIST_ITEM,
            DocItemLabel.TEXT,
            DocItemLabel.FOOTNOTE,
            DocItemLabel.CAPTION,
            DocItemLabel.REFERENCE,
            DocItemLabel.CODE,
            DocItemLabel.FORMULA,
        ):
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
    if current_section:
        sections.append(current_section)

    # Set content_length
    for s in sections:
        s["content_text"] = s["content_text"].strip()
        s["content_length"] = len(s["content_text"])

    # Build hierarchy (parent_id and prev_sibling_id)
    _assign_hierarchy(sections)

    return sections


def build_sections_from_synthetic_items(doc_dict: dict, document_id: str) -> list[dict]:
    """Build sections from synthetic parser output for DOCX/XLSX sources."""
    raw_sections = doc_dict.get("synthetic_sections", [])
    sections: list[dict] = []
    section_number_occurrences: dict[str, int] = {}

    for index, raw_section in enumerate(raw_sections):
        section_number = raw_section.get("section_number")
        occurrence = 0
        if section_number:
            occurrence = section_number_occurrences.get(section_number, 0)
            section_number_occurrences[section_number] = occurrence + 1

        sections.append(
            {
                "id": build_section_id(document_id, section_number, index, occurrence),
                "document_id": document_id,
                "section_number": section_number,
                "title": raw_section.get("title"),
                "level": raw_section.get("level", 0),
                "content_text": (raw_section.get("content_text") or "").strip(),
                "content_length": len((raw_section.get("content_text") or "").strip()),
                "has_tables": raw_section.get("has_tables", False),
                "has_definitions": raw_section.get("has_definitions", False),
                "parent_id": None,
                "prev_sibling_id": None,
            }
        )

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


# Date extraction patterns
_DATE_MM_DD_YYYY = re.compile(r"(\d{2}/\d{2}/\d{4})")
_CHANGE_NOTICE_YEAR_RE = re.compile(
    r"CHANGE NOTICE FOR MANUAL NO\.\s*(\d{2})-(\d{2})", re.IGNORECASE
)


def _extract_effective_date(
    source_type: str, title: str, sections: list[dict],
) -> str | None:
    """Extract the most recent effective/amended date from a document.

    Returns ISO date string (YYYY-MM-DD) or None.
    """
    if source_type == "clinical_policy":
        # Find the History/Revision section and get the most recent date
        for sec in sections:
            sec_title = sec.get("title") or ""
            if "History" in sec_title or "Revision" in sec_title:
                content = sec.get("content_text") or ""
                dates = _DATE_MM_DD_YYYY.findall(content)
                if dates:
                    # Parse all dates, return the most recent
                    parsed = []
                    for d in dates:
                        try:
                            month, day, year = d.split("/")
                            parsed.append(f"{year}-{month}-{day}")
                        except ValueError:
                            continue
                    if parsed:
                        return max(parsed)  # lexicographic max = most recent

    elif source_type == "dhhs_policy":
        # Change notices: "CHANGE NOTICE FOR MANUAL NO. 01-24" → year 2024
        m = _CHANGE_NOTICE_YEAR_RE.search(title)
        if m:
            yy = int(m.group(2))   # 2-digit year
            year = 2000 + yy if yy < 50 else 1900 + yy
            return f"{year}-01-01"  # approximate: year + sequence only

    return None


# Matches 1915(c), 1915(i), 1916(b) etc. in waiver document titles
_WAIVER_ID_RE = re.compile(r"1915\s*\(([a-z])\)", re.IGNORECASE)
_SECTION_1916_RE = re.compile(r"(?:Section\s+)?1916\s*\(([a-z])\)", re.IGNORECASE)


def _extract_waiver_identifier(title: str) -> str | None:
    """Extract a waiver identifier like '1915(c)' from a document title."""
    m = _WAIVER_ID_RE.search(title)
    if m:
        return f"1915({m.group(1).lower()})"
    m = _SECTION_1916_RE.search(title)
    if m:
        return f"1916({m.group(1).lower()})"
    return None


# Matches MA-2270, DMA-5097, DHB-5097, DSS-8110 at the start of a title
_DHHS_POLICY_NUMBER_RE = re.compile(
    r"^((?:MA|DMA|DHB|DSS)-\d+)"
)

# Matches "CHANGE NOTICE FOR MANUAL NO. XX-XX, MA-2270" pattern
_CHANGE_NOTICE_MA_RE = re.compile(
    r"CHANGE NOTICE.*?(MA-\d+)", re.IGNORECASE
)


def _extract_dhhs_policy_number(title: str) -> str | None:
    """Extract a DHHS policy number (MA-NNNN, DMA-NNNN, etc.) from a document title."""
    # Direct title prefix: "MA-2270 LONG TERM CARE NEED AND BUDGETING"
    m = _DHHS_POLICY_NUMBER_RE.match(title)
    if m:
        return m.group(1)

    # Change notice referencing an MA section: "CHANGE NOTICE FOR MANUAL NO. 01-24, MA-3200, ..."
    m = _CHANGE_NOTICE_MA_RE.search(title)
    if m:
        return m.group(1)

    return None


def _is_dhhs_change_notice_title(title: str) -> bool:
    """Return True for DHHS change notice titles.

    Change notices often mention the policy they amend in the title, but that
    subject policy number is not the notice's own document identity.
    """
    return bool(_DHHS_CHANGE_NOTICE_RE.search(title))


def read_crawler_metadata(source_type: str, filename_stem: str) -> dict:
    """Read metadata from the crawler's SQLite registry.

    Matches on exact filename within local_path to avoid fuzzy mismatches.
    """
    if not CRAWLER_DB_PATH.exists():
        return {}

    conn = sqlite3.connect(str(CRAWLER_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        # Exact match: local_path ends with /{filename_stem}.pdf (or other extensions)
        row = conn.execute(
            "SELECT * FROM documents WHERE source_type = ? AND (local_path LIKE ? OR local_path LIKE ? OR local_path LIKE ?)",
            (source_type, f"%/{filename_stem}.pdf", f"%/{filename_stem}.docx", f"%/{filename_stem}.xlsx"),
        ).fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()


def _read_all_crawler_rows() -> list[dict]:
    if not CRAWLER_DB_PATH.exists():
        return []

    conn = sqlite3.connect(str(CRAWLER_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        return [dict(row) for row in conn.execute("SELECT * FROM documents ORDER BY id")]
    finally:
        conn.close()


@lru_cache(maxsize=4)
def _build_cached_source_selection_index(db_path: str, db_mtime_ns: int | None) -> dict[str, object]:
    del db_path, db_mtime_ns
    return build_source_selection_index(_read_all_crawler_rows())


def _source_selection_index() -> dict[str, object]:
    db_mtime_ns = CRAWLER_DB_PATH.stat().st_mtime_ns if CRAWLER_DB_PATH.exists() else None
    return _build_cached_source_selection_index(str(CRAWLER_DB_PATH), db_mtime_ns)


def read_crawler_metadata_by_local_path(source_type: str, local_path: str) -> dict:
    """Read metadata from the crawler registry by exact local file path."""
    import sqlite3

    if not CRAWLER_DB_PATH.exists():
        return {}

    candidate_paths = {Path(local_path).as_posix()}
    try:
        local_path_obj = Path(local_path)
        if local_path_obj.is_absolute():
            candidate_paths.add(local_path_obj.relative_to(CRAWLER_DATA_DIR).as_posix())
    except ValueError:
        pass

    conn = sqlite3.connect(str(CRAWLER_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        for candidate_path in candidate_paths:
            row = conn.execute(
                "SELECT * FROM documents WHERE source_type = ? AND local_path = ?",
                (source_type, candidate_path),
            ).fetchone()
            if row:
                return dict(row)
        return {}
    finally:
        conn.close()


def _build_document_bundle(
    json_path: Path,
    source_type: str,
    title: str,
    policy_number: str | None,
    waiver_id: str | None,
    crawler_meta: dict,
    meta: dict,
    sections: list[dict],
    effective_date: str | None,
    document_id: str,
) -> DocumentBundle:
    source_family = get_source_family(source_type)
    source_file = meta.get("source_file") or meta.get("source_pdf") or ""
    selection = resolve_source_selection_metadata(
        {
            "title": title,
            "source_type": source_type,
            "source_url": crawler_meta.get("source_url"),
            "local_path": crawler_meta.get("local_path") or source_file,
            "source_format": meta.get("source_format"),
            "status": crawler_meta.get("status"),
        },
        _source_selection_index(),
    )
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
        )
        for section in sections
    ]

    return DocumentBundle(
        document=DocumentNode(
            id=document_id,
            title=title,
            document_type=source_type,
            policy_number=policy_number or waiver_id,
            category=crawler_meta.get("category"),
            status="current",
            source_url=crawler_meta.get("source_url", ""),
            local_path=str(json_path),
            pdf_path=source_file,
            page_count=meta.get("page_count", 0),
            section_count=len(section_nodes),
            effective_date=effective_date,
            authority_tier=source_family.authority_tier,
            answer_role=source_family.answer_role,
            source_format=meta.get("source_format"),
            answer_ready=bool(meta.get("answer_ready", True)),
            corpus_bucket=selection.corpus_bucket,
            variant_group=selection.variant_group,
            variant_date=selection.variant_date,
            retrieval_ready=selection.retrieval_ready,
        ),
        sections=section_nodes,
    )


def load_document(json_path: Path, source_type: str) -> dict:
    """Load a single parsed document into Neo4j. Returns stats."""
    meta_path = json_path.with_suffix("").with_suffix(".meta.json")
    doc_dict = json.loads(json_path.read_text())
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}

    source_file = meta.get("source_file") or meta.get("source_pdf")
    source_file_path = Path(source_file) if source_file else None

    crawler_meta = (
        read_crawler_metadata_by_local_path(source_type, str(source_file_path))
        if source_file_path
        else {}
    )
    if not crawler_meta:
        filename_stem = source_file_path.stem if source_file_path else json_path.stem
        crawler_meta = read_crawler_metadata(source_type, filename_stem)

    # Build document identity and metadata. DHHS policy numbers are not unique
    # across translated notices, annual revisions, and change notices, so
    # `build_document_id(...)` handles them specially.
    policy_number = crawler_meta.get("policy_number")
    title = crawler_meta.get("title", source_file_path.stem if source_file_path else json_path.stem)

    # Extract policy number from DHHS document titles if not set by crawler
    if (
        not policy_number
        and source_type == "dhhs_policy"
        and not _is_dhhs_change_notice_title(title)
    ):
        policy_number = _extract_dhhs_policy_number(title)

    # Extract waiver identifier from title (e.g., "1915(c)").
    # Don't use it for the document ID since multiple docs share the same waiver type.
    waiver_id = None
    if source_type == "waiver":
        waiver_id = _extract_waiver_identifier(
            crawler_meta.get("title", source_file_path.stem if source_file_path else json_path.stem)
        )

    source_url = crawler_meta.get("source_url")
    slug = source_file_path.stem if source_file_path else json_path.stem
    doc_id = build_document_id(source_type, policy_number, slug, source_url)

    sections = (
        build_sections_from_synthetic_items(doc_dict, doc_id)
        if "synthetic_sections" in doc_dict
        else build_sections_from_items(doc_dict, doc_id)
    )

    # Extract effective date from content
    effective_date = _extract_effective_date(source_type, title, sections)
    bundle = _build_document_bundle(
        json_path=json_path,
        source_type=source_type,
        title=title,
        policy_number=policy_number,
        waiver_id=waiver_id,
        crawler_meta=crawler_meta,
        meta=meta,
        sections=sections,
        effective_date=effective_date,
        document_id=doc_id,
    )
    graph_writer.upsert_document_bundle(bundle)

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
