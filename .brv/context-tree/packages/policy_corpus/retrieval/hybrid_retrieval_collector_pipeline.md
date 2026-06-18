---
title: Hybrid Retrieval Collector Pipeline
summary: Hybrid retrieval collector uses staged concurrent merges, fulltext recovery, and separate pre/post-expansion coverage boosts; finalizeHybridHits safely hoists repeated sectionMap value collection.
tags: []
related: []
keywords: []
createdAt: '2026-06-18T04:19:50.872Z'
updatedAt: '2026-06-18T04:19:50.872Z'
---
## Reason
Document the staged retrieval pipeline and the non-redundant coverage boost computation in collector.ts.

## Raw Concept
**Task:**
Document the hybrid retrieval collector pipeline in packages/policy-corpus/src/retrieval/collector.ts

**Changes:**
- Clarified that computeDocumentCoverageBoosts() is intentionally called twice for different pipeline stages
- Documented staged concurrent retrieval and merge semantics
- Captured the safe finalizeHybridHits cleanup that hoists repeated sectionMap value collection

**Files:**
- packages/policy-corpus/src/retrieval/collector.ts

**Flow:**
stage 1 backends + fulltext -> stage 3 amendment-title expansion -> stage 4 document expansion and stage 5 change-notice header expansion -> finalize rerank

**Timestamp:** 2026-06-18

**Author:** ByteRover context engineer

## Narrative
### Structure
collector.ts defines mergeMax, collectHybridHitMap, mergeFulltextHits, and finalizeHybridHits. collectHybridHitMap builds the map in ordered stages, while finalizeHybridHits computes coverage boosts again on the expanded hit set before reranking.

### Dependencies
Relies on Neo4j session isolation for concurrent branches, computeDocumentCoverageBoosts() from internal shared utilities, and maybeRerankHits for final ordering.

### Highlights
The first coverage-boost pass feeds document title selection for later expansion stages; the second pass feeds reranking and must not reuse stale pre-expansion boosts. A local refactor safely hoists repeated Array.from(sectionMap.values()) calls without changing behavior.

### Rules
Merges are applied in stage order. mergeMax keeps the highest-scored hit per sectionId. Fulltext recovery is the exception and adjusts scores instead of merge-max semantics.

### Examples
The source note explicitly warns that passing the first computeDocumentCoverageBoosts() result into finalizeHybridHits would feed stale boosts and change ranking.

## Facts
- **compute_document_coverage_boosts_calls**: In packages/policy-corpus/src/retrieval/collector.ts, computeDocumentCoverageBoosts() is called twice with different purposes and must not be deduped between collectHybridHitMap and finalizeHybridHits. [project]
- **pre_expansion_boosts**: The first computeDocumentCoverageBoosts() call runs on the pre-expansion section map to choose titles for stages 4 and 5 expansion. [project]
- **post_expansion_boosts**: The second computeDocumentCoverageBoosts() call in finalizeHybridHits runs on the post-expansion larger map to feed the reranker. [project]
- **finalize_hybrid_hits_cleanup**: Hoisting the repeated Array.from(sectionMap.values()) calls in finalizeHybridHits into a const hits is safe because sectionMap is not mutated in that function. [project]
- **hybrid_retrieval_pipeline**: The file uses an explicit multi-stage hybrid retrieval pipeline with concurrent queries on separate sessions because Neo4j driver sessions do not support concurrent queries. [project]
- **amendment_title_expansion**: Stage 3 applies amendment-title expansion for change-notice queries using up to five deduped change-notice document titles. [project]
- **expansion_inputs**: Stage 4 document expansion and stage 5 change-notice header expansion both use documentTitlesForExpansion derived from the current sectionMap after earlier stages. [project]
- **merge_max_semantics**: mergeMax keeps the highest-scored hit per sectionId and is the default merge semantics for every stage except fulltext recovery. [project]
- **fulltext_recovery**: Fulltext recovery boosts already-found hits with FULLTEXT_BOOST and inserts fulltext-only hits at a mid-range decaying score rather than merge-max behavior. [project]
- **verification_status**: Verified status in the source note says typecheck:tests and vitest 153/153 pass. [project]
