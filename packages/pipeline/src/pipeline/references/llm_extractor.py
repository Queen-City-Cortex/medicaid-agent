"""LLM-based cross-reference extraction — supplements regex with semantic understanding."""

import json
import logging

import httpx

from pipeline.config import ANTHROPIC_API_KEY, LLM_MODEL, LLM_REF_BATCH_SIZE
from pipeline.references.extractor import ReferenceMatch

logger = logging.getLogger(__name__)

API_URL = "https://api.anthropic.com/v1/messages"

SYSTEM_PROMPT = """\
You are a specialist in NC Medicaid policy cross-references. Your job is to find \
references to other documents, policies, or federal regulations that a simple regex \
would miss.

You are given sections from NC Medicaid policy documents. For each section, identify \
cross-references that are expressed in natural language rather than formal citation format.

## What to look for

1. **Natural language policy references** — e.g., "the home health services policy" \
refers to Clinical Coverage Policy 1-H, "the DME policy" refers to 5A.
2. **Abbreviated references** without the "Clinical Coverage Policy" prefix — e.g., \
"per 3K-2", "see policy 10A".
3. **Paraphrased federal authority** — e.g., "as required by federal regulations \
regarding home health agencies" likely refers to 42 CFR 484.
4. **References to other document types** — e.g., "the state plan amendment that \
authorized this waiver" or "per the provider manual".

## What NOT to flag

- References that use formal citation format (e.g., "Clinical Coverage Policy 3K-2", \
"42 CFR 440.70", "Section 1902") — these are already captured by regex.
- Vague references with no identifiable target (e.g., "per federal law", "state regulations").
- Self-references within the same document.

## Known documents

The following documents exist in the knowledge base. Use this catalog to resolve \
natural language references to specific policy numbers:

{document_catalog}

Use the extract_cross_references tool to report what you find. If no implicit \
cross-references exist in any section, call the tool with an empty references array."""

EXTRACT_TOOL = {
    "name": "extract_cross_references",
    "description": "Report cross-references found in the provided policy sections.",
    "input_schema": {
        "type": "object",
        "properties": {
            "references": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "section_id": {
                            "type": "string",
                            "description": "The section ID where the reference was found",
                        },
                        "ref_type": {
                            "type": "string",
                            "enum": ["cross_document", "federal_regulation", "spa", "waiver"],
                            "description": "The type of cross-reference",
                        },
                        "target_id": {
                            "type": "string",
                            "description": "The resolved identifier (e.g., '1-H', '42 CFR 484', 'SPA 22-0024')",
                        },
                        "matched_text": {
                            "type": "string",
                            "description": "The exact phrase in the source text that constitutes the reference",
                        },
                        "confidence": {
                            "type": "string",
                            "enum": ["high", "medium"],
                            "description": "Confidence level in the reference identification",
                        },
                    },
                    "required": ["section_id", "ref_type", "target_id", "matched_text", "confidence"],
                },
            },
        },
        "required": ["references"],
    },
}


def _build_document_catalog(documents: list[dict]) -> str:
    """Format the document catalog for the system prompt."""
    lines = []
    for doc in documents:
        pn = doc.get("policy_number") or "(none)"
        title = doc.get("title") or "(untitled)"
        doc_type = doc.get("document_type") or "unknown"
        lines.append(f"- {pn}: {title} [{doc_type}]")
    return "\n".join(lines)


def _build_sections_message(sections: list[dict]) -> str:
    """Format a batch of sections for the user message."""
    parts = []
    for sec in sections:
        sec_id = sec["id"]
        doc_id = sec.get("document_id", "unknown")
        title = sec.get("title") or "(untitled)"
        content = (sec.get("content_text") or "")[:2000]  # cap per-section length
        parts.append(
            f"--- Section: {sec_id} (Document: {doc_id}) ---\n"
            f"Title: {title}\n\n"
            f"{content}"
        )
    return "\n\n".join(parts)


def _call_llm(system: str, user: str) -> list[dict]:
    """Call Anthropic Messages API with structured tool_use and prompt caching."""
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set — required for --llm-assist")

    # Mark the tool definition for caching (identical across all calls)
    cached_tool = {**EXTRACT_TOOL, "cache_control": {"type": "ephemeral"}}

    resp = httpx.post(
        API_URL,
        json={
            "model": LLM_MODEL,
            "max_tokens": 4096,
            # System prompt as content block array with cache_control on the
            # large catalog block — identical across all batches.
            "system": [
                {
                    "type": "text",
                    "text": system,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            "tools": [cached_tool],
            "tool_choice": {"type": "tool", "name": "extract_cross_references"},
            "messages": [{"role": "user", "content": user}],
        },
        headers={
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        timeout=120,
    )
    resp.raise_for_status()

    # Log cache performance on first and periodic calls
    usage = resp.json().get("usage", {})
    cache_read = usage.get("cache_read_input_tokens", 0)
    cache_create = usage.get("cache_creation_input_tokens", 0)
    if cache_create > 0:
        logger.info("Prompt cache created: %d tokens", cache_create)
    elif cache_read > 0 and cache_read > usage.get("input_tokens", 0):
        # Only log cache hits occasionally to avoid noise
        pass

    # Extract the tool_use block from the response
    content = resp.json()["content"]
    for block in content:
        if block.get("type") == "tool_use" and block.get("name") == "extract_cross_references":
            return block["input"].get("references", [])

    logger.warning("No tool_use block in LLM response")
    return []


def _parse_response(text: str) -> list[dict]:
    """Parse the LLM JSON response into a list of raw reference dicts.

    Legacy path — kept for tests. Structured tool_use is now preferred.
    """
    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1]) if len(lines) > 2 else text

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("LLM returned invalid JSON: %s", text[:200])
        return []

    if not isinstance(data, list):
        logger.warning("LLM response is not a list: %s", type(data))
        return []

    return data


def _raw_to_reference_matches(raw_refs: list[dict]) -> list[ReferenceMatch]:
    """Convert parsed LLM output dicts to ReferenceMatch objects."""
    matches = []
    for ref in raw_refs:
        if not isinstance(ref, dict):
            continue
        confidence = ref.get("confidence", "medium")
        if confidence not in ("high", "medium"):
            continue  # skip low-confidence

        ref_type = ref.get("ref_type")
        target_id = ref.get("target_id")
        matched_text = ref.get("matched_text", "")
        section_id = ref.get("section_id", "")

        if not ref_type or not target_id:
            continue

        matches.append(ReferenceMatch(
            ref_type=ref_type,
            target_id=target_id,
            matched_text=matched_text,
            start=0,
            end=0,
            confidence=confidence,
            extraction_method="llm",
        ))
    return matches


def fetch_document_catalog(session) -> list[dict]:
    """Query Neo4j for all documents to build the LLM context catalog."""
    result = session.run(
        "MATCH (d:Document) RETURN d.id, d.policy_number, d.title, d.document_type "
        "ORDER BY d.document_type, d.policy_number"
    )
    return [
        {
            "id": r["d.id"],
            "policy_number": r["d.policy_number"],
            "title": r["d.title"],
            "document_type": r["d.document_type"],
        }
        for r in result
    ]


def extract_references_llm(
    sections: list[dict],
    catalog: list[dict],
    batch_size: int | None = None,
) -> dict[str, list[ReferenceMatch]]:
    """
    Run LLM-based reference extraction on a list of sections.

    Returns a dict mapping section_id -> list of ReferenceMatch found by the LLM.
    """
    batch_size = batch_size or LLM_REF_BATCH_SIZE
    catalog_text = _build_document_catalog(catalog)
    system = SYSTEM_PROMPT.format(document_catalog=catalog_text)

    all_refs: dict[str, list[ReferenceMatch]] = {}
    total_batches = (len(sections) + batch_size - 1) // batch_size
    consecutive_failures = 0

    for i in range(0, len(sections), batch_size):
        batch = sections[i:i + batch_size]
        batch_num = i // batch_size + 1
        if batch_num == 1 or batch_num % 50 == 0 or batch_num == total_batches:
            logger.info("LLM extraction batch %d/%d (%d sections)", batch_num, total_batches, len(batch))

        user_msg = _build_sections_message(batch)

        try:
            raw_refs = _call_llm(system, user_msg)
            consecutive_failures = 0
        except (httpx.HTTPError, RuntimeError) as e:
            consecutive_failures += 1
            logger.error("LLM call failed for batch %d: %s", batch_num, e)
            if consecutive_failures >= 3:
                logger.error("3 consecutive failures — aborting LLM extraction (check ANTHROPIC_API_KEY)")
                break
            continue

        matches = _raw_to_reference_matches(raw_refs)

        for match in matches:
            # Find which section this match belongs to by checking raw refs
            for raw in raw_refs:
                if (raw.get("target_id") == match.target_id
                        and raw.get("matched_text") == match.matched_text):
                    sec_id = raw.get("section_id", "")
                    all_refs.setdefault(sec_id, []).append(match)
                    break

    return all_refs
