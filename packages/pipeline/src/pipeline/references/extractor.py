"""Regex-based cross-reference extraction from section text."""

import re
from dataclasses import dataclass


@dataclass
class ReferenceMatch:
    ref_type: str       # cross_document, section, attachment, federal_regulation, spa, waiver
    target_id: str      # The extracted identifier
    matched_text: str   # The full matched text from the source
    start: int          # Character offset in source text
    end: int
    confidence: str = "high"          # high, medium, low
    extraction_method: str = "regex"  # regex, llm


PATTERNS: list[tuple[str, re.Pattern]] = [
    (
        "cross_document",
        re.compile(
            r"Clinical Coverage Policy(?:\s+No\.?)?\s*:?\s*(\d+[A-Z]?(?:-[A-Z0-9]+)*)",
            re.IGNORECASE,
        ),
    ),
    (
        "section",
        re.compile(r"(?:Section|Subsection)\s+([\d]+\.[\d]+(?:\.[\d]+)*)"),
    ),
    (
        "ssa_section",
        re.compile(r"(?:Section|Subsection)\s+(1[89]\d{2}|2[01]\d{2})"),
    ),
    (
        "attachment",
        re.compile(r"Attachment\s+([A-Z])"),
    ),
    (
        "federal_regulation",
        re.compile(r"(\d+)\s*CFR\s*§?\s*([\d]+(?:\.[\d]+)*)"),
    ),
    (
        "spa",
        re.compile(r"SPA\s+([\d]+-[\d]+)"),
    ),
    (
        "waiver",
        re.compile(r"1915\s*\([a-z]\)"),
    ),
]


def extract_references(text: str) -> list[ReferenceMatch]:
    """Extract all cross-references from a block of text."""
    refs: list[ReferenceMatch] = []

    for ref_type, pattern in PATTERNS:
        for match in pattern.finditer(text):
            if ref_type == "federal_regulation":
                target_id = f"{match.group(1)} CFR {match.group(2)}"
            elif ref_type == "waiver":
                target_id = match.group(0)
            else:
                target_id = match.group(1)

            refs.append(ReferenceMatch(
                ref_type=ref_type,
                target_id=target_id,
                matched_text=match.group(0),
                start=match.start(),
                end=match.end(),
            ))

    return refs
