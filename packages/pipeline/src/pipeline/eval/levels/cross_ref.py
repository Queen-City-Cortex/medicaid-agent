"""Level 2: Cross-reference resolution evaluation."""

from pipeline.graph.connection import get_session


def evaluate_cross_refs(entries: list[dict]) -> list[dict]:
    """
    Evaluate cross-reference resolution for golden dataset entries.

    For each entry with cross_references in the evidence, checks whether
    the graph contains the expected document-level cross-reference relationship.

    Cross-reference entries in the golden dataset use the format:
      {"from_document_id": ..., "to_document_id": ..., "relationship": ...}
    """
    results: list[dict] = []

    for entry in entries:
        cross_refs = entry["evidence"].get("cross_references", [])
        if not cross_refs:
            continue

        resolved_count = 0
        missed_count = 0

        for xref in cross_refs:
            from_doc = xref.get("from_document_id")
            to_doc = xref.get("to_document_id")

            if not from_doc or not to_doc:
                missed_count += 1
                continue

            # Check whether a REFERENCES_DOCUMENT edge exists between the two documents
            with get_session() as session:
                result = session.run(
                    """
                    MATCH (a:Document {id: $from_doc})-[:REFERENCES_DOCUMENT]->(b:Document {id: $to_doc})
                    RETURN count(*) AS cnt
                    """,
                    {"from_doc": from_doc, "to_doc": to_doc},
                )
                record = result.single()
                found = record and record["cnt"] > 0

            if found:
                resolved_count += 1
            else:
                missed_count += 1

        total = len(cross_refs)
        results.append({
            "id": entry["id"],
            "difficulty": entry["difficulty"],
            "reasoning_type": entry["reasoning_type"],
            "total_refs": total,
            "resolved": resolved_count,
            "missed": missed_count,
            "false_resolutions": 0,
            "extraction_misses": 0,
            "precision": resolved_count / total if total > 0 else 0.0,
            "recall": resolved_count / total if total > 0 else 0.0,
            "mrr": 0.0,  # Not applicable for cross-ref eval
            "primary_hit": resolved_count > 0,
        })

    return results
