"""Load parsed Docling JSON into Neo4j as Document and Section nodes."""

import hashlib
import json
import re
import sqlite3
from functools import lru_cache
from pathlib import Path

from docling_core.types.doc import DoclingDocument, DocItemLabel
from rich.console import Console

from pipeline.config import PARSED_DATA_DIR, CRAWLER_DATA_DIR, CRAWLER_DB_PATH, SOURCE_TYPE_DIRS
from pipeline.corpus_manifest import get_source_family
from pipeline.crawler_registry import (
    DELISTED_FROM_INDEX,
    PAYLOAD_RETAINED_STATUSES,
    IndexListing,
    normalize_local_path,
    parsed_from_registry_payload,
    read_index_listings,
    read_registry_rows,
)
from pipeline.identity import build_document_id, canonicalize_source_url
from pipeline.parse.post_process import (
    extract_section_number,
    infer_level_from_number,
    build_section_id,
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
# The State Plan landing page mixes the approved plan with amendments the
# agency has only proposed. The crawler follows four kinds of sub-page
# (`SPA_SUBPAGE_RE` in the crawler's state-plan source); these three hold
# proposals, and `spa-updates` holds approved changes. The landing page links
# a few proposals directly, which only their titles identify.
_STATE_PLAN_PROPOSAL_PAGE_RE = re.compile(
    r"proposed-public-notices|ten-day-postings?|proposed-amendments-sent"
)
_STATE_PLAN_PROPOSAL_TITLE_RE = re.compile(
    r"Public Notice|Proposed Amendment Sent to CMS|^Draft",
    re.IGNORECASE,
)


def _is_state_plan_proposal(source_type: str, title: str, crawler_meta: dict) -> bool:
    if source_type != "state_plan_amendment":
        return False
    return bool(
        _STATE_PLAN_PROPOSAL_PAGE_RE.search(crawler_meta.get("discovered_from") or "")
        or _STATE_PLAN_PROPOSAL_TITLE_RE.search(title)
    )


@lru_cache(maxsize=4)
def _build_cached_index_listings(
    db_path: str, db_mtime_ns: int | None
) -> dict[str, IndexListing]:
    return read_index_listings(Path(db_path))


def _index_listing(source_url: str | None) -> IndexListing | None:
    db_mtime_ns = CRAWLER_DB_PATH.stat().st_mtime_ns if CRAWLER_DB_PATH.exists() else None
    return _build_cached_index_listings(str(CRAWLER_DB_PATH), db_mtime_ns).get(source_url)


def _document_exclusion_reason(meta: dict, crawler_meta: dict) -> str | None:
    """Return why a parsed artifact must stay out of the release graph."""
    if not crawler_meta:
        return "missing_registry_record"

    from pipeline.source_lifecycle import read_table
    classifications = read_table(CRAWLER_DB_PATH, "source_classifications")
    if classifications:
        from pipeline.source_audit import validate_classifications
        validate_classifications(CRAWLER_DB_PATH)
        if any(row["source_url"] == crawler_meta.get("source_url") and row["resource_role"] == "index" for row in classifications):
            return "classified_discovery_index"
    registry_status = crawler_meta.get("status")
    if registry_status not in PAYLOAD_RETAINED_STATUSES:
        return f"inactive_registry_status:{registry_status or 'missing'}"
    listing = _index_listing(crawler_meta.get("source_url"))
    if listing and listing.delisted:
        return DELISTED_FROM_INDEX
    # A failed check proves nothing about the stored payload, so the row loads
    # only when these parsed bytes are the last bytes the crawler fetched.
    if registry_status == "error" and not parsed_from_registry_payload(crawler_meta, meta):
        return "error_without_verified_payload"

    parse_status = meta.get("parse_status") or "parsed"
    if parse_status != "parsed":
        return f"parse_status:{parse_status}"

    quality_flags = list(meta.get("quality_flags") or [])
    if meta.get("answer_ready") is False or quality_flags:
        return "not_answer_ready"
    if meta.get("section_count") == 0:
        return "zero_section_parse"
    return None


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

    for item, level in doc.iterate_items(traverse_pictures=True):
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
            DocItemLabel.CHECKBOX_SELECTED,
            DocItemLabel.CHECKBOX_UNSELECTED,
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
# "CHANGE NOTICE FOR MANUAL NO. 04-26", "CHANGE NOTICE FOR MANUAL, NO: 07-15",
# "CHANGE NOTICE FOR MANUALS NO. 22-08" and "DMA CHANGE NOTICE FOR MANUAL 01-14".
_CHANGE_NOTICE_YEAR_RE = re.compile(
    r"CHANGE NOTICE(?:\s+FOR\s+MANUALS?)?[\s.,:]*(?:NO\b[\s.:]*)?(\d{1,2})-(\d{2})(?!\d)",
    re.IGNORECASE,
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

    # A DHHS change notice gets no date here: its title carries a number, not
    # a date, and January 1 of the year was a date no source states. See
    # `_change_notice_number`.
    return None


def _change_notice_number(source_type: str, title: str) -> tuple[int, int] | None:
    """Year and sequence of a DHHS change notice's number.

    "CHANGE NOTICE FOR MANUAL NO. 04-26" is (2026, 4): the fourth notice of
    2026. The pair orders notices within one manual's series; it is not a date.
    """
    if source_type != "dhhs_policy":
        return None
    m = _CHANGE_NOTICE_YEAR_RE.search(title)
    if not m:
        return None
    yy = int(m.group(2))
    return (2000 + yy if yy < 50 else 1900 + yy, int(m.group(1)))


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
            "SELECT * FROM documents WHERE source_type = ? AND (local_path LIKE ? OR local_path LIKE ? OR local_path LIKE ? OR local_path LIKE ?)",
            (
                source_type,
                f"%/{filename_stem}.pdf",
                f"%/{filename_stem}.docx",
                f"%/{filename_stem}.xlsx",
                f"%/{filename_stem}.html",
            ),
        ).fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()


@lru_cache(maxsize=4)
def _build_cached_source_selection_index(db_path: str, db_mtime_ns: int | None) -> dict[str, object]:
    del db_path, db_mtime_ns
    return build_source_selection_index(read_registry_rows(CRAWLER_DB_PATH))


def _source_selection_index() -> dict[str, object]:
    db_mtime_ns = CRAWLER_DB_PATH.stat().st_mtime_ns if CRAWLER_DB_PATH.exists() else None
    return _build_cached_source_selection_index(str(CRAWLER_DB_PATH), db_mtime_ns)


def read_crawler_metadata_by_local_path(source_type: str, local_path: str) -> dict:
    """Read metadata from the crawler registry by exact local file path."""
    if not CRAWLER_DB_PATH.exists():
        return {}

    conn = sqlite3.connect(str(CRAWLER_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT * FROM documents WHERE source_type = ? AND local_path = ?",
            (source_type, normalize_local_path(local_path, CRAWLER_DATA_DIR)),
        ).fetchone()
        return dict(row) if row else {}
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

    # The agency still publishes an archived document, so it loads and stays
    # citable, but default retrieval skips it.
    listing = _index_listing(crawler_meta.get("source_url"))
    archived = bool(listing and listing.archived)
    # A proposal is not approved State Plan text: it loads as supporting
    # material whatever tier its family carries.
    proposed = _is_state_plan_proposal(source_type, title, crawler_meta)
    change_year, change_sequence = _change_notice_number(source_type, title) or (None, None)

    return DocumentBundle(
        document=DocumentNode(
            id=document_id,
            title=title,
            document_type=source_type,
            policy_number=policy_number or waiver_id,
            category=crawler_meta.get("category"),
            status="archived" if archived else "proposed" if proposed else "current",
            source_url=(
                canonicalize_source_url(crawler_meta["source_url"])
                if crawler_meta.get("source_url")
                else ""
            ),
            local_path=str(json_path),
            pdf_path=source_file,
            page_count=meta.get("page_count", 0),
            section_count=len(section_nodes),
            effective_date=effective_date,
            change_year=change_year,
            change_sequence=change_sequence,
            source_modified_date=meta.get("source_modified_date"),
            retrieved_at=(
                crawler_meta.get("last_checked_at")
                or crawler_meta.get("last_downloaded_at")
                or crawler_meta.get("first_seen_at")
            ),
            authority_tier="supporting" if proposed else source_family.authority_tier,
            answer_role=source_family.answer_role,
            source_format=meta.get("source_format"),
            answer_ready=bool(meta.get("answer_ready", True)),
            corpus_bucket=selection.corpus_bucket,
            variant_group=selection.variant_group,
            variant_date=selection.variant_date,
            retrieval_ready=selection.retrieval_ready,
            archived=archived,
            source_checked_at=crawler_meta.get("last_checked_at"),
            source_changed_at=crawler_meta.get("last_changed_at"),
        ),
        sections=section_nodes,
    )


def _resolve_document_load_context(json_path: Path, source_type: str) -> dict:
    """Resolve identity and eligibility without mutating the graph."""
    meta_path = json_path.with_suffix("").with_suffix(".meta.json")
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

    source_url = crawler_meta.get("source_url")
    registry_path = crawler_meta.get("local_path")
    if not registry_path and source_file_path:
        registry_path = normalize_local_path(str(source_file_path), CRAWLER_DATA_DIR)
    doc_id = build_document_id(source_type, source_url, registry_path)
    return {
        "meta": meta,
        "source_file_path": source_file_path,
        "crawler_meta": crawler_meta,
        "document_id": doc_id,
        "exclusion_reason": _document_exclusion_reason(meta, crawler_meta),
    }


def _parse_artifact_authority_key(
    candidate: tuple[Path, dict],
) -> tuple[int, int, str, int]:
    """Rank duplicates by current registry artifact, parse time, and cache version."""
    _, context = candidate
    meta = context.get("meta", {})
    crawler_meta = context.get("crawler_meta", {})
    checksum_matches = int(parsed_from_registry_payload(crawler_meta, meta))
    source_file_path = context.get("source_file_path")
    registry_path = crawler_meta.get("local_path")
    source_path_matches = int(
        bool(
            source_file_path
            and registry_path
            and normalize_local_path(str(source_file_path), CRAWLER_DATA_DIR)
            == normalize_local_path(str(registry_path), CRAWLER_DATA_DIR)
        )
    )
    parsed_at = str(meta.get("parsed_at") or "")
    try:
        cache_version = int(meta.get("parse_cache_version") or 0)
    except (TypeError, ValueError):
        cache_version = 0
    return checksum_matches, source_path_matches, parsed_at, cache_version


def _parsed_artifact_digest(json_path: Path) -> bytes:
    digest = hashlib.sha256()
    with json_path.open("rb") as artifact:
        for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.digest()


def _select_authoritative_parse(
    candidates: list[tuple[Path, dict]],
) -> tuple[Path, dict]:
    ranked = [
        (_parse_artifact_authority_key(candidate), candidate)
        for candidate in candidates
    ]
    best_key = max(key for key, _ in ranked)
    tied = [candidate for key, candidate in ranked if key == best_key]
    if len(tied) == 1:
        return tied[0]

    if len({_parsed_artifact_digest(path) for path, _ in tied}) == 1:
        return min(tied, key=lambda candidate: candidate[0].name)

    names = ", ".join(sorted(path.name for path, _ in tied))
    raise ValueError(f"ambiguous duplicate parsed artifacts: {names}")


def load_document(
    json_path: Path,
    source_type: str,
    *,
    load_context: dict | None = None,
) -> dict:
    """Load a single parsed document into Neo4j. Returns stats."""
    context = load_context or _resolve_document_load_context(json_path, source_type)
    meta = context["meta"]
    source_file_path = context["source_file_path"]
    crawler_meta = context["crawler_meta"]
    doc_id = context["document_id"]

    # Build identity exclusively from the immutable source key. Policy number,
    # title, language, revision, and filename remain mutable metadata.
    policy_number = crawler_meta.get("policy_number")
    title = crawler_meta.get("title") or (source_file_path.stem if source_file_path else json_path.stem)

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
        waiver_id = _extract_waiver_identifier(title)

    exclusion_reason = context["exclusion_reason"]
    if exclusion_reason:
        graph_writer.delete_document(doc_id)
        return {
            "document_id": doc_id,
            "sections": 0,
            "skipped": exclusion_reason,
        }

    doc_dict = json.loads(json_path.read_text())
    sections = (
        build_sections_from_synthetic_items(doc_dict, doc_id)
        if "synthetic_sections" in doc_dict
        else build_sections_from_items(doc_dict, doc_id)
    )
    if not sections:
        graph_writer.delete_document(doc_id)
        return {
            "document_id": doc_id,
            "sections": 0,
            "skipped": "zero_section_parse",
        }

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

    stats = {"loaded": 0, "sections_total": 0, "skipped": 0, "errors": 0}
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

        candidates_by_document: dict[str, list[tuple[Path, dict]]] = {}
        for json_path in json_files:
            try:
                context = _resolve_document_load_context(json_path, st)
                candidates_by_document.setdefault(
                    context["document_id"],
                    [],
                ).append((json_path, context))
            except Exception as e:
                console.print(f"  Loading {json_path.name}... [red]ERROR: {e}[/red]")
                stats["errors"] += 1

        for candidates in candidates_by_document.values():
            eligible = [
                candidate
                for candidate in candidates
                if candidate[1]["exclusion_reason"] is None
            ]
            duplicate_count = len(candidates) - 1
            if duplicate_count:
                stats["skipped"] += duplicate_count

            try:
                if eligible:
                    json_path, context = _select_authoritative_parse(eligible)
                else:
                    json_path, context = candidates[0]
            except Exception as e:
                console.print(f"  Loading duplicate group... [red]ERROR: {e}[/red]")
                stats["errors"] += 1
                document_id = candidates[0][1]["document_id"]
                try:
                    graph_writer.delete_document(document_id)
                except Exception as cleanup_error:
                    console.print(
                        "  Removing ambiguous graph document "
                        f"{document_id}... [red]ERROR: {cleanup_error}[/red]"
                    )
                    stats["errors"] += 1
                continue

            if duplicate_count:
                for duplicate_path, _ in candidates:
                    if duplicate_path != json_path:
                        console.print(
                            f"  Skipping {duplicate_path.name}... "
                            "[yellow]SKIPPED[/yellow] (duplicate parsed artifact)"
                        )

            try:
                console.print(f"  Loading {json_path.name}...", end=" ")
                result = load_document(json_path, st, load_context=context)
                if result.get("skipped"):
                    console.print(f"[yellow]SKIPPED[/yellow] ({result['skipped']})")
                    stats["skipped"] += 1
                    continue
                console.print(f"[green]OK[/green] ({result['sections']} sections)")
                stats["loaded"] += 1
                stats["sections_total"] += result["sections"]
            except Exception as e:
                console.print(f"[red]ERROR: {e}[/red]")
                stats["errors"] += 1

    return stats
