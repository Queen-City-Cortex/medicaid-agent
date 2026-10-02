---
confidence: 0.95
sources: [database_operations/_index.md, packages/_index.md, evaluation/_index.md]
synthesized_at: '2026-07-10T19:50:59.155Z'
type: synthesis
title: Schema-aware validation is the shared safety net across retrieval and evaluation
summary: Graph outputs must be normalized and filtered before they can be trusted by search, scoring, or verification.
tags: [neo4j, validation, retrieval, evaluation]
related: []
keywords: [schema, validation, neo4j, dedupe, ranking, evidence, sections, filtering]
createdAt: '2026-07-10T19:50:59.155Z'
updatedAt: '2026-07-10T19:50:59.155Z'
---

# Schema-aware validation is the shared safety net across retrieval and evaluation

database_operations, packages, and evaluation all enforce the same contract: normalize graph-shaped data, filter malformed or null rows, then validate before downstream ranking or scoring. The retrieval stack depends on staged candidate collection and dedupe, while evaluation consumes Neo4j evidence and assumes structurally sound relationships and sections.

## Evidence

- **database_operations**: Neo4j safety depends on schema-aware validation: normalize values before Zod/schema validation and filter null or malformed rows after OPTIONAL MATCH.
- **packages**: Retrieval uses staged collection with overscan, filtering, dedupe by stable identity such as sectionId/section_id, and reranking/fusion rather than single-pass top-k.
- **evaluation**: Answer quality evaluation fetches primary and supporting evidence texts from Neo4j section queries before judging outputs, and cross-reference resolution validates document and section relationships in Neo4j.
