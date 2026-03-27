"""Level 1: Retrieval evaluation — does vector search return the right sections?"""

import voyageai

from pipeline.config import VOYAGE_API_KEY, EMBEDDING_MODEL, EVAL_DEFAULT_TOP_K
from pipeline.embeddings.indexer import vector_search
from pipeline.eval.metrics import precision_at_k, recall_at_k, mrr


def evaluate_retrieval(entries: list[dict], top_k: int | None = None) -> list[dict]:
    """
    Run retrieval eval for each golden dataset entry.

    Returns per-question results with metrics.
    """
    top_k = top_k or EVAL_DEFAULT_TOP_K

    if not VOYAGE_API_KEY:
        raise RuntimeError("VOYAGE_API_KEY not set")

    client = voyageai.Client(api_key=VOYAGE_API_KEY)
    results: list[dict] = []

    for entry in entries:
        # Embed the question
        embed_result = client.embed(
            [entry["question"]], model=EMBEDDING_MODEL, input_type="query"
        )
        query_embedding = embed_result.embeddings[0]

        # Run vector search — returns dicts with section_id, section_number, policy_number, etc.
        search_results = vector_search(query_embedding, top_k=top_k)

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
