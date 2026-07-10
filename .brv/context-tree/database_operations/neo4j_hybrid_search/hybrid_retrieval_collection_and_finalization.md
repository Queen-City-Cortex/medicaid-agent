---
title: Hybrid Retrieval Collection and Finalization
tags: []
related: [facts/project/context.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-09T02:45:13.931Z'
updatedAt: '2026-07-09T02:45:13.931Z'
---
## Raw Concept
**Task:**
Document hybrid retrieval collection and finalization in policy-corpus search

**Changes:**
- Concurrent backend retrieval now merges by sectionId with merge-max semantics
- Fulltext recovery runs concurrently with stage 1 and inserts fulltext-only sections at a mid-range score
- Amendment-title expansion and change-notice header expansion are applied when relevant
- finalizeHybridHits computes coverage boosts and latest change markers before deterministic reranking

**Files:**
- packages/policy-corpus/src/retrieval/collector.ts

**Flow:**
enabled backends -> fulltext recovery -> amendment-title expansion -> document expansion -> change-notice header expansion -> deterministic finalization

**Timestamp:** 2026-07-09

**Author:** unknown

## Narrative
### Structure
collectHybridHitMap builds a section hit map in staged passes and finalizeHybridHits applies rerankRetrievalHit to each hit before returning top K results.

### Dependencies
Concurrent queries require separate Neo4j sessions because driver sessions do not support concurrent queries. Promise.all preserves input order, and merge-max is order-independent on score.

### Highlights
Fulltext is treated as exact-phrase recovery with FULLTEXT_BOOST for existing hits and a 0.01 insertion floor for new hits. Final ranking uses normalized query terms, procedure codes, requested years, explicit policy numbers, document coverage boosts, and latest change marker values.

### Examples
If no other hits exist, fulltext-only insertion uses a base score of 0.5.
