---
confidence: 0.92
sources: [database_operations/_index.md, database_operations/_index.md, evaluation/_index.md, qa/_index.md]
synthesized_at: '2026-06-13T20:12:43.255Z'
type: synthesis
title: Schema-aware validation is the shared guardrail from graph writes to evaluation
summary: Graph data, retrieval outputs, and eval rows all need validation and normalization before they can safely drive downstream logic.
tags: [validation, neo4j, evaluation, qa]
related: []
keywords: [schema, validation, normalization, optional-match, zod, scoring, evidence, verification]
createdAt: '2026-06-13T20:12:43.255Z'
updatedAt: '2026-06-13T20:12:43.255Z'
---

# Schema-aware validation is the shared guardrail from graph writes to evaluation

Across database_operations, evaluation, and qa, the same safety pattern appears: normalize uncertain graph or retrieval output first, then validate it before scoring, navigation, or verification. This avoids malformed OPTIONAL MATCH rows, bad relationship shapes, and misleading evaluation results from propagating into later stages.

## Evidence

- **database_operations**: OPTIONAL MATCH outputs are filtered to prevent malformed rows from breaking search, navigation, or scoring.
- **database_operations**: Numeric normalization and null-row filtering happen before Zod validation or downstream graph use.
- **evaluation**: Cross-reference validation checks document-level edges first, then falls back to section-level paths using HAS_SECTION and REFERENCES.
- **qa**: The hallucination verifier gathers evidence from tool-scoped sources and rewrites unsupported answers rather than accepting them.
