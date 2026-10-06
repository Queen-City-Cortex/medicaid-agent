"""Parse a GovInfo Statute Compilation (USLM XML) into SSA section dicts.

The compilations (COMPS-8765 for Title XIX, COMPS-8770 for Title XXI) are
numbered by Social Security Act section, which is what NC Medicaid documents
cite, so section numbers come straight from ``num/@value``. Children are the
section's direct ``subsection`` elements only; the compiler's footnotes and
editorial notes are not statute text and are dropped.
"""

import re
import xml.etree.ElementTree as ET

from rich.console import Console

from pipeline.references.citations import federal_statute_doc_id

console = Console()

USLM = "http://schemas.gpo.gov/xml/uslm"
COMPS = "http://schemas.gpo.gov/xml/comps-dtd"


def _tag(name: str, namespace: str = USLM) -> str:
    return f"{{{namespace}}}{name}"


SECTION = _tag("section")
SUBSECTION = _tag("subsection")
NUM = _tag("num")
HEADING = _tag("heading")
TABLE = _tag("table", COMPS)
ENTRY = _tag("entry", COMPS)

# Drafting footnotes, their superscript markers, and the compiler's editorial
# notes (U.S.C. cross-references, "Repealed by" lines) are not statute text.
_DROPPED = {_tag("footnote"), _tag("editorialNote")}
# Elements that start a new line of text, so a section keeps its paragraph
# structure: "(a) ...", "(1) ...", "(A) ..." each on their own line.
_BLOCKS = {
    _tag(name)
    for name in (
        "subsection", "paragraph", "subparagraph", "clause", "subclause",
        "item", "subitem", "continuation", "p", "quotedText",
    )
} | {_tag("row", COMPS)}


def _is_dropped(element: ET.Element) -> bool:
    return element.tag in _DROPPED or (
        element.tag == _tag("ref") and element.get("class") == "footnoteRef"
    )


def _collect(element: ET.Element, parts: list[str]) -> None:
    if _is_dropped(element):
        return
    block = element.tag in _BLOCKS
    if block:
        parts.append("\n")
    if element.text:
        parts.append(element.text)
    for index, child in enumerate(element):
        if child.tag == ENTRY and index:
            parts.append(" | ")
        _collect(child, parts)
        if child.tail:
            parts.append(child.tail)
    if block:
        parts.append("\n")


def _text(element: ET.Element, skip: tuple[ET.Element, ...] = ()) -> str:
    parts: list[str] = []
    if element.text:
        parts.append(element.text)
    for child in element:
        if not any(child is skipped for skipped in skip):
            _collect(child, parts)
        if child.tail:
            parts.append(child.tail)
    lines = (re.sub(r"\s+", " ", line).strip() for line in "".join(parts).split("\n"))
    return "\n".join(line for line in lines if line)


def _heading_text(element: ET.Element) -> str:
    heading = element.find(HEADING)
    if heading is None:
        return ""
    parts: list[str] = []
    _collect(heading, parts)
    text = re.sub(r"\s+", " ", "".join(parts)).strip()
    # Headings are typeset in small caps and end with the run-in dash: "Definitions.—".
    text = text.rstrip("—.— ").rstrip(".")
    if text.isupper():
        text = text.capitalize()
    # 1917's heading is typeset entirely in lowercase.
    return text[:1].upper() + text[1:]


def _number(element: ET.Element) -> str | None:
    num = element.find(NUM)
    return num.get("value") if num is not None else None


def compilation_metadata(xml_text: str) -> dict:
    """The package's own currency statement: ``currentThroughPublicLaw`` and ``processedDate``."""
    meta = ET.fromstring(xml_text).find(_tag("meta"))
    return {
        name: (meta.findtext(_tag(tag)) or "").strip() if meta is not None else ""
        for name, tag in (
            ("current_through_public_law", "currentThroughPublicLaw"),
            ("processed_date", "processedDate"),
        )
    }


def parse_statute_compilation(xml_text: str, title_num: int) -> list[dict]:
    """Parse one compiled SSA title into section dicts, each followed by its
    subsection children.

    Section ids are ``sec:{doc_id}:{number}`` and child ids ``{section_id}-{letter}``,
    the same shape the earlier HTML parser produced, so stored citations and the
    golden references keep resolving. The parent keeps its full text.
    """
    doc_id = federal_statute_doc_id(title_num)
    sections: list[dict] = []

    for section in ET.fromstring(xml_text).iter(SECTION):
        number = _number(section)
        if not number:
            continue
        section_id = f"sec:{doc_id}:{number}"
        heading = _heading_text(section)
        skip = tuple(child for child in section if child.tag in (NUM, HEADING))
        content = _text(section, skip=skip)
        sections.append({
            "id": section_id,
            "document_id": doc_id,
            "section_number": number,
            "title": f"Section {number}. {heading}" if heading else f"Section {number}.",
            "level": 1,
            "content_text": content,
            "content_length": len(content),
            "has_tables": section.find(f".//{TABLE}") is not None,
            "has_definitions": "means" in content[:3000].lower(),
        })

        seen_letters: set[str] = set()
        for subsection in section.findall(SUBSECTION):
            letter = _number(subsection)
            if not letter:
                continue
            if letter in seen_letters:
                # 2108 carries two subsections (e) (the compiler's footnote says
                # so); the parent keeps both texts, the first keeps the id.
                console.print(
                    f"  [yellow]WARNING:[/yellow] duplicate subsection {number}({letter}) — second skipped"
                )
                continue
            seen_letters.add(letter)
            sub_number = f"{number}({letter})"
            sub_heading = _heading_text(subsection)
            sub_content = _text(subsection)
            sections.append({
                "id": f"{section_id}-{letter}",
                "document_id": doc_id,
                "section_number": sub_number,
                "title": f"Section {sub_number}. {sub_heading}" if sub_heading else f"Section {sub_number}.",
                "level": 2,
                "parent_id": section_id,
                "content_text": sub_content,
                "content_length": len(sub_content),
                "has_tables": subsection.find(f".//{TABLE}") is not None,
                "has_definitions": "means" in sub_content[:3000].lower(),
            })

    return sections
