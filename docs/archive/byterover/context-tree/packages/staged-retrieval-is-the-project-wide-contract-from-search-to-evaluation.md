---
confidence: 0.97
sources: [packages/_index.md, database_operations/_index.md, packages_pipeline/_index.md, evaluation/_index.md, qa/_index.md]
synthesized_at: '2026-07-10T02:33:44.467Z'
type: synthesis
title: Staged retrieval is the project-wide contract from search to evaluation
summary: Retrieval is consistently treated as overscan, filter, dedupe, rerank, and then evaluate—not a single top-k query.
tags: [retrieval, reranking, evaluation, neo4j]
related: []
keywords: [staged retrieval, overscan, dedupe, reciprocal rank fusion, answer evaluation, cross-reference, fulltext recovery]
createdAt: '2026-07-10T02:33:44.467Z'
updatedAt: '2026-07-10T02:33:44.467Z'
---

# Staged retrieval is the project-wide contract from search to evaluation

Across `packages`, `database_operations`, `evaluation`, `packages_pipeline`, and `qa`, retrieval is modeled as a staged contract rather than a one-shot top-k query. The pattern repeats as candidate collection, overscan, grouping, decontamination, reciprocal-rank fusion or reranking, and only then answer-level or cross-reference evaluation. This explains why Neo4j global top-k is rejected as insufficient, why collector/finalizer split exists, and why evaluation measures grounded outcomes instead of raw retrieval scores.

## Evidence

- **packages**: Neo4j queryNodes(k) is global top-k and too lossy for grouped coverage, so the system overscans per group and then filters/reranks.
- **database_operations**: Hybrid search uses vector embeddings, concept matching, optional fulltext search, reciprocal rank fusion, deduplication, and reranking.
- **packages_pipeline**: collectHybridHitMap and finalizeHybridHits stage collection through fulltext recovery, optional expansion, and final ranking capped by topK.
- **evaluation**: Answer quality evaluation retrieves evidence from Neo4j, then judges answers; cross-reference evaluation validates graph relationships rather than standalone text matching.
- **qa**: Trust is enforced as a chain: retrieve evidence, verify or rewrite unsupported output, then score only grounded answers.
