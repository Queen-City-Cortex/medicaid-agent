---
confidence: 0.93
sources: [database_operations/_index.md, qa/_index.md, evaluation/_index.md, architecture/_index.md]
synthesized_at: '2026-07-26T03:28:08.851Z'
type: synthesis
title: Schema-aware validation is the shared safety net across graph writes, retrieval, and QA
summary: Graph data, retrieval payloads, and verification outputs all need normalize-then-validate discipline before downstream use.
tags: [validation, neo4j, qa, evaluation, schema]
related: []
keywords: [normalize, validate, schema, zod, null-row, judge, writer, guardrail]
createdAt: '2026-07-26T03:28:08.851Z'
updatedAt: '2026-07-26T03:28:08.851Z'
---

# Schema-aware validation is the shared safety net across graph writes, retrieval, and QA

database_operations, qa, evaluation, and architecture all emphasize the same guardrail: normalize uncertain Neo4j or retrieval output first, then validate with schema-aware checks so malformed data does not reach scoring, navigation, or mutation boundaries.

## Evidence

- **database_operations**: Across graph writes, retrieval, and evaluation, outputs are normalized, null rows filtered, then validated before downstream use.
- **qa**: The verifier is final-answer-only, uses a two-step relevance and factual-accuracy check, and rewrites unsupported claims immediately rather than retrying.
- **evaluation**: Judge failures are normalized to None so aggregation is not skewed, and cross-reference validation measures resolved versus missed relationships in Neo4j.
- **architecture**: Shared test fakes validate against the real CorpusGraphWriter so renamed or misspelled writer methods fail loudly instead of being recorded silently.
