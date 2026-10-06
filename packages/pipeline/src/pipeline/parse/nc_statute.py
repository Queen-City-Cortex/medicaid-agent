"""Parse one North Carolina General Statutes section page from ncleg.gov.

The page is a Word export: an optional Part/Article heading, a bold
"§ 108A-70.9A.  Catchline." paragraph, then one paragraph per subsection or
item, with the history note in parentheses at the end of the last paragraph.
It states no effective date and no "current through" session law, so none is
recorded here.
"""

from html.parser import HTMLParser
from pathlib import Path
import re
import time

_BLOCK_TAGS = frozenset({"p", "h1", "h2", "h3", "h4", "h5", "h6"})
_CATCHLINE_RE = re.compile(r"^§+\s*(\d+[A-Z]?-[\dA-Z.]*[\dA-Z])\.\s+(.*)$", re.S)
_LETTERED_RE = re.compile(r"^\(([a-z])(\d*)\)(?:\s+(.*))?$", re.S)
_SUBSECTION_HEADING_RE = re.compile(r"^([A-Z][^.]{0,120})\. - ")
_HISTORY_RE = re.compile(r"^\(?(?:\d{4}|R\.C\.|Code,|Rev\.,|C\.S\.)")
# A catchline or body that says the text is not, or not yet, or no longer the
# law in force. None of the four recorded pages carries one; these are the
# forms the General Statutes use elsewhere.
_NOT_CURRENT_RE = re.compile(
    r"\(Effective\b|\(Applicable\b|\(See (?:editor's )?note|"
    r"^\[?(?:Repealed|Reserved|Recodified|Expired|Transferred)\b",
    re.IGNORECASE,
)


class _BlockParser(HTMLParser):
    """Collect the text of each body paragraph or heading; drop markup and CSS."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[str] = []
        self._skip = 0
        self._current: list[str] | None = None

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in {"style", "script", "head"}:
            self._skip += 1
        elif tag in _BLOCK_TAGS and not self._skip:
            self._close()
            self._current = []
        elif tag == "br" and self._current is not None:
            self._current.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"style", "script", "head"}:
            self._skip = max(0, self._skip - 1)
        elif tag in _BLOCK_TAGS:
            self._close()

    def handle_data(self, data: str) -> None:
        if self._current is not None and not self._skip:
            self._current.append(data)

    def _close(self) -> None:
        if self._current is not None:
            text = " ".join("".join(self._current).split())
            if text:
                self.blocks.append(text)
        self._current = None


def _split_history(text: str) -> tuple[str, str | None]:
    """Split the trailing "(1937, c. 288; ... 2023-11, s. 3.2(d).)" off a paragraph."""
    if not text.endswith(")"):
        return text, None
    depth = 0
    for index in range(len(text) - 1, -1, -1):
        if text[index] == ")":
            depth += 1
        elif text[index] == "(":
            depth -= 1
            if depth == 0:
                note = text[index:]
                if index and _HISTORY_RE.match(note):
                    return text[:index].rstrip(), note
                break
    return text, None


def _section(number: str | None, title: str, level: int, lines: list[str]) -> dict:
    return {
        "section_number": number,
        "title": title,
        "level": level,
        "content_text": "\n".join(lines),
        "has_tables": False,
        "has_definitions": "definition" in title.lower(),
    }


def parse_nc_statute_html(html_path: Path) -> dict:
    start = time.time()
    parser = _BlockParser()
    parser.feed(html_path.read_text(encoding="utf-8", errors="replace"))
    parser.close()
    parser._close()
    blocks = parser.blocks

    catchlines = [i for i, block in enumerate(blocks) if _CATCHLINE_RE.match(block)]
    quality_flags: list[str] = []
    sections: list[dict] = []
    citation = catchline = history = None
    context: list[str] = []
    if not catchlines:
        quality_flags.append("nc_statute_catchline_missing")
    else:
        if len(catchlines) > 1:
            # Two versions of one section (one effective until a date, one after).
            quality_flags.append("nc_statute_multiple_versions")
        first = catchlines[0]
        context = blocks[:first]
        citation, catchline = _CATCHLINE_RE.match(blocks[first]).groups()
        body = blocks[first + 1 :]
        if body:
            body[-1], history = _split_history(body[-1])
            if history is None:
                quality_flags.append("nc_statute_history_note_missing")
            if not body[-1]:
                body.pop()
        if _NOT_CURRENT_RE.search(catchline) or (
            body and _NOT_CURRENT_RE.search(body[0])
        ):
            quality_flags.append("nc_statute_not_current_signal")

        top_lines = [" ".join(context)] if context else []
        children: list[tuple[str, str, list[str]]] = []
        last_letter = ""
        for block in body:
            match = _LETTERED_RE.match(block)
            # "(a)", "(b)", "(a1)" open a subsection only in letter order, so a
            # nested item cannot be mistaken for one.
            if match and (match.group(1) >= last_letter if last_letter else match.group(1) == "a"):
                last_letter = match.group(1)
                label = f"({match.group(1)}{match.group(2)})"
                heading = _SUBSECTION_HEADING_RE.match(match.group(3) or "")
                title = f"{label} {heading.group(1)}" if heading else label
                children.append((label, title, [block]))
            elif children:
                children[-1][2].append(block)
            else:
                top_lines.append(block)
        sections.append(_section(citation, catchline.rstrip("."), 1, top_lines))
        sections.extend(
            _section(f"{citation}{label}", title, 2, lines)
            for label, title, lines in children
        )
        if history:
            sections.append(_section(None, "History", 2, [history]))

    markdown = "\n\n".join(
        f"{'#' * section['level']} {section['section_number'] or ''} {section['title']}".rstrip()
        + (f"\n\n{section['content_text']}" if section["content_text"] else "")
        for section in sections
    )
    return {
        "payload": {
            "synthetic_sections": sections,
            "source_format": "html",
            "statute_citation": citation,
            "document_title": f"N.C.G.S. {citation} - {catchline.rstrip('.')}" if citation else None,
            "statute_context": " ".join(context) or None,
            "history_note": history,
        },
        "markdown": markdown,
        "section_count": len(sections),
        "table_count": 0,
        "page_count": 1,
        "content_char_count": sum(len(s["content_text"]) for s in sections),
        "parse_time_seconds": round(time.time() - start, 2),
        "source_format": "html",
        "parse_backend": "stdlib-html-parser",
        "parse_status": "parsed",
        "quality_flags": quality_flags,
        "answer_ready": not quality_flags,
        # The page states no date; the HTTP Last-Modified stays with the crawler.
        "source_modified_date": None,
    }
