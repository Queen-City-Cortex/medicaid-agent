---
title: Hybrid Policy Search Tool
tags: []
related: [agent_architecture/navigate_tools/context.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-03T03:43:06.835Z'
updatedAt: '2026-04-03T03:43:06.835Z'
---
## Raw Concept
**Task:**
Document the hybrid searchSections tool that ranks NC Medicaid policy sections for navigator agents using a mix of embeddings, concept graph matches, and full-text hits.

**Changes:**
- Added Voyage-powered embeddings to search queries via embedQuery()
- Run per-type-group section and chunk vector lookups before falling back to concept graph and full-text keyword searches.
- Fuse deduplicated hits from each signal using reciprocal rank fusion (rrfFuse) to produce stable rankings.

**Files:**
- packages/agent/src/tools/search.ts

**Flow:**
query -> embedQuery -> withSession -> per type-group section vector + chunk vector + concept graph + full-text queries -> dedup -> rrfFuse -> topK results

**Timestamp:** 2026-04-03

**Author:** Navigator team

## Narrative
### Structure
searchSections wraps all logic inside a createTool definition: input validation via zod, embedding retrieval with embedQuery, and Neo4j queries to gather SectionHit batches before fusing them. Helper functions recordToHit, dedup, and rrfFuse keep Neo4j-specific data conversion and ranking logic isolated so the execute block remains readable.

### Dependencies
Relies on Neo4j indexes: section_embeddings, chunk_embeddings, PolicyConcept graph relationships, and section_fulltext. Also depends on VOYAGE_API_* env vars plus DEFAULT_TOP_K from config.js.

### Highlights
Type groups are either user-provided filters or DEFAULT_TYPE_GROUPS; each group runs section and chunk vector searches and optionally includes concept graph / full-text lookups. Dedup removes duplicate section IDs before RRF fusion, ensuring the best score survives. The tool returns the topK slice of fused results, preserving metadata like policyNumber, documentType, and a snippet.

### Rules
Rule 1: section vector and chunk vector results must be deduped by sectionId before fusion
Rule 2: If documentTypes filters exist, perGroupK equals topK, otherwise it defaults to at least 10 candidates
Rule 3: Concept graph matching caps sections by s.content_length > 200 and requires section_number to be non-null

### Examples
Example usage: searchSections({ query: "NC Medicaid waiver eligibility", documentTypes: ["dhhs_policy"], topK: 20 }) returns sections from the filtered docTypes fused across vectors, concept graph, and keyword hits.

## Facts
- **hybrid_search_sources**: The search tool fuses four sources (section vector, chunk vector, concept graph, and full-text keyword) via Reciprocal Rank Fusion to return ranked sections. [project]
- **embedding_source**: Embeddings are built by the Voyage API using VOYAGE_MODEL + VOYAGE_API_KEY to support semantic scoring. [project]
- **type_groups**: DEFAULT_TYPE_GROUPS splits documents into clinical_policy, dhhs_policy, and a federal regulation/statute/bulletin cluster for per-group querying. [project]
- **rrf_k**: Reciprocal Rank Fusion uses a smoothing constant RRF_K of 60 when combining ranked lists. [project]
- **per_group_k_logic**: perGroupK equals topK when documentTypes filters exist and otherwise becomes max(topK, 10) to ensure a healthy candidate pool. [project]
