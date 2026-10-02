---
confidence: 0.96
sources: [packages/_index.md, packages_pipeline/_index.md, database_operations/_index.md, evaluation/_index.md]
synthesized_at: '2026-06-23T02:57:24.790Z'
type: synthesis
title: Staged retrieval is the project-wide answer to ranking, routing, and evaluation
summary: Retrieval quality depends on overscan, filtering, deduping, and reranking rather than naive global top-k.
tags: [retrieval, reranking, neo4j, evaluation]
related: []
keywords: [overscan, dedupe, fuse, rank, hybrid, rrf, sectionId, fulltext]
createdAt: '2026-06-23T02:57:24.790Z'
updatedAt: '2026-06-23T02:57:24.790Z'
---

# Staged retrieval is the project-wide answer to ranking, routing, and evaluation

The retrieval stack repeatedly rejects one-shot global top-k in favor of staged collection and ranking. In `packages`, policy corpus retrieval uses overscan, intent filtering, deduplication by stable identity, and late reranking/RRF; `packages_pipeline` records the same collector contract with merge-max semantics and fulltext recovery; `database_operations` applies the same shape through Neo4j hybrid search with per-group vector scans, fulltext search, concept matches, and RRF. This is not just an implementation detail: `evaluation` depends on these staged retrieval behaviors to produce trustworthy answer-quality and cross-reference results.

## Evidence

- **packages**: The canonical retrieval flow is query intent -> candidate scoring -> vector overscan -> topical filtering -> group-specific ranking -> RRF merge, with queryNodes(k) recognized as global top-k and compensated by per-group overscanning.
- **packages_pipeline**: collectHybridHitMap and finalizeHybridHits use stage-ordered collection, merge-by-sectionId semantics, fulltext recovery scoring, and deterministic final ranking when rerankers are absent.
- **database_operations**: Neo4j hybrid retrieval combines vector embeddings per type group, chunk embeddings, keyword fulltext search, concept graph matches, and Reciprocal Rank Fusion with RRF_K = 60.
- **evaluation**: Answer-quality and cross-reference evaluation are tied to Neo4j-backed evidence and relationship validation rather than standalone text matching.
