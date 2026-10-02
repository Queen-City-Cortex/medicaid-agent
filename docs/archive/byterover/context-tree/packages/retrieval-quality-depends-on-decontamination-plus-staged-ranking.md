---
confidence: 0.86
sources: [packages/_index.md, agent_architecture/_index.md]
synthesized_at: '2026-06-12T17:22:51.306Z'
type: synthesis
title: Retrieval quality depends on decontamination plus staged ranking
summary: Both policy corpus and agent retrieval use explicit staging, overscan, and filtering to keep search faithful.
tags: [retrieval, ranking, neo4j, vector-search, decontamination]
related: []
keywords: [overscan, fusion, dedup, coverage, memorized-cues, candidate-scoring, searchSections, topK]
createdAt: '2026-06-12T17:22:51.306Z'
updatedAt: '2026-06-12T17:22:51.306Z'
---

# Retrieval quality depends on decontamination plus staged ranking

The packages and agent_architecture domains converge on retrieval as a staged, correctness-first pipeline: packages documents coverage assembly, collector merges, overscan constants, and anti-contamination rules; agent_architecture documents hybrid policy search with per-type-group vector search, concept-graph matching, reciprocal rank fusion, and `searchSections` as the key flow. Both emphasize deduplication, filtering, and ranking after broader candidate collection rather than trusting a single top-k pass.

## Evidence

- **packages**: Coverage assembly uses an explicit 5-stage process, retrieval cleanup removed memorized answer cues, and Neo4j `queryNodes(k)` requires vector overscan before filtering by group.
- **agent_architecture**: Search combines Voyage embeddings, per-type-group vector search, concept-graph matching, reciprocal rank fusion, and Neo4j indexes, with `searchSections` as the key flow.
