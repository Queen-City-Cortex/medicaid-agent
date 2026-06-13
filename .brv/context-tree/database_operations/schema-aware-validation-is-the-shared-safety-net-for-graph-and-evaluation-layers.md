---
confidence: 0.89
sources: [database_operations/_index.md, agent_architecture/_index.md, qa/_index.md]
synthesized_at: '2026-06-12T17:22:51.305Z'
type: synthesis
title: Schema-aware validation is the shared safety net for graph and evaluation layers
summary: Neo4j data is normalized and filtered before it reaches validation, search, or scoring logic.
tags: [neo4j, validation, qa, search, schema]
related: []
keywords: [zod, normalization, OPTIONAL MATCH, cypher, evidence, cross-reference, guards, validation]
createdAt: '2026-06-12T17:22:51.305Z'
updatedAt: '2026-06-12T17:22:51.305Z'
---

# Schema-aware validation is the shared safety net for graph and evaluation layers

Across database_operations, agent_architecture, and qa, the common pattern is schema-aware validation at every layer: database_operations highlights numeric normalization, null-row filtering after `OPTIONAL MATCH`, and guarded Cypher execution; agent_architecture documents Neo4j tool-output validation with Zod-compatible payloads and structured context queries; qa relies on those validated graph results for evidence retrieval and cross-reference scoring.

## Evidence

- **database_operations**: The cross-cutting consistency entry ties together numeric normalization before Zod validation, null-row filtering after `OPTIONAL MATCH`, indexed hybrid search fusion, and guarded Cypher execution.
- **agent_architecture**: `neo4j_tool_output_validation/_index.md` focuses on numeric normalization / `Integer` conversion, Zod-compatible payloads, container-heading expansion, and structured context-query organization.
- **qa**: The evaluation and hallucination-verification stack retrieves Neo4j evidence and checks graph relationships such as `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, and `REFERENCES`.
