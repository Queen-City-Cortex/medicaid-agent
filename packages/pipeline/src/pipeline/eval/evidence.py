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


# Lower = higher priority (kept first when trimming to budget). Mirrors the
# EVIDENCE_TOOLS set in hallucination-verifier.ts plus two ranked-but-never-
# emitted tools so the priority map stays exhaustive if we ever extend it.
AGENT_TOOL_PRIORITY: dict[str, int] = {
    "getSection": 0,
    "getAmendments": 1,
    "getDocument": 2,
    "lookupPolicy": 3,
    "resolveAnswerFrame": 4,
    "followReferences": 5,
    "findConceptSections": 6,
    "searchSections": 7,
}


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
    - Golden sections come first, verbatim, in their input order. Golden is the
      anchor; it is never trimmed for budget.
    - Agent sources are appended afterward, ordered by tool priority
      (getSection > getAmendments > getDocument > …). Entries whose key matches
      a golden section id are skipped (golden already covers them).
    - If the combined size exceeds ``budget_bytes``, agent sources are dropped
      from the back (lowest priority first) until we fit. Golden always fits.
    """
    golden_ids = _golden_section_ids(golden_sections)

    golden_blocks: list[str] = []
    for sec in golden_sections:
        text = (sec.get("text") or "").strip()
        if text:
            golden_blocks.append(text)

    # Agent sources, deduped against golden and ordered by priority.
    agent_ordered: list[dict] = []
    for src in agent_sources:
        if not isinstance(src, dict):
            continue
        # Dedup getSection entries that point at a section already in golden.
        if src.get("toolName") == "getSection" and src.get("key") in golden_ids:
            continue
        # Skip empty-text entries (nothing to add).
        if not (src.get("text") or "").strip():
            continue
        agent_ordered.append(src)
    agent_ordered.sort(key=_agent_priority)

    agent_blocks = [_render_agent_block(src) for src in agent_ordered]

    # Budget: golden is mandatory; agent blocks are appended until we cross
    # the budget. We account for block bytes (utf-8) plus the `\n\n` separator
    # the judge renderer joins with.
    separator_len = len("\n\n")

    def size_of(blocks: list[str]) -> int:
        if not blocks:
            return 0
        total = sum(len(b.encode("utf-8")) for b in blocks)
        total += separator_len * (len(blocks) - 1)
        return total

    golden_bytes = size_of(golden_blocks)
    accepted: list[str] = []
    remaining = max(0, budget_bytes - golden_bytes)
    budget_trimmed = False

    for block in agent_blocks:
        block_bytes = len(block.encode("utf-8"))
        overhead = separator_len if accepted or golden_blocks else 0
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
