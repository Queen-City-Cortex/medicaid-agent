"""Level 1: Retrieval evaluation — does canonical retrieval return the right sections?"""

from pipeline.config import EVAL_DEFAULT_TOP_K
from pipeline.eval.metrics import precision_at_k, recall_at_k, mrr
from pipeline.retrieval.agent_bridge import search_sections_batch_via_agent_cli

RETRIEVAL_EVAL_BATCH_SIZE = 5


def evaluate_retrieval(entries: list[dict], top_k: int | None = None) -> list[dict]:
    """
    Run retrieval eval for each golden dataset entry.

    Returns per-question results with metrics.
    """
    top_k = top_k or EVAL_DEFAULT_TOP_K

    results: list[dict] = []
    search_results_by_id: dict[str, list[dict]] = {}
    total = len(entries)
    for start in range(0, total, RETRIEVAL_EVAL_BATCH_SIZE):
        batch_entries = entries[start:start + RETRIEVAL_EVAL_BATCH_SIZE]
        end = start + len(batch_entries)
        print(f"[retrieval eval] querying {start + 1}-{end} of {total}", flush=True)
        batch_results = search_sections_batch_via_agent_cli([
            {
                "id": entry["id"],
                "query": entry["question"],
                "top_k": top_k,
            }
            for entry in batch_entries
        ])
        search_results_by_id.update(batch_results)
        print(f"[retrieval eval] completed {end} of {total}", flush=True)

    for entry in entries:
        search_results = search_results_by_id.get(entry["id"], [])

        # Build expected sets from evidence using section_id (document-scoped, not just section_number)
        primary_ids = {
            s["section_id"]
            for s in entry["evidence"]["primary_sections"]
        }
        supporting_ids = {
            s["section_id"]
            for s in entry["evidence"].get("supporting_sections", [])
        }
        all_relevant_ids = primary_ids | supporting_ids

        # Retrieved section IDs from vector search
        retrieved_ids = [r["section_id"] for r in search_results]

        # Compute metrics using full section IDs (document-scoped)
        p = precision_at_k(retrieved_ids, all_relevant_ids)
        r_val = recall_at_k(retrieved_ids, all_relevant_ids)
        m = mrr(retrieved_ids, primary_ids)
        primary_hit = any(rid in primary_ids for rid in retrieved_ids)

        results.append({
            "id": entry["id"],
            "difficulty": entry["difficulty"],
            "reasoning_type": entry["reasoning_type"],
            "precision": p,
            "recall": r_val,
            "mrr": m,
            "primary_hit": primary_hit,
            "retrieved": retrieved_ids[:top_k],
            "expected_primary": list(primary_ids),
            "expected_supporting": list(supporting_ids),
        })

    return results
