---
confidence: 0.95
sources: [packages/_index.md, packages/_index.md, evaluation/_index.md]
synthesized_at: '2026-06-23T02:10:57.425Z'
type: synthesis
title: Staged retrieval is the project’s shared contract from search to evaluation
summary: The retrieval stack consistently prefers overscan, filtering, deduping, and reranking over naive global top-k selection.
tags: [retrieval, ranking, evaluation, neo4j]
related: []
keywords: [overscan, dedupe, rerank, fusion, top-k, evidence, ranking, pipeline, gating]
createdAt: '2026-06-23T02:10:57.425Z'
updatedAt: '2026-06-23T02:10:57.425Z'
---

# Staged retrieval is the project’s shared contract from search to evaluation

Across packages and evaluation, retrieval is treated as a staged contract rather than a single top-k query. packages documents overscan-plus-filter-plus-rerank behavior, policy-corpus and search tooling rely on grouped retrieval and fusion, and evaluation measures whether that staged pipeline preserves evidence and answer quality end to end.

## Evidence

- **packages**: The shared retrieval pattern is overscan candidates first, filter by intent or document type, dedupe by stable identity, then rerank or fuse at the end.
- **packages**: Neo4j queryNodes(k) is global top-k, so systems compensate by overscanning per group first.
- **evaluation**: The shared pipeline structure flows from golden entries to agent execution, then Neo4j evidence lookup, then judgment/scoring, then metrics.
