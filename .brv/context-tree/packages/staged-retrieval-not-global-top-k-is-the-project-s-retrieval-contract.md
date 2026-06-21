---
confidence: 0.96
sources: [packages/_index.md, database_operations/_index.md, evaluation/_index.md, packages/_index.md]
synthesized_at: '2026-06-20T18:42:30.182Z'
type: synthesis
title: Staged retrieval, not global top-k, is the project’s retrieval contract
summary: Search quality depends on overscan, filtering, deduplication, and reranking rather than a single top-k pass.
tags: [retrieval, ranking, neo4j, evaluation, search]
related: []
keywords: [overscan, rerank, fusion, dedupe, sectionId, top-k, coverage, recall, ranking, intent]
createdAt: '2026-06-20T18:42:30.182Z'
updatedAt: '2026-06-20T18:42:30.182Z'
---

# Staged retrieval, not global top-k, is the project’s retrieval contract

Across packages, database_operations, and evaluation, the retrieval stack consistently rejects naive global top-k selection. Instead it overscans candidates per group, filters by type or intent, deduplicates by stable identity, and applies final reranking or fusion to preserve coverage and answer quality.

## Evidence

- **packages**: Canonical flow is query intent → candidate scoring → vector overscan → topical filtering → group-specific ranking → RRF merge; retrieval avoids single-pass global top-k.
- **database_operations**: The retrieval stack combines vector, chunk, concept, and keyword fulltext signals using Reciprocal Rank Fusion, deduplicates results by `section_id`, and uses per-group overscan.
- **evaluation**: The evaluation findings concluded that the bottleneck appears structural, not embedding-model selection, reinforcing that retrieval design matters more than one model swap.
- **packages**: Neo4j `queryNodes(k)` returns global top-k, so the system compensates by overscanning first, then filtering and reranking.
