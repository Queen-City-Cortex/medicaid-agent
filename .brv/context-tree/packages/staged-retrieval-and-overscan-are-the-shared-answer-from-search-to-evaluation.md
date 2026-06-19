---
confidence: 0.97
sources: [packages/_index.md, database_operations/_index.md, evaluation/_index.md]
synthesized_at: '2026-06-19T16:49:15.257Z'
type: synthesis
title: Staged retrieval and overscan are the shared answer from search to evaluation
summary: The system consistently prefers overscan, filtering, deduplication, and reranking over a single top-k pass.
tags: [retrieval, ranking, fusion, evaluation]
related: []
keywords: [overscan, rerank, dedupe, fusion, recall, rank, search, evaluation, candidate, retrieval]
createdAt: '2026-06-19T16:49:15.257Z'
updatedAt: '2026-06-19T16:49:15.257Z'
---

# Staged retrieval and overscan are the shared answer from search to evaluation

Across packages, database_operations, and evaluation, retrieval quality depends on staged candidate collection rather than trusting one global ranking step. Policy search uses overscan, filtering, deduplication, and reciprocal rank fusion; graph search and frame assembly split candidate gathering from final narrowing; and evaluation measures these retrieval behaviors end-to-end instead of judging single-pass scores in isolation.

## Evidence

- **packages**: The retrieval cluster emphasizes staged retrieval with overscan, filtering, deduplication, and reranking/fusion, noting that the system avoids trusting a single global top-k pass.
- **database_operations**: Hybrid retrieval combines vector embeddings, chunk embeddings, fulltext search, and concept graph matches, then ranks them with Reciprocal Rank Fusion while deduplicating by section_id before fusion.
- **evaluation**: The evaluation system is a golden-entry-driven pipeline that invokes the agent, retrieves Neo4j evidence, judges outputs, and aggregates metrics to surface retrieval and citation gaps.
