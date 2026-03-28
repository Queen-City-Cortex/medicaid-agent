"""Post-processing for Docling output: section number extraction and hierarchy repair."""

import re


# Match section numbers at the start of heading text
# Patterns: "5.0", "5.1.3", "Section 5.1", "Subsection 5.2.1"
SECTION_NUMBER_RE = re.compile(
    r"^(?:Section\s+|Subsection\s+)?(\d+(?:\.\d+)+)\b"
)

ATTACHMENT_RE = re.compile(r"^Attachment\s+([A-Z])\b", re.IGNORECASE)


def extract_section_number(heading_text: str) -> str | None:
    """
    Extract a section number from heading text.

    Returns the section number string (e.g., "5.1.3") or None if not found.
    """
    text = heading_text.strip()
    match = SECTION_NUMBER_RE.match(text)
    if match:
        return match.group(1)
    match = ATTACHMENT_RE.match(text)
    if match:
        return f"Attachment {match.group(1).upper()}"
    return None


def infer_level_from_number(section_number: str | None) -> int | None:
    """
    Infer hierarchy level from a section number.

    "1.0" -> 1, "5.1" -> 2, "5.1.3" -> 3, "5.2.1.4" -> 4

    A trailing ".0" component indicates a top-level section, not additional depth.
    """
    if section_number is None:
        return None
    parts = section_number.split(".")
    # A trailing "0" is a top-level marker (e.g., "1.0", "5.0"), not a sub-level
    if len(parts) >= 2 and parts[-1] == "0":
        return len(parts) - 1
    return len(parts)


def build_section_id(document_id: str, section_number: str | None, index: int) -> str:
    """Build a unique section ID for the graph."""
    if section_number:
        return f"sec:{document_id}:{section_number}"
    return f"sec:{document_id}:_s{index}"


def build_document_id(source_type: str, policy_number: str | None, slug: str, source_url: str | None = None) -> str:
    """Build a unique document ID for the graph.

    Uses policy_number when available (stable across renames).
    Falls back to source_url hash (stable across filename changes),
    then slug as last resort.
    """
    if policy_number:
        return f"doc:{source_type}:{policy_number}"
    if source_url:
        import hashlib
        url_hash = hashlib.sha256(source_url.encode()).hexdigest()[:12]
        return f"doc:{source_type}:url-{url_hash}"
    return f"doc:{source_type}:{slug}"
