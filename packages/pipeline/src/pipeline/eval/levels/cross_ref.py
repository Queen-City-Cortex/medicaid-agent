"""Level 2: Cross-reference resolution evaluation."""

from pipeline.graph.connection import get_session
from pipeline.references.extractor import extract_references
from pipeline.references.resolver import resolve_reference


def evaluate_cross_refs(entries: list[dict]) -> list[dict]:
    """
    Evaluate cross-reference resolution for golden dataset entries.

    For each entry with cross_references in the evidence, checks whether
    the resolver correctly finds the target section.
    """
    results: list[dict] = []

    for entry in entries:
        cross_refs = entry["evidence"].get("cross_references", [])
        if not cross_refs:
            continue

        resolved_count = 0
        missed_count = 0
        false_count = 0
        extraction_miss_count = 0

        for xref in cross_refs:
            from_section = xref["from_section"]
            to_section = xref["to_section"]

            # Get the from_section's content
            with get_session() as session:
                result = session.run(
                    "MATCH (s:Section {id: $sid}) RETURN s.content_text, s.document_id",
                    {"sid": from_section},
                )
                record = result.single()

            if not record:
                extraction_miss_count += 1
                continue

            content = record["s.content_text"] or ""
            doc_id = record["s.document_id"]

            # Extract references from the section text
            refs = extract_references(content)

            # Try to resolve each extracted reference
            found_target = False
            for ref in refs:
                resolution = resolve_reference(ref, from_section, doc_id)
                if resolution["resolved"]:
                    if resolution["target_node_id"] == to_section:
                        found_target = True
                        break

            if found_target:
                resolved_count += 1
            else:
                # Check if any reference was even extracted that could point to the target
                if not refs:
                    extraction_miss_count += 1
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
            "false_resolutions": false_count,
            "extraction_misses": extraction_miss_count,
            "precision": resolved_count / total if total > 0 else 0.0,
            "recall": resolved_count / total if total > 0 else 0.0,
            "mrr": 0.0,  # Not applicable for cross-ref eval
            "primary_hit": resolved_count > 0,
        })

    return results
