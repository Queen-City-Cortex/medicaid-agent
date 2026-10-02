---
confidence: 0.89
sources: [agent_architecture/_index.md, database_operations/_index.md, qa/_index.md]
synthesized_at: '2026-06-12T03:05:29.158Z'
type: synthesis
title: Neo4j write/read consistency is protected by schema-aware validation at every layer
summary: Neo4j data is guarded by normalization and filtering rules so bad rows do not break search, navigation, or evaluation.
tags: [neo4j, validation, search, schema, guards]
related: []
keywords: [zod, optional-match, null-handling, rrf, index, cypher, validation, schema]
createdAt: '2026-06-12T03:05:29.158Z'
updatedAt: '2026-06-12T03:05:29.158Z'
---

# Neo4j write/read consistency is protected by schema-aware validation at every layer

Across agent_architecture, database_operations, and qa/evaluation, Neo4j interactions are hardened with schema-aware guards: numeric normalization before Zod validation, null-row filtering after OPTIONAL MATCH, indexed hybrid search fusion, and explicit relationship-based evaluation checks.

## Evidence

- **agent_architecture**: The navigate tools filter null-id rows immediately after OPTIONAL MATCH to satisfy mapDocumentMetadataRecord and Zod schemas, and authoritative document selection uses ordered amendment rows.
- **database_operations**: Hybrid search fuses vector, chunk, concept, and keyword hits via Reciprocal Rank Fusion and relies on filtered PolicyConcept nodes with section_fulltext indexing.
- **qa**: The launch blocker fixes add null handling for section metadata, whitelisted Cypher relationships, and guarded Cypher execution to prevent malformed graph access.
