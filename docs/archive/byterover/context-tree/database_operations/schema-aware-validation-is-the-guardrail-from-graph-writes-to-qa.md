---
confidence: 0.92
sources: [database_operations/_index.md, evaluation/_index.md, qa/_index.md, agent_architecture/_index.md]
synthesized_at: '2026-06-17T20:30:29.300Z'
type: synthesis
title: Schema-aware validation is the guardrail from graph writes to QA
summary: The same validation-first discipline protects graph mutations, retrieval payloads, and evaluation outputs from malformed data.
tags: [validation, schema, qa, graph]
related: []
keywords: [validation, schema, normalization, verification, rewrite, serialization, markers, structure]
createdAt: '2026-06-17T20:30:29.300Z'
updatedAt: '2026-06-17T20:30:29.300Z'
---

# Schema-aware validation is the guardrail from graph writes to QA

database_operations, evaluation, qa, and agent_architecture all show a shared safety pattern: validate and normalize structured outputs before they propagate. database_operations emphasizes schema-aware graph writes, numeric normalization, and deduplication before fusion; evaluation depends on structured Neo4j relationship checks and normalized score handling; qa requires stable stdout markers, constrained evidence builders, and rewrite-based verification; and agent_architecture includes tool-output validation and durable curation rules for preserving exact patterns and structured context. The common thread is that structural correctness is treated as a prerequisite to downstream trust, not an afterthought.

## Evidence

- **database_operations**: The domain’s recurring pattern is schema-aware, environment-sensitive, incremental graph maintenance with validation and normalization before use, including null-row filtering, numeric normalization, and guarded write paths.
- **evaluation**: Judge failures yield None scores, agent failures yield zero scores with an error explanation, and cross-reference evaluation counts missing document IDs as missed without querying the graph.
- **qa**: Hallucination verification is final-answer only, uses stable stdout markers, limits evidence builders to specific tools, and rewrites unsupported claims instead of retrying blindly.
- **agent_architecture**: The curation guidance requires exact rule preservation, regex patterns, timestamps, and a two-part context model with rawConcept and narrative fields.
