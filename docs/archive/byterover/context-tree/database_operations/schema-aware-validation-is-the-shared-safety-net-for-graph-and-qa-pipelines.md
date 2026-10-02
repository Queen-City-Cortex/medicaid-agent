---
confidence: 0.94
sources: [database_operations/_index.md, evaluation/_index.md, amendment_detection/_index.md, qa/_index.md]
synthesized_at: '2026-07-10T02:33:44.467Z'
type: synthesis
title: Schema-aware validation is the shared safety net for graph and QA pipelines
summary: Normalization and schema validation are used everywhere the project turns graph data into decisions or scores.
tags: [validation, neo4j, qa, graph]
related: []
keywords: [schema validation, numeric normalization, null filtering, amends edges, judge_answer, evidence fetching, graph correctness]
createdAt: '2026-07-10T02:33:44.467Z'
updatedAt: '2026-07-10T02:33:44.467Z'
---

# Schema-aware validation is the shared safety net for graph and QA pipelines

`database_operations`, `evaluation`, `amendment_detection`, and `qa` all depend on validating graph-shaped data before it influences downstream behavior. The recurring pattern is normalize first, filter malformed or null rows, then validate via schema or graph rules; this is visible in Neo4j read/write consistency, answer scoring, amendment edge creation, and final-answer verification. The result is one correctness contract spanning writes, retrieval, and scoring.

## Evidence

- **database_operations**: Schema-aware validation is the common guardrail across graph writes, retrieval, and QA, including numeric normalization and null-row filtering after OPTIONAL MATCH.
- **evaluation**: Answer scoring fetches evidence texts from Neo4j section queries before judge_answer runs, and cross-reference evaluation relies on explicit Neo4j relationship types.
- **amendment_detection**: Amendment detection extracts context, deduplicates change descriptions per source/target, and writes batched AMENDS edges into Neo4j.
- **qa**: The hallucination verifier builds prioritized source text from getSection, getDocument, getAmendments, lookupPolicy, and followReferences before rewriting unsupported claims.
