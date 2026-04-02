---
title: NC Medicaid Pipeline CLI
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-02T02:12:15.940Z'
updatedAt: '2026-04-02T02:12:15.940Z'
---
## Raw Concept
**Task:**
Document the NC Medicaid pipeline CLI entrypoint, covering each command and the revised stats command that now explains embedding coverage in detail.

**Changes:**
- Stats command now distinguishes sections with content versus empty structural headings and reports how many are covered directly or via chunk embeddings.
- Provides a total coverage percentage that sums directly embedded and chunk-covered sections, removing the misleading 19k/48k summary.

**Files:**
- src/pipeline/cli.py

**Flow:**
cli entrypoint → parse/load/schema/coverage helpers → reference resolution + embedding + concept commands → inspect/search/eval utilities → run-all orchestrator

**Timestamp:** 2026-04-02

**Author:** NC Medicaid Pipeline team

## Narrative
### Structure
The click-based CLI groups every pipeline action: parsing (Docling converter), loading (Neo4j loader), schema enforcement (constraints and vector index), cross-reference extraction + unresolved reporting, embedding generation + concept seeding/linking, amendment detection, coverage-aware stats, CFR/SSA ingestion, inspection/search utilities, evaluation management (run, compare, list, validate), and a gated run-all orchestration.

### Dependencies
Commands import supporting modules such as pipeline.parse.converter, pipeline.graph.loader/schema/queries, pipeline.references.resolver/amendments, pipeline.embeddings.generator/indexer, pipeline.concepts.seed/linker, embed voyager client, and rely on Neo4j sessions queried via Cypher to report node/edge counts and coverage metrics.

### Highlights
Stats command now prints total sections with content, the number embedded directly, how many are covered via chunk embeddings, the total covered percentage, structural empty headings, and the chunk embed ratio; chunk count query complements section stats to verify how many chunks already store embeddings. Run-all sequences parse → load → federal ingestion → reference resolution → amendments → embeddings → concepts enabling full pipeline completion messaging.

## Facts
- **embedding_coverage_query**: Stats command runs a Cypher query against Section nodes to count total sections, those with embeddings, structural empties, and content sections whose sections are covered via chunks. [project]
- **coverage_breakdown**: Embedding coverage output reports sections_with_content, directly embedded sections, chunk-covered sections, total covered percentage, empty structural headings, and the count of chunk nodes that already have embeddings. [project]
- **chunk_embedding_query**: Chunk coverage detail is retrieved by counting Chunk nodes that already store embeddings so the stats command can show how many chunks will satisfy vector search coverage. [project]
