---
title: Corpus Graph Writer Incremental Cleanup
summary: CorpusGraphWriter upserts documents and sections, deletes stale sections, and clears embeddings only for changed sections to avoid full re-embed.
tags: []
related: [database_operations/neo4j_write_read_consistency/corpusgraphwriter_write_boundary.md]
keywords: []
createdAt: '2026-06-13T03:20:47.900Z'
updatedAt: '2026-06-13T03:20:47.900Z'
---
## Reason
Document the write-side boundary and section cleanup behavior for the corpus graph

## Raw Concept
**Task:**
Document the corpus graph writer responsibilities and incremental section cleanup rules

**Changes:**
- Established a single write-side boundary for graph mutations
- Added stale-section cleanup and changed-section embedding invalidation
- Separated reference, amendment, supersession, and concept-link merge paths

**Files:**
- packages/pipeline/src/pipeline/graph/corpus_writer.py

**Flow:**
merge document -> write sections -> delete stale sections -> clear changed embeddings -> merge relationships

**Timestamp:** 2026-06-13T03:20:13.123Z

## Narrative
### Structure
CorpusGraphWriter wraps Neo4j sessions and centralizes mutation logic for document bundles, relationships, and status updates. Section writes are batched and paired with cleanup routines that preserve unchanged content.

### Dependencies
Depends on Neo4j sessions, batch chunking, and query constants for document, section, and relationship merges.

### Highlights
Cleanup is intentionally surgical: stale sections are removed and only changed sections lose embeddings, which supports incremental reprocessing.

### Rules
1. Use one write-side boundary for corpus graph mutations.
2. Delete stale document sections before re-merging sections.
3. Clear embeddings and chunks only for sections whose content changed.
4. Preserve unchanged sections across reruns.
5. Batch graph writes using GRAPH_BATCH_SIZE.

### Examples
Re-running the loader after a document update should not trigger a full corpus re-embed; only changed sections are invalidated.

## Facts
- **write_side_boundary**: CorpusGraphWriter is the single write-side boundary for corpus graph mutations. [project]
- **upsert_document_bundle**: upsert_document_bundle merges the document and writes sections. [project]
- **reference_edge_types**: merge_reference_edges handles REFERENCES and REFERENCES_DOCUMENT edges separately. [project]
- **amendment_status_marking**: merge_amendments also marks affected documents with the amendment status. [project]
- **supersession_edges**: merge_supersessions writes SUPSERSEDED_BY-style edges with effective date and reason. [project]
- **concept_relationship_types**: merge_concept_links supports COVERS, DEFINES, and RESTRICTS relationships. [project]
- **section_cleanup**: The section writer removes stale document sections and clears embeddings only for changed section content. [project]
- **embedding_retention**: Unchanged sections keep their embeddings and chunks when the loader is rerun. [project]
