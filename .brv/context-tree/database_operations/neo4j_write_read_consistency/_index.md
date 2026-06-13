---
children_hash: 06423f9adc4a11a4cf3ef2491d6c5c723fc0fb15c4e3bc59167aea2416ff51ce
compression_ratio: 0.6744186046511628
condensation_order: 1
covers: [corpus_graph_writer_incremental_cleanup.md]
covers_token_total: 731
summary_level: d1
token_count: 493
type: summary
---
## Corpus graph writer incremental cleanup

This layer centers on **`CorpusGraphWriter`** as the single write-side boundary for corpus graph mutations. It handles document bundle upserts, section writes, relationship merges, and status updates in one place, with the main implementation in **`packages/pipeline/src/pipeline/graph/corpus_writer.py`**.

### Core mutation flow
The write path follows a consistent sequence:
- **merge document**
- **write sections**
- **delete stale sections**
- **clear changed embeddings**
- **merge relationships**

This design keeps reruns incremental rather than forcing full graph regeneration.

### Incremental cleanup behavior
Cleanup is intentionally surgical:
- stale document sections are removed before section re-merge
- embeddings and chunks are cleared **only** for sections whose content changed
- unchanged sections retain their embeddings and chunks across reruns

This supports efficient reprocessing when a source document changes without invalidating the entire corpus.

### Relationship handling
Relationship writes are separated into distinct paths:
- **reference edges**: `merge_reference_edges` handles `REFERENCES` and `REFERENCES_DOCUMENT`
- **amendments**: `merge_amendments` also marks affected documents with amendment status
- **supersessions**: `merge_supersessions` writes superseded-by style edges with effective date and reason
- **concept links**: `merge_concept_links` supports `COVERS`, `DEFINES`, and `RESTRICTS`

### Operational rules
Key rules preserved in this layer:
- use one write-side boundary for corpus graph mutations
- delete stale document sections before re-merging sections
- clear embeddings and chunks only for changed section content
- preserve unchanged sections across reruns
- batch graph writes using `GRAPH_BATCH_SIZE`

### Drill-down
See **`corpus_graph_writer_incremental_cleanup.md`** for the full section cleanup rules, write boundary details, and relationship merge behavior.