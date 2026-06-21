---
confidence: 0.95
sources: [database_operations/_index.md, evaluation/_index.md, qa/_index.md, database_operations/_index.md]
synthesized_at: '2026-06-20T18:42:30.180Z'
type: synthesis
title: Schema-aware validation is the common safety net from graph writes to evaluation
summary: Neo4j data is protected by the same validation-first discipline whether it is being written, retrieved, or scored.
tags: [validation, neo4j, evaluation, qa, graph]
related: []
keywords: [schema, validation, zod, neoj4, optional-match, rewrite, grounded, verification, writes, scoring]
createdAt: '2026-06-20T18:42:30.180Z'
updatedAt: '2026-06-20T18:42:30.180Z'
---

# Schema-aware validation is the common safety net from graph writes to evaluation

Across database_operations, evaluation, and qa, the project uses schema-aware normalization and validation as a shared guardrail. The same pattern appears in graph writes, retrieval payload shaping, cross-reference evaluation, and hallucination verification: normalize outputs, filter invalid/null rows, validate against expected schemas, and only then trust the result.

## Evidence

- **database_operations**: Common thread across the synthesis entries: normalize graph outputs before validation, filter null rows after OPTIONAL MATCH, validate payloads with Zod-compatible schemas, and treat structural correctness as a prerequisite.
- **evaluation**: Cross-reference evaluation validates Neo4j relationship coverage and answer scoring fetches evidence from Neo4j before judging outputs; both are tied to graph-backed correctness rather than standalone text matching.
- **qa**: Hallucination verification is final-answer only, gathers evidence from tool-scoped Neo4j helpers, and rewrites unsupported output instead of letting it pass.
- **database_operations**: `CorpusGraphWriter` uses managed transactions with MERGE-based idempotent writes, reinforcing safe mutation boundaries.
