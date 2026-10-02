---
confidence: 0.96
sources: [database_operations/_index.md, packages/_index.md, evaluation/_index.md, qa/_index.md]
synthesized_at: '2026-06-14T19:24:47.070Z'
type: synthesis
title: Schema-aware validation is the shared safety net from graph writes to evaluation
summary: Graph mutations, retrieval, and evaluation all rely on normalizing output before validation.
tags: [validation, neo4j, retrieval, evaluation]
related: []
keywords: [schema, zod, normalization, deduplication, rerank, verification, judging, relationships]
createdAt: '2026-06-14T19:24:47.070Z'
updatedAt: '2026-06-14T19:24:47.070Z'
---

# Schema-aware validation is the shared safety net from graph writes to evaluation

Across database_operations, packages, evaluation, and qa, the repeated guardrail is schema-aware validation: normalize graph or retrieval output first, then validate it before scoring, routing, or verification so malformed rows, missing relationships, and noisy retrieval hits do not contaminate downstream judgment.

## Evidence

- **database_operations**: Several synthesized entries describe a shared pattern: normalize and filter graph output before validation, search, scoring, or evaluation, including null-row filtering after `OPTIONAL MATCH` and numeric normalization before Zod validation.
- **packages**: Retrieval uses staged overscan, then filtering and reranking, with deduplication by `sectionId` / `section_id` before Reciprocal Rank Fusion merge.
- **evaluation**: Answer evaluation fetches primary/supporting Neo4j section texts, judges answers, and normalizes judge failures so they do not contaminate aggregates; cross-reference evaluation separately validates `REFERENCES_DOCUMENT`, `AMENDS`, and `REFERENCES`.
- **qa**: The hallucination verifier builds prioritized source text from tool lookups and applies `correctedAnswer` immediately when unsupported, making verification a final-answer gate rather than a retry loop.
