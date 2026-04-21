"""Level 4: Citation accuracy evaluation.

Deterministic URL-set precision/recall against the golden dataset's primary
and supporting sections. Reads from a cached answer-eval result file — no
agent rerun, no judge call. Neo4j is consulted once to build a
section_id → document source_url map for the golden sections.
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


def _normalize_url(url: str | None) -> str | None:
    """Canonicalize URLs for set comparison.

    Strips fragments + common DHHS `?attachment` / `?format=` query junk,
    lowercases host, strips trailing slash. Keeps enough signal that two URLs
    pointing to different policy PDFs won't collapse to the same key.
    """
    if not url:
        return None
    parts = urlsplit(url.strip())
    host = parts.netloc.lower()
    path = parts.path.rstrip("/")
    # DHHS policy PDFs are served as `/foo/download?attachment` — drop the
    # attachment flag so the URL matches against the same policy cited without it.
    query = parts.query
    if query in {"attachment", "format=pdf", "format=PDF"}:
        query = ""
    return urlunsplit((parts.scheme.lower(), host, path, query, ""))


def _load_cached_answer_result(path: str | Path) -> dict:
    data = json.loads(Path(path).read_text())
    if "per_question" not in data:
        raise ValueError(f"{path} does not look like an answer-eval result (no per_question field)")
    return data


def _lookup_section_urls(section_ids: set[str]) -> dict[str, str]:
    """Query Neo4j for each section's owning-document source_url."""
    if not section_ids:
        return {}
    from pipeline.graph.connection import get_session

    with get_session() as session:
        result = session.run(
            """
            MATCH (d:Document)-[:HAS_SECTION]->(s:Section)
            WHERE s.id IN $ids
            RETURN s.id AS section_id, d.source_url AS url
            """,
            {"ids": list(section_ids)},
        )
        return {record["section_id"]: record["url"] for record in result if record["url"]}


def _f1(precision: float | None, recall: float | None) -> float | None:
    if precision is None or recall is None:
        return None
    if precision + recall == 0:
        return 0.0
    return round(2 * precision * recall / (precision + recall), 4)


def _score_entry(
    entry: dict,
    cited_urls_raw: list[str],
    section_url_map: dict[str, str],
) -> dict:
    """Compute per-question citation precision/recall/f1."""
    primary_sections = entry.get("evidence", {}).get("primary_sections", []) or []
    supporting_sections = entry.get("evidence", {}).get("supporting_sections", []) or []

    primary_ids = {s["section_id"] for s in primary_sections if s.get("section_id")}
    supporting_ids = {s["section_id"] for s in supporting_sections if s.get("section_id")}

    expected_primary_urls = {
        _normalize_url(section_url_map[sid]) for sid in primary_ids if sid in section_url_map
    }
    expected_primary_urls.discard(None)
    expected_supporting_urls = {
        _normalize_url(section_url_map[sid]) for sid in supporting_ids if sid in section_url_map
    }
    expected_supporting_urls.discard(None)
    expected_all_urls = expected_primary_urls | expected_supporting_urls

    cited_urls = {_normalize_url(u) for u in cited_urls_raw}
    cited_urls.discard(None)

    precision: float | None
    recall: float | None

    if cited_urls:
        precision = round(len(cited_urls & expected_all_urls) / len(cited_urls), 4)
    else:
        precision = None

    if expected_primary_urls:
        recall = round(len(cited_urls & expected_primary_urls) / len(expected_primary_urls), 4)
    else:
        recall = None

    f1 = _f1(precision, recall)

    missing = sorted(expected_primary_urls - cited_urls)
    extraneous = sorted(cited_urls - expected_all_urls)

    primary_hit = bool(expected_primary_urls & cited_urls) if expected_primary_urls else None

    return {
        "id": entry["id"],
        "difficulty": entry.get("difficulty"),
        "reasoning_type": entry.get("reasoning_type"),
        "citation_precision": precision,
        "citation_recall": recall,
        "citation_f1": f1,
        "cited_url_count": len(cited_urls),
        "expected_primary_count": len(expected_primary_urls),
        "expected_supporting_count": len(expected_supporting_urls),
        "missing_primary_urls": missing,
        "extraneous_urls": extraneous,
        # Aliases so the generic aggregator in results.py picks these up under the
        # shared retrieval-style metric names (precision_at_k, recall_at_k, mrr,
        # primary_hit_rate). f1 rides along in the mrr slot.
        "precision": precision,
        "recall": recall,
        "mrr": f1,
        "primary_hit": primary_hit,
    }


def evaluate_citations(
    entries: list[dict],
    *,
    from_result: str | None = None,
) -> list[dict]:
    """Level 4 driver.

    `entries` is the filtered golden dataset. `from_result` must point to a
    cached answer-eval result file; the answers and extracted citation URLs
    are read from there — no agent runs.
    """
    if from_result is None:
        raise ValueError(
            "citation eval requires --from-result <path/to/answer.json>. "
            "This level grades cached agent answers; it does not invoke the agent."
        )

    cached = _load_cached_answer_result(from_result)
    cached_by_id = {q["id"]: q for q in cached["per_question"]}

    # Collect every section_id we need a URL for across the filtered entries,
    # then batch-query Neo4j once.
    all_section_ids: set[str] = set()
    for entry in entries:
        for kind in ("primary_sections", "supporting_sections"):
            for section in entry.get("evidence", {}).get(kind, []) or []:
                if section.get("section_id"):
                    all_section_ids.add(section["section_id"])

    section_url_map = _lookup_section_urls(all_section_ids)

    results: list[dict] = []
    for entry in entries:
        cached_q = cached_by_id.get(entry["id"])
        if cached_q is None:
            # Cached result has nothing for this entry — record a blank.
            results.append(
                {
                    "id": entry["id"],
                    "difficulty": entry.get("difficulty"),
                    "reasoning_type": entry.get("reasoning_type"),
                    "citation_precision": None,
                    "citation_recall": None,
                    "citation_f1": None,
                    "precision": None,
                    "recall": None,
                    "mrr": None,
                    "primary_hit": None,
                    "error": f"no cached answer-eval entry for {entry['id']} in {from_result}",
                }
            )
            continue

        cited_urls = (
            (cached_q.get("citation_support") or {}).get("unique_citation_urls") or []
        )
        results.append(_score_entry(entry, cited_urls, section_url_map))

    return results
