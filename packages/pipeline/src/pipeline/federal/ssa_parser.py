"""Parse USC HTML into SSA section dicts for Neo4j loading.

Parses the HTML from uscode.house.gov and creates section dicts
using SSA section numbers (1902, 1905) as the primary identifiers,
since that's what NC Medicaid documents cite.
"""

import re
from html.parser import HTMLParser

from pipeline.federal.ssa_client import USC_TO_SSA


class _TextExtractor(HTMLParser):
    """Extract plain text from HTML, collapsing whitespace."""

    def __init__(self):
        super().__init__()
        self.parts: list[str] = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head"):
            self._skip = False
        if tag in ("p", "br", "div", "h1", "h2", "h3", "h4", "h5", "li", "tr"):
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)

    def get_text(self) -> str:
        text = "".join(self.parts)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()


def _html_to_text(html: str) -> str:
    parser = _TextExtractor()
    parser.feed(html)
    return parser.get_text()


def parse_usc_subchapter(html: str, title_num: int) -> list[dict]:
    """Parse a USC subchapter HTML page into section dicts.

    Each section is identified by its SSA section number (e.g., "1902")
    for consistency with how NC Medicaid documents cite the law.
    """
    doc_id = f"doc:federal_statute:ssa-title-{title_num}"
    sections: list[dict] = []

    # The USC page has <h3> tags for each section: "§1396a. State plans for medical assistance"
    section_pattern = re.compile(
        r'<h3[^>]*>\s*(?:&sect;|§)\s*([\d]+[a-z]*(?:[-–&][a-z\d;]*)*)\.\s*([^<]+)</h3>',
        re.IGNORECASE,
    )

    matches = list(section_pattern.finditer(html))
    if not matches:
        return sections

    for i, match in enumerate(matches):
        usc_num_raw = match.group(1)
        usc_num = usc_num_raw.replace("&ndash;", "-").replace("&#8211;", "-")
        usc_title = match.group(2).strip().rstrip(".")

        # Map USC number to SSA number
        ssa_num = USC_TO_SSA.get(usc_num)
        if not ssa_num:
            base = re.match(r"(\d+[a-z]*(?:-\d+)?)", usc_num)
            if base:
                ssa_num = USC_TO_SSA.get(base.group(1))
        if not ssa_num:
            continue

        # Extract section content
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(html)
        section_html = html[start:end]
        content = _html_to_text(section_html)

        # Trim very long sections
        if len(content) > 50000:
            content = content[:50000] + "\n\n[Section truncated — full text at uscode.house.gov]"

        section_id = f"sec:{doc_id}:{ssa_num}"

        sections.append({
            "id": section_id,
            "document_id": doc_id,
            "section_number": ssa_num,
            "title": f"Section {ssa_num}. {usc_title}",
            "level": 1,
            "content_text": content,
            "content_length": len(content),
            "has_tables": bool(re.search(r"<table", section_html, re.IGNORECASE)),
            "has_definitions": "means" in content[:3000].lower(),
        })

    return sections
