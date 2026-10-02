---
confidence: 0.95
sources: [packages/_index.md, database_operations/_index.md, evaluation/_index.md, qa/_index.md]
synthesized_at: '2026-06-17T20:30:29.299Z'
type: synthesis
title: Staged retrieval is the shared answer from policy search to evaluation
summary: Retrieval quality is improved by overscan, filter, dedup, and rerank/fusion rather than trusting a single top-k pass.
tags: [retrieval, ranking, neo4j, evaluation]
related: []
keywords: [overscan, dedup, rerank, fusion, provenance, evidence, rank, recall, retrieval]
createdAt: '2026-06-17T20:30:29.299Z'
updatedAt: '2026-06-17T20:30:29.299Z'
---

# Staged retrieval is the shared answer from policy search to evaluation

Across packages, database_operations, evaluation, and qa, the retrieval stack is built around staged selection instead of naive top-k. packages describes overscan-plus-filtering, per-type-group ranking, deduplication by stable identity, and Reciprocal Rank Fusion; database_operations applies the same idea in Neo4j hybrid search with per-group vector searches, concept matches, fulltext hits, and RRF; evaluation depends on retrieved Neo4j evidence before scoring; and qa requires that evidence be fetched and preserved through verification before final-answer scoring. The cross-domain pattern is that correctness comes from controlled intermediate stages and provenance-aware merging, not one-shot retrieval.

## Evidence

- **packages**: The dominant design across the retrieval stack is staged, intent-aware retrieval with overscan, filtering by type or intent, deduplication by stable identity, and reranking/fusion rather than trusting raw top-k results.
- **database_operations**: Neo4j hybrid search merges section embeddings, chunk embeddings, concept graph matches, and fulltext keyword hits, then fuses them with Reciprocal Rank Fusion and deduplicates each source list by section_id.
- **evaluation**: Answer quality evaluation fetches primary and supporting evidence texts from Neo4j section queries before judging answers, and cross-reference resolution validates graph relationships rather than standalone text matching.
- **qa**: The QA domain enforces a trust chain where evidence must be retrieved, verified or rewritten, and then scored against grounded outputs.
