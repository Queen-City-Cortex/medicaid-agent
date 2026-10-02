---
confidence: 0.95
sources: [packages/_index.md, agent_architecture/_index.md, evaluation/_index.md]
synthesized_at: '2026-06-21T19:22:42.189Z'
type: synthesis
title: Staged retrieval is the project’s shared retrieval contract
summary: Across search, policy assembly, and evaluation, the system prefers overscan, filtering, deduplication, and reranking over naive global top-k.
tags: [retrieval, overscan, ranking, evaluation, neo4j]
related: []
keywords: [staged, overscan, dedup, rerank, fusion, retrieval, coverage, top-k]
createdAt: '2026-06-21T19:22:42.189Z'
updatedAt: '2026-06-21T19:22:42.189Z'
---

# Staged retrieval is the project’s shared retrieval contract

packages, agent_architecture, and evaluation all describe the same retrieval rule: broad candidate collection first, then controlled narrowing with identity-based deduplication and reranking/fusion, because global top-k alone is too lossy for policy and evaluation workflows.

## Evidence

- **packages**: The knowledge entries converge on a shared architectural rule: avoid single-pass global top-k behavior and instead use staged retrieval with overscan, filtering, deduplication, and reranking/fusion.
- **agent_architecture**: Retrieval safety relies on coverage-preserving overscan, deduplication by stable identifiers, and careful ranking rather than naive top-k assumptions.
- **evaluation**: The evaluation system is explicitly tied to Neo4j-backed relationships and document sections rather than standalone text matching.
