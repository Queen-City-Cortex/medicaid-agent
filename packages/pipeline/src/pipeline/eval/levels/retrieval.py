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

        # Run vector search
        search_results = vector_search(query_embedding, top_k=top_k)
        retrieved_ids = [r["section_number"] for r in search_results]

        # Build expected sets from evidence
        primary = {
            s["section_id"]
            for s in entry["evidence"]["primary_sections"]
        }
        supporting = {
            s["section_id"]
            for s in entry["evidence"].get("supporting_sections", [])
        }
        all_relevant = primary | supporting

        # Also match by section_number since IDs may differ slightly
        primary_numbers = {
            s.get("section_number")
            for s in entry["evidence"]["primary_sections"]
            if s.get("section_number")
        }
        supporting_numbers = {
            s.get("section_number")
            for s in entry["evidence"].get("supporting_sections", [])
            if s.get("section_number")
        }

        # Build retrieved set — match by both full section ID and section number
        retrieved_section_ids = []
        for r in search_results:
            # Try to get full section ID from the result
            sid = f"sec:{r.get('doc_id', '')}:{r.get('section_number', '')}" if r.get('doc_id') else ""
            retrieved_section_ids.append(sid)

        # Use section numbers for matching (more robust than full IDs)
        all_relevant_numbers = primary_numbers | supporting_numbers
        retrieved_numbers = [r.get("section_number", "") for r in search_results]

        # Compute metrics using section numbers
        p = precision_at_k(retrieved_numbers, all_relevant_numbers)
        r_val = recall_at_k(retrieved_numbers, all_relevant_numbers)
        m = mrr(retrieved_numbers, primary_numbers)
        primary_hit = any(rn in primary_numbers for rn in retrieved_numbers)

        results.append({
            "id": entry["id"],
            "difficulty": entry["difficulty"],
            "reasoning_type": entry["reasoning_type"],
            "precision": p,
            "recall": r_val,
            "mrr": m,
            "primary_hit": primary_hit,
            "retrieved": retrieved_numbers[:top_k],
            "expected_primary": list(primary_numbers),
            "expected_supporting": list(supporting_numbers),
        })

    return results
