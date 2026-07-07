"""Shared CFR citation pattern and canonical federal document-id builders.

Single home for the CFR citation regex (used by both the reference extractor
and the resolver) and for federal document ids, which route through the
canonical ``build_document_id`` instead of hand-formatted f-strings.
"""

import re

from pipeline.parse.post_process import build_document_id

# Matches "42 CFR 440.70" and variants with optional § and spaces, the dotted
# "42 C.F.R. § 440.70" form, and "42 CFR Part 438".
CFR_CITATION_RE = re.compile(
    r"(\d+)\s*C\.?\s?F\.?\s?R\.?\s*(?:Part\s+)?§{0,2}\s*([\d]+(?:\.[\d]+)*)",
    re.IGNORECASE,
)


def federal_regulation_doc_id(title: int, part: int) -> str:
    """Canonical document id for a CFR part, e.g. ``doc:federal_regulation:42-CFR-440``."""
    policy_number = f"{title}-CFR-{part}"
    return build_document_id("federal_regulation", policy_number, policy_number)


def federal_statute_doc_id(title_number: int) -> str:
    """Canonical document id for an SSA title, e.g. ``doc:federal_statute:ssa-title-19``."""
    slug = f"ssa-title-{title_number}"
    return build_document_id("federal_statute", slug, slug)
