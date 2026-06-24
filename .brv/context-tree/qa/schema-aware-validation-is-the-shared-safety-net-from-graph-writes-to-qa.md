---
confidence: 0.93
sources: [database_operations/_index.md, evaluation/_index.md, qa/_index.md]
synthesized_at: '2026-06-23T02:57:24.791Z'
type: synthesis
title: Schema-aware validation is the shared safety net from graph writes to QA
summary: Graph output must be normalized and schema-checked before it is trusted by retrieval, evaluation, or QA.
tags: [validation, neo4j, qa, evaluation]
related: []
keywords: [schema, validation, zod, grounding, verification, evidence, normalize, trust]
createdAt: '2026-06-23T02:57:24.791Z'
updatedAt: '2026-06-23T02:57:24.791Z'
---

# Schema-aware validation is the shared safety net from graph writes to QA

A consistent safety pattern spans graph mutation, retrieval shaping, evaluation, and trust verification: normalize outputs first, then validate against a schema, and only then consume them. `database_operations` emphasizes schema-aware validation for graph writes and retrieval payloads; `evaluation` uses Neo4j relationship checks and judged metrics that depend on structured evidence; `qa` requires a final-answer verification chain that builds prioritized source text and rewrites unsupported output instead of letting it pass. The recurring lesson is that correctness is enforced at the boundary where graph-shaped data becomes user-facing truth.

## Evidence

- **database_operations**: Multiple synthesis notes connect graph writes, retrieval payload shaping, cross-reference evaluation, and hallucination verification through the same pattern: normalize outputs before validation and validate against Zod-compatible or equivalent schemas.
- **evaluation**: Level 2 and Level 3 evaluation are grounded in Neo4j evidence retrieval and relationship validation, not standalone text matching.
- **qa**: Hallucination verification is final-answer only, uses prioritized source text from getSection/getDocument/getAmendments/lookupPolicy/followReferences, and applies correctedAnswer when verification fails.
