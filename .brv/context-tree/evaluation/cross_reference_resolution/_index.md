---
children_hash: 4591f693eb622dd147d76a6d104dc02f64a3296b010c758898d6a9797140df71
compression_ratio: 0.5826235093696763
condensation_order: 1
covers: [context.md, cross_reference_resolution_evaluation.md]
covers_token_total: 587
summary_level: d1
token_count: 342
type: summary
---
## cross_reference_resolution overview
- **Purpose:** Documents the Level 2 evaluation workflow validating golden cross-references before generating resolution metrics; see `context.md` for the process scope and definitions of relationships.
- **Key relationships:** Relies on `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, and `REFERENCES` Neo4j edges to tie entries to documents and sections, then computes precision/recall from resolved vs. total cross-references.

## Level 2 evaluation pipeline (`cross_reference_resolution_evaluation.md`)
- **Task & location:** `packages/pipeline/src/pipeline/eval/levels/cross_ref.py` iterates each golden entry’s `cross_refs`, validating Neo4j edges at both document and section levels.
- **Flow:** For each cross-reference, confirm document IDs exist; if not, count as missed. Otherwise, query for either a `REFERENCES_DOCUMENT`/`AMENDS` relationship, and, failing that, explore section-level `REFERENCES` paths before tallying resolved versus missed counts.
- **Impact:** Enhancements increased resolved coverage from 0/5 to 2/5; unresolved items (`q-004`, `q-009`, `q-020`) highlight gaps in the extraction pipeline.
- **Metrics:** Precision and recall use `resolved_count ÷ total_cross_refs`, defaulting to zero when no references exist; false positives remain zero because only successful vs. missed matches are tracked.