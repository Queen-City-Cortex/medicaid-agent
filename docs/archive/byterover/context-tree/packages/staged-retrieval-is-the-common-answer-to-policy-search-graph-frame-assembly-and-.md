---
confidence: 0.95
sources: [packages/_index.md, database_operations/_index.md, qa/_index.md]
synthesized_at: '2026-06-14T19:24:47.071Z'
type: synthesis
title: Staged retrieval is the common answer to policy search, graph frame assembly, and QA trust
summary: All the search stacks avoid single top-k retrieval and instead overscan, filter, dedupe, then rerank or verify.
tags: [retrieval, ranking, neo4j, qa]
related: []
keywords: [overscan, fusion, reranking, dedupe, sectionId, evidence, top-k, hybrid-search]
createdAt: '2026-06-14T19:24:47.071Z'
updatedAt: '2026-06-14T19:24:47.071Z'
---

# Staged retrieval is the common answer to policy search, graph frame assembly, and QA trust

Across packages, database_operations, and qa, the system consistently rejects single-pass global top-k retrieval in favor of staged candidate collection: overscan broadly, filter by intent or document type, dedupe by stable identity, then rerank, fuse, or verify the result set.

## Evidence

- **packages**: Policy-corpus retrieval uses per-type-group vector overscan via `vectorScanK(profile.perGroupK)`, filtering by `document_type`, deduping by `sectionId`, and final RRF merge.
- **database_operations**: Neo4j hybrid search combines section embeddings, chunk embeddings, concept graph matches, and fulltext keyword hits, then deduplicates by `section_id` before Reciprocal Rank Fusion with `RRF_K = 60`.
- **qa**: The evaluation and verifier chain depends on retrieving the right evidence first, then scoring or rewriting against that evidence; unsupported answers are corrected immediately rather than trusted.
