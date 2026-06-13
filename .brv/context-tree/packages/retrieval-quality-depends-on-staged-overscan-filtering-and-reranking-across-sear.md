---
confidence: 0.94
sources: [packages/_index.md, agent_architecture/_index.md]
synthesized_at: '2026-06-13T05:58:43.647Z'
type: synthesis
title: Retrieval quality depends on staged overscan, filtering, and reranking across search stacks
summary: Both policy retrieval and hybrid policy search avoid trusting a single top-k pass, instead overscanning and merging before ranking.
tags: [retrieval, search, neo4j, ranking]
related: []
keywords: [overscan, rerank, fusion, sectionId, vector, hybrid-search, topk]
createdAt: '2026-06-13T05:58:43.647Z'
updatedAt: '2026-06-13T05:58:43.647Z'
---

# Retrieval quality depends on staged overscan, filtering, and reranking across search stacks

The packages and agent_architecture domains converge on the same retrieval principle: broad candidate collection first, then filtering and reranking. packages describes overscan-first retrieval with vectorScanK, sectionId-based merging, and staged ranking after filtering; agent_architecture’s search_tooling and packages_pipeline describe hybrid policy search, per-group vector overscan, concept-graph matching, reciprocal rank fusion, and reranking before topK. The shared insight is that correct retrieval requires multiple signals and a merge boundary, not a single global top-k query.

## Evidence

- **packages**: Policy retrieval uses overscan-first collection, topical filtering, and staged ranking rather than trusting a single top-k pass.
- **agent_architecture**: Hybrid policy search combines embeddings, graph matching, reciprocal rank fusion, per-group vector overscan, and reranking before final topK.
