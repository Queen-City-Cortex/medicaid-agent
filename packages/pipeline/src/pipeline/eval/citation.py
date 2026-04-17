"""Blind citation-support detector for answer evaluation.

Runs before the LLM judge. For each factual claim sentence in the agent's answer,
it checks two lightweight signals:

1. **Citation discipline** — does the claim sentence carry an inline markdown link
   immediately after it (e.g., `[Policy 8C § 3.2.1](https://...)`)?
2. **Evidence groundedness** — does the claim's key tokens overlap substantially
   with the golden evidence text that was fetched from Neo4j?

These scores complement the LLM-as-judge `citation_quality` / `hallucination`
ratings with a fast, deterministic triangulation signal. Big gaps between LLM
judge scores and these detector ratios are a red flag worth investigating.
"""

from __future__ import annotations

import re
from typing import Iterable


# Any claim-like sentence should mention at least one of these tokens. Narrative
# transitions like "Let me check..." will lack these and get filtered out.
_CLAIM_TOKENS_RE = re.compile(
    r"(?:\$|%"
    r"|\bPolicy\s+\w|Policy\s*\d"
    r"|\b\d{1,4}\s*(?:CFR|USC|SSA)\b"
    r"|\bMA-\d"
    r"|\b§|\bsection\s+\d|\bsubsection\b"
    r"|\bper\s+(?:year|month|visit|day|episode|calendar)"
    r"|\b(?:visits?|days?|hours?|units?|episodes?)\b"
    r"|\b(?:eligible|eligibility|not\s+covered|covered|limit|limits|criteria|threshold|age\s+\d)"
    r"|\b\d+\s*(?:years?|months?|visits?|days?|hours?|units?)\b"
    r")",
    re.IGNORECASE,
)

# Narrative / meta sentence starters that don't need citations.
_META_STARTERS_RE = re.compile(
    r"^(?:i\s|let\s+me\s|here(?:\s|'s)|based\s+on|according\s+to\s+(?:my|our)|"
    r"to\s+summarize|in\s+summary|overall|note:|disclaimer)",
    re.IGNORECASE,
)

_MARKDOWN_LINK_RE = re.compile(r"\[([^\]\n]+)\]\(([^)\s]+)\)")

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z(\[])")


def _split_sentences(text: str) -> list[str]:
    """Rough sentence splitter that respects markdown links with periods inside."""
    # Strip markdown headings / list markers so they don't break sentence splits.
    cleaned = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.MULTILINE)
    cleaned = re.sub(r"^\s{0,3}[-*]\s+", "", cleaned, flags=re.MULTILINE)
    # Collapse soft breaks inside sentences.
    cleaned = re.sub(r"[\t ]+", " ", cleaned)
    sentences = _SENTENCE_SPLIT_RE.split(cleaned)
    return [s.strip() for s in sentences if s.strip()]


def _is_claim_sentence(sentence: str) -> bool:
    if not sentence or _META_STARTERS_RE.match(sentence):
        return False
    # Extremely short sentences rarely carry factual content worth citing.
    if len(sentence) < 25:
        return False
    return bool(_CLAIM_TOKENS_RE.search(sentence))


def _sentence_has_citation(sentence: str) -> bool:
    return bool(_MARKDOWN_LINK_RE.search(sentence))


_TOKEN_RE = re.compile(r"[A-Za-z0-9]+")
_STOPWORDS = frozenset(
    {
        "the", "and", "for", "with", "that", "this", "are", "not", "from",
        "but", "any", "all", "may", "can", "was", "were", "has", "have",
        "had", "per", "into", "than", "also", "when", "they", "them",
        "their", "there", "which", "who", "whom", "how", "what", "where",
        "must", "will", "should", "shall", "does", "doing", "these", "those",
    }
)


def _tokens(text: str) -> set[str]:
    return {
        t.lower()
        for t in _TOKEN_RE.findall(text)
        if len(t) >= 3 and t.lower() not in _STOPWORDS
    }


def _is_grounded(sentence: str, evidence_tokens: set[str], min_overlap: int = 3) -> bool:
    if not evidence_tokens:
        return False
    claim_tokens = _tokens(sentence)
    if not claim_tokens:
        return False
    overlap = claim_tokens & evidence_tokens
    return len(overlap) >= min_overlap


def _extract_citations(text: str) -> list[tuple[str, str]]:
    """Return list of (label, url) markdown links."""
    return [(m.group(1).strip(), m.group(2).strip()) for m in _MARKDOWN_LINK_RE.finditer(text)]


def _safe_ratio(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 1.0
    return round(numerator / denominator, 4)


def score_citation_support(
    answer_text: str,
    evidence_texts: Iterable[str],
) -> dict:
    """Score how well `answer_text` cites and is grounded in `evidence_texts`.

    Returns a dict with:
    - total_claims: number of factual claim sentences detected
    - cited_claims: number of claim sentences with an inline markdown citation
    - citation_ratio: cited_claims / total_claims (1.0 when no claims detected)
    - uncited_claims: list of claim sentences without citations (capped)
    - total_citations: total inline citations in the answer
    - unique_citation_urls: distinct citation URLs
    - grounded_claims: claim sentences with token overlap against evidence
    - groundedness_ratio: grounded_claims / total_claims (1.0 when no claims)
    """
    sentences = _split_sentences(answer_text or "")
    claim_sentences = [s for s in sentences if _is_claim_sentence(s)]

    citations = _extract_citations(answer_text or "")
    cited_count = sum(1 for s in claim_sentences if _sentence_has_citation(s))

    evidence_blob = "\n".join(evidence_texts or [])
    evidence_tokens = _tokens(evidence_blob)
    grounded_count = sum(1 for s in claim_sentences if _is_grounded(s, evidence_tokens))

    uncited_claims = [s for s in claim_sentences if not _sentence_has_citation(s)]
    # Cap so the JSON payload stays small.
    uncited_preview = uncited_claims[:10]

    return {
        "total_claims": len(claim_sentences),
        "cited_claims": cited_count,
        "citation_ratio": _safe_ratio(cited_count, len(claim_sentences)),
        "uncited_claims": uncited_preview,
        "total_citations": len(citations),
        "unique_citation_urls": sorted({url for _, url in citations}),
        "grounded_claims": grounded_count,
        "groundedness_ratio": _safe_ratio(grounded_count, len(claim_sentences)),
    }
