"""Parse USC HTML into SSA section dicts for Neo4j loading.

Parses the HTML from uscode.house.gov and creates section dicts
using SSA section numbers (1902, 1905) as the primary identifiers,
since that's what NC Medicaid documents cite.
"""

import html as html_module
import re
from html.parser import HTMLParser

from rich.console import Console

from pipeline.federal.ssa_client import USC_TO_SSA

console = Console()


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

    # The USC page marks each section with <h3 class="section-head">. The
    # heading's inner HTML can contain tags: uscode.house.gov italicizes the
    # letters l and o in section numbers (e.g. "&sect;1396<i>l</i>.") to
    # distinguish them from 1/0 — so the number and title must be parsed from
    # the tag-stripped text, never from a raw [^<]+ run.
    heading_pattern = re.compile(
        r'<h3[^>]*class="section-head"[^>]*>(.*?)</h3>',
        re.IGNORECASE | re.DOTALL,
    )

    matches = list(heading_pattern.finditer(html))
    if not matches:
        return sections

    seen_ssa_numbers: set[str] = set()

    for i, match in enumerate(matches):
        heading_text = html_module.unescape(re.sub(r"<[^>]+>", "", match.group(1)))
        heading_text = heading_text.replace("–", "-").replace("—", "-").strip()

        head = re.match(r"§+\s*([0-9][0-9a-z-]*)\.\s*(.+)$", heading_text)
        if not head:
            # Repealed/transferred range headings ("§§1396 to ...") and other
            # non-section heads are expected; skip quietly.
            continue
        usc_num = head.group(1)
        usc_title = head.group(2).strip().rstrip(".")

        # Map USC number to SSA number. No fuzzy fallback: stripping suffixes
        # aliased unmapped sections onto their parent SSA number, silently
        # overwriting the parent's text in Neo4j.
        ssa_num = USC_TO_SSA.get(usc_num)
        if not ssa_num:
            console.print(
                f"  [yellow]WARNING:[/yellow] USC §{usc_num} has no SSA mapping — skipped "
                f"(add it to SSA_TO_USC in ssa_client.py)"
            )
            continue
        if ssa_num in seen_ssa_numbers:
            console.print(
                f"  [yellow]WARNING:[/yellow] duplicate SSA section {ssa_num} (USC §{usc_num}) — skipped"
            )
            continue
        seen_ssa_numbers.add(ssa_num)

        # Extract section content — full text, no truncation. The most-cited
        # Medicaid statutes (SSA 1902, 1905, 1915, 1917…) run hundreds of
        # thousands of characters; a cap here silently dropped most of their
        # text. Downstream consumers already handle size (the embedding
        # chunker splits large sections; the getSection tool caps display).
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(html)
        section_html = html[start:end]
        content = _html_to_text(section_html)

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
