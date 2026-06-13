---
title: Retrieval Fixes
summary: Fixes for Neo4j vector retrieval overscan, per-group coverage, and fulltext-only hit scoring.
tags: []
related: []
keywords: []
createdAt: '2026-06-12T03:26:43.234Z'
updatedAt: '2026-06-12T03:26:43.234Z'
---
## Reason
Document retrieval backend fixes for vector overscan and fulltext scoring.

## Raw Concept
**Task:**
Document retrieval fixes in the policy corpus search pipeline.

**Changes:**
- Added overscan for section vector queries to recover per-group coverage
- Adjusted fulltext-only hit placement to survive topK selection
- Kept section-level deduplication as the merge boundary

**Files:**
- packages/policy-corpus/src/retrieval/backends/section-vector.ts
- packages/policy-corpus/src/retrieval/collector.ts

**Flow:**
query analysis -> per-group vector overscan -> group filter -> merge by sectionId -> fulltext merge -> rerank -> topK

**Timestamp:** 2026-06-12T03:26:15.012Z

**Author:** ByteRover context engineer

## Narrative
### Structure
The section vector backend iterates over profile.typeGroups and overscans each group with vectorScanK(profile.perGroupK) before filtering by document_type. The collector merges backend hits by sectionId, then applies fulltext and expansion hits before reranking.

### Dependencies
Depends on Neo4j vector indexes (section_embeddings), the hybrid collector merge logic, and shared scoring helpers such as FULLTEXT_BOOST and rerankRetrievalHit.

### Highlights
This fix corrects the false assumption that queryNodes(k) can be post-filtered per group. It also rescues fulltext-only matches by assigning them mid-range scores rather than flooring them below all vector hits.

## Facts
- **vector_index_behavior**: Neo4j vector index queryNodes(k) returns global top-k and cannot pre-filter by document group before retrieval [project]
- **per_group_vector_retrieval**: Per-group vector queries need overscan using vectorScanK, with an 8x cap at 200, then group filtering and LIMIT k [project]
- **fulltext_scoring**: Fulltext-only hits are now placed mid-range instead of below all backends so they can contribute to final ranking [project]
- **fulltext_boost**: Existing fulltext hits in the section map receive a FULLTEXT_BOOST [project]
- **hybrid_deduplication**: Hybrid collection dedupes hits by sectionId before final reranking and topK trimming [project]
