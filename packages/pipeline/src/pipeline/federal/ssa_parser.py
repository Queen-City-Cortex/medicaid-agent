"""Parse Social Security Act HTML into section dicts."""

import re
from html.parser import HTMLParser


class SSATextExtractor(HTMLParser):
    """Simple HTML to text extractor."""
    def __init__(self):
        super().__init__()
        self.text_parts = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._skip = False
        if tag in ("p", "br", "div", "h1", "h2", "h3", "h4", "li"):
            self.text_parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self.text_parts.append(data)

    def get_text(self) -> str:
        return "".join(self.text_parts).strip()


def extract_text(html: str) -> str:
    """Extract plain text from HTML."""
    parser = SSATextExtractor()
    parser.feed(html)
    return parser.get_text()


def parse_title_index(html: str, title_num: int) -> list[dict]:
    """Parse the SSA title index page to find section links.

    Returns list of {section_number, title, url}.
    """
    sections = []
    # SSA index pages have links like: <a href="0119xx.htm">Sec. 19xx. Title</a>
    # or <a href="21xx.htm">Sec. 21xx. Title</a>
    import re
    # Find all links to section pages
    pattern = re.compile(
        r'<a\s+href="([^"]+)"[^>]*>\s*Sec\.\s*(\d+)\.\s*([^<]+)</a>',
        re.IGNORECASE,
    )
    for match in pattern.finditer(html):
        href = match.group(1)
        section_num = match.group(2)
        title = match.group(3).strip().rstrip(".")

        # Build full URL
        if title_num == 19:
            base = "https://www.ssa.gov/OP_Home/ssact/title19/"
        else:
            base = "https://www.ssa.gov/OP_Home/ssact/title21/"
        full_url = base + href if not href.startswith("http") else href

        sections.append({
            "section_number": section_num,
            "title": title,
            "url": full_url,
        })

    return sections


def parse_section_page(html: str, section_info: dict, title_num: int) -> dict:
    """Parse a single SSA section page into a section dict for Neo4j."""
    content = extract_text(html)
    doc_id = f"doc:federal_statute:ssa-title-{title_num}"
    section_id = f"sec:{doc_id}:{section_info['section_number']}"

    return {
        "id": section_id,
        "document_id": doc_id,
        "section_number": section_info["section_number"],
        "title": section_info["title"],
        "level": 1,
        "content_text": content,
        "content_length": len(content),
        "has_tables": False,
        "has_definitions": "means" in content.lower()[:2000],
    }
