---
confidence: 0.95
sources: [database_operations/_index.md, evaluation/_index.md]
synthesized_at: '2026-06-13T05:58:43.646Z'
type: synthesis
title: Schema-aware validation is the shared guardrail for graph data and evaluation
summary: Neo4j outputs are normalized before validation because the same shape discipline protects retrieval, cross-reference checks, and scoring.
tags: [neo4j, validation, evaluation, schema]
related: []
keywords: [zod, normalization, optional-match, evidence, cross-reference, scoring, graph]
createdAt: '2026-06-13T05:58:43.646Z'
updatedAt: '2026-06-13T05:58:43.646Z'
---

# Schema-aware validation is the shared guardrail for graph data and evaluation

The database_operations and evaluation domains both rely on schema-aware validation to keep downstream logic trustworthy. database_operations emphasizes numeric normalization, null-row filtering, and guarded graph outputs before Zod validation or search/ranking, while evaluation depends on validated Neo4j evidence for answer scoring and cross-reference resolution. This makes validation a cross-layer safety net: if graph payloads are malformed, both retrieval correctness and evaluation metrics degrade.

## Evidence

- **database_operations**: Neo4j data is normalized and filtered before validation, search, or scoring, including numeric normalization and removal of null rows from `OPTIONAL MATCH` results.
- **evaluation**: Answer scoring and cross-reference resolution both fetch Neo4j evidence and depend on validated graph outputs and relationship checks such as `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, and `REFERENCES`.
