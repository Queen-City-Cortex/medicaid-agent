"""Parse eCFR XML into section dicts for Neo4j loading."""

import re
import xml.etree.ElementTree as ET
from datetime import datetime

# Parse dates from CITA text. eCFR uses a few forms:
#   "Oct. 1, 1981"  /  "May 10, 2024"  /  "Jan. 16, 2014"
_CITA_DATE_FORMATS = ["%b. %d, %Y", "%B %d, %Y", "%b %d, %Y"]

# Matches "89 FR 40863, May 10, 2024" — FR volume + page + date phrase.
_FR_CITATION_RE = re.compile(
    r"(\d+)\s*FR\s*(\d+),?\s*([A-Z][a-z]+\.?\s+\d+,\s*\d{4})"
)


def _parse_cita(cita_text: str) -> tuple[str | None, str | None]:
    """Extract (full_cite, last_revised_iso) from a `<CITA>` payload.

    The full cite is returned trimmed to a single line. `last_revised_iso` is
    the ISO-8601 date of the most recent FR citation in the list (the last
    date parseable from the CITA text). Returns (None, None) when the input is
    empty or unparseable.
    """
    text = (cita_text or "").strip()
    if not text:
        return None, None
    # Normalize whitespace but keep semicolons/commas so the full-cite is readable.
    full = re.sub(r"\s+", " ", text).strip().strip("[]").strip()
    full = f"[{full}]"
    last_iso: str | None = None
    for match in _FR_CITATION_RE.finditer(text):
        date_phrase = match.group(3).strip()
        for fmt in _CITA_DATE_FORMATS:
            try:
                parsed = datetime.strptime(date_phrase, fmt)
                last_iso = parsed.date().isoformat()
                break
            except ValueError:
                continue
    return full, last_iso


def parse_part_xml(xml_text: str, title: int, part: int) -> list[dict]:
    """
    Parse eCFR XML for a CFR part into a list of section dicts.

    Each dict has: id, section_number, title, content_text, content_length,
    level, has_tables, has_definitions, document_id

    Sections are DIV8 elements with TYPE="SECTION" in the eCFR XML format.
    """
    root = ET.fromstring(xml_text)
    doc_id = f"doc:federal_regulation:{title}-CFR-{part}"
    sections: list[dict] = []

    # Find all DIV8 section elements.
    # eCFR uses DIV8 with TYPE="SECTION" for individual sections within a part.
    for el in root.iter("DIV8"):
        el_type = el.get("TYPE", "")
        if el_type != "SECTION":
            continue

        section_number = el.get("N", "")
        if not section_number:
            continue

        # Extract heading
        head_el = el.find("HEAD")
        raw_title = head_el.text.strip() if head_el is not None and head_el.text else ""

        # Strip "§ 440.70" prefix from title (section marker + number)
        clean_title = re.sub(r"^§\s*[\d.]+\s*", "", raw_title).strip()
        # Also strip trailing period
        clean_title = clean_title.rstrip(".")

        # Extract content text from all paragraph-like elements
        content_parts: list[str] = []
        has_tables = False
        has_definitions = False
        cita_raw: str | None = None

        for child in el:
            tag = child.tag
            if tag == "HEAD":
                continue  # Already handled
            elif tag in ("P", "FP"):
                text = _extract_text(child)
                if text:
                    content_parts.append(text)
            elif tag == "EXTRACT":
                text = _extract_extract(child)
                if text:
                    content_parts.append(text)
            elif tag == "GPOTABLE":
                table_text = _extract_table(child)
                if table_text:
                    content_parts.append(table_text)
                    has_tables = True
            elif tag == "CITA":
                # Federal Register citation history — keep as content for
                # search hits AND capture as structured metadata on the node.
                text = _extract_text(child)
                if text:
                    content_parts.append(f"[Authority: {text}]")
                    cita_raw = text
            else:
                # Other elements — extract text content
                text = _extract_text(child)
                if text:
                    content_parts.append(text)

        content_text = "\n\n".join(content_parts)

        # Check for definitions
        if "definition" in clean_title.lower() or '"' in content_text[:500]:
            has_definitions = True

        section_id = f"sec:{doc_id}:{section_number}"

        federal_register_cite, last_revised = _parse_cita(cita_raw) if cita_raw else (None, None)

        sections.append({
            "id": section_id,
            "document_id": doc_id,
            "section_number": section_number,
            "title": clean_title or f"§ {section_number}",
            "level": 1,  # CFR sections are flat within a part
            "content_text": content_text.strip(),
            "content_length": len(content_text.strip()),
            "has_tables": has_tables,
            "has_definitions": has_definitions,
            "federal_register_cite": federal_register_cite,
            "last_revised": last_revised,
        })

    return sections


def _extract_text(element: ET.Element) -> str:
    """Recursively extract all text content from an XML element."""
    parts: list[str] = []
    if element.text:
        text = element.text.strip()
        if text:
            parts.append(text)
    for child in element:
        child_text = _extract_text(child)
        if child_text:
            parts.append(child_text)
        if child.tail:
            tail = child.tail.strip()
            if tail:
                parts.append(tail)
    return " ".join(parts)


def _extract_extract(extract_el: ET.Element) -> str:
    """Extract content from an EXTRACT element, preserving paragraph breaks."""
    para_parts: list[str] = []
    for child in extract_el:
        text = _extract_text(child)
        if text:
            para_parts.append(text)
    return "\n".join(para_parts)


def _extract_table(table_el: ET.Element) -> str:
    """Extract a GPOTABLE element as markdown-like text."""
    rows: list[list[str]] = []
    for row_el in table_el.iter("ROW"):
        cells: list[str] = []
        for ent_el in row_el.iter("ENT"):
            cell_text = _extract_text(ent_el) if ent_el.text or len(ent_el) > 0 else ""
            cells.append(cell_text)
        if cells:
            rows.append(cells)

    if not rows:
        return ""

    # Format as simple text table
    lines: list[str] = []
    for row in rows:
        lines.append(" | ".join(row))
    return "\n".join(lines)
