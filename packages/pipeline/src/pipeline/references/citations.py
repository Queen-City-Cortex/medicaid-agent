"""Shared CFR citation pattern and canonical federal document-id builders.

Single home for the CFR citation regex (used by both the reference extractor
and the resolver) and for federal document ids, which route through the
canonical ``build_document_id`` instead of hand-formatted f-strings.
"""

import re

from pipeline.identity import build_document_id

# Matches "42 CFR 440.70" and variants with optional § and spaces, the dotted
# "42 C.F.R. § 440.70" form, and "42 CFR Part 438".
CFR_CITATION_RE = re.compile(
    r"(\d+)\s*C\.?\s?F\.?\s?R\.?\s*(?:Part\s+)?§{0,2}\s*([\d]+(?:\.[\d]+)*)",
    re.IGNORECASE,
)


def federal_regulation_doc_id(title: int, part: int) -> str:
    """Canonical document id for one CFR part."""
    return build_document_id(
        "federal_regulation",
        f"https://www.ecfr.gov/current/title-{title}/part-{part}",
    )


def federal_statute_doc_id(title_number: int) -> str:
    """Canonical document id for one Social Security Act title."""
    return build_document_id(
        "federal_statute",
        "https://uscode.house.gov/view.xhtml"
        f"?req=granuleid:USC-prelim-title42-chapter7-subchapter{title_number}",
    )
