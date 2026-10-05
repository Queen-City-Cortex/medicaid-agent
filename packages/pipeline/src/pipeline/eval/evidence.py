"""Build the unified evidence bundle the eval judge sees.

Combines curated golden-dataset sections with the tool-sourced evidence the
agent actually read during the turn (emitted by the TS agent CLI as
``---EVIDENCE---`` JSON). The verifier inside the agent already builds this
same bundle for its hallucination check; mirroring it here keeps the judge
aligned with the verifier so the two can't disagree due to different inputs,
only different criteria.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


# Lower = higher priority (claims the agent budget first). Keyed by the
# ``toolName`` values the agent CLI emits (see processors/verifier/evidence.ts);
# names missing here rank after every listed one. Corpus section bodies come
# first, and the ``resolveAnswerFrame`` routing hint, which is advice rather
# than corpus text, comes last.
AGENT_TOOL_PRIORITY: dict[str, int] = {
    "resolveAnswerFrame:section": 0,
    "getSection": 0,
    "getAmendments": 1,
    "getDocument": 2,
    "lookupPolicy": 3,
    "followReferences": 4,
    "findConceptSections": 5,
    "searchSections": 6,
    "resolveAnswerFrame": 7,
}

# Tools whose entries are a corpus section body keyed by section id.
SECTION_TOOLS = frozenset({"getSection", "resolveAnswerFrame:section"})


def _agent_priority(source: dict) -> int:
    return AGENT_TOOL_PRIORITY.get(source.get("toolName", ""), 99)


@dataclass
class EvidenceBundle:
    """Judge-facing evidence bundle plus provenance stats."""

    blocks: list[str]
    sources_used: int
    golden_blocks_used: int
    bytes_in_prompt: int
    budget_trimmed: bool


def _golden_section_ids(golden_sections: Iterable[dict]) -> set[str]:
    ids: set[str] = set()
    for sec in golden_sections:
        sid = sec.get("section_id")
        if sid:
            ids.add(sid)
    return ids


def _render_golden_block(section: dict) -> str:
    """Label a golden section with its id so the judge can tell which policy
    document a block belongs to."""
    text = (section.get("text") or "").strip()
    section_id = section.get("section_id")
    if not text or not section_id:
        return text
    return f"--- Golden section: {section_id} ---\n{text}"


def _render_agent_block(source: dict) -> str:
    """Wrap an agent-sourced entry with a labelled header so the judge can tell
    it apart from golden sections and knows which tool produced it."""
    tool = source.get("toolName") or "unknown"
    key = source.get("key") or ""
    text = source.get("text") or ""
    header = f"--- Evidence: {tool}" + (f" → {key}" if key else "") + " ---"
    return f"{header}\n{text}".rstrip()


def build_judge_evidence(
    golden_sections: list[dict],
    agent_sources: list[dict],
    *,
    budget_bytes: int = 80_000,
) -> EvidenceBundle:
    """Assemble evidence blocks for the judge.

    ``golden_sections`` is a list of dicts with at least ``section_id`` and
    ``text`` keys (the latter is the pre-fetched Neo4j content). ``agent_sources``
    is the parsed ``---EVIDENCE---`` payload: a list of dicts with
    ``toolName``/``key``/``text`` keys, matching ``SourceEntry`` in
    ``hallucination-verifier.ts``.

    Rules:
    - Golden sections come first, in their input order, each under a
      ``--- Golden section: <section id> ---`` header. Golden is the
      anchor; it is never trimmed and is not charged against the budget.
    - Agent sources are appended afterward, ordered by tool priority
      (section bodies > getAmendments > getDocument > …). Section entries whose
      key matches a golden section id, or a section already taken from another
      tool, are skipped.
    - ``budget_bytes`` caps the agent blocks only. A block that does not fit in
      what remains is skipped, so priority decides who claims the budget first.
    """
    golden_ids = _golden_section_ids(golden_sections)

    golden_blocks = [
        block for sec in golden_sections if (block := _render_golden_block(sec))
    ]

    # Agent sources, deduped against golden and ordered by priority.
    agent_ordered: list[dict] = []
    seen_section_keys = set(golden_ids)
    for src in agent_sources:
        if not isinstance(src, dict):
            continue
        # Skip empty-text entries (nothing to add).
        if not (src.get("text") or "").strip():
            continue
        # Dedup section bodies already in golden or read through another tool.
        if src.get("toolName") in SECTION_TOOLS and src.get("key"):
            if src["key"] in seen_section_keys:
                continue
            seen_section_keys.add(src["key"])
        agent_ordered.append(src)
    agent_ordered.sort(key=_agent_priority)

    agent_blocks = [_render_agent_block(src) for src in agent_ordered]

    # Budget: golden is mandatory and uncharged; agent blocks are accepted
    # while they fit the budget. We account for block bytes (utf-8) plus the
    # `\n\n` separator the judge renderer joins with.
    separator_len = len("\n\n")

    def size_of(blocks: list[str]) -> int:
        if not blocks:
            return 0
        total = sum(len(b.encode("utf-8")) for b in blocks)
        total += separator_len * (len(blocks) - 1)
        return total

    accepted: list[str] = []
    remaining = budget_bytes
    budget_trimmed = False

    for block in agent_blocks:
        block_bytes = len(block.encode("utf-8"))
        overhead = separator_len if accepted else 0
        if block_bytes + overhead <= remaining:
            accepted.append(block)
            remaining -= block_bytes + overhead
        else:
            budget_trimmed = True

    final_blocks = golden_blocks + accepted
    return EvidenceBundle(
        blocks=final_blocks,
        sources_used=len(accepted),
        golden_blocks_used=len(golden_blocks),
        bytes_in_prompt=size_of(final_blocks),
        budget_trimmed=budget_trimmed,
    )
