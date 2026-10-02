---
confidence: 0.9
sources: [packages/_index.md, packages/_index.md, database_operations/_index.md, agent_architecture/_index.md]
synthesized_at: '2026-06-13T20:12:43.256Z'
type: synthesis
title: Intent-aware staged retrieval dominates both policy search and graph frame assembly
summary: The retrieval stack first overscans broadly, then filters and ranks by intent before assembling the final evidence frame.
tags: [retrieval, neo4j, ranking, search]
related: []
keywords: [overscan, rerank, dedupe, sectionId, document_type, rrf, hybrid-search, intent]
createdAt: '2026-06-13T20:12:43.256Z'
updatedAt: '2026-06-13T20:12:43.256Z'
---

# Intent-aware staged retrieval dominates both policy search and graph frame assembly

Across packages, database_operations, and agent_architecture, retrieval is not a single top-k lookup but a staged process that overscans candidates, filters by document type or relevance, dedupes by section identity, and then merges or reranks by intent. This same pattern shows up in policy-corpus search, Neo4j hybrid search, and the broader agent retrieval tooling.

## Evidence

- **packages**: The retrieval pipeline follows query intent -> candidate scoring -> vector overscan -> topical filtering -> group-specific ranking -> RRF merge.
- **packages**: Neo4j queryNodes(k) is global top-k only, so the system overscans per type group first, then filters by document_type, dedupes by sectionId, and merges with reciprocal rank fusion.
- **database_operations**: Hybrid retrieval blends vector, chunk, concept-graph, and fulltext signals, then deduplicates by section_id before fusion.
- **agent_architecture**: The packages_pipeline topic documents Neo4j vector querying, vectorScanK overscan, fulltext recovery, and sectionId deduplication as the core retrieval behavior.
