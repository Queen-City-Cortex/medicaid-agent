---
children_hash: 20aee91badec3158c85cf4bb25c9909c14f5c2d6409b4bf77e73c05a7e33a882
compression_ratio: 0.4845679012345679
condensation_order: 1
covers: [context.md, crawler_sync_behavior/_index.md, retrieval_fixes/_index.md, ssa_parser_subsection_splitting_fix.md]
covers_token_total: 1944
summary_level: d1
token_count: 942
type: summary
---
# packages_pipeline

Structural overview of the retrieval backend and SSA parsing fixes that support reliable policy-corpus search and citable statute ingestion. The main themes are retrieval coverage preservation, stable dedup/reranking boundaries, and subsection splitting rules for large federal statute sections.

## Retrieval backend behavior
- **context.md** establishes the package-level focus: Neo4j vector querying, `vectorScanK` overscan, fulltext recovery, and `sectionId` deduplication.
- **retrieval_fixes/_index.md** explains the core backend change:
  - `packages/policy-corpus/src/retrieval/backends/section-vector.ts` now iterates `profile.typeGroups`
  - uses `vectorScanK(profile.perGroupK)` to overscan per group
  - filters by `document_type` after retrieval
  - hybrid collection merges hits by `sectionId`, combines fulltext/expansion hits, reranks, then trims to `topK`
- Key architecture decision: Neo4j `queryNodes(k)` is global top-k only, so it cannot satisfy post-filtered per-group retrieval without overscan.
- Important scoring rule: fulltext-only matches are assigned mid-range scores and existing fulltext hits receive `FULLTEXT_BOOST` so they survive reranking.

## Crawl sync lifecycle
- **crawler_sync_behavior/_index.md** documents `packages/crawler/src/crawl/sync.ts`.
- Core structure centers on `SyncStats`, `SyncContext`, `applyResult`, `processDocuments`, `runDownloadPhase`, and `runCheckPhase`.
- Main behavior:
  - download and check phases are separated to reduce duplicate work
  - processed IDs from `runDownloadPhase` are passed to `runCheckPhase` via `skipIds`
  - documents are not removed on first 404; removal waits for `config.notFoundRemovalThreshold` or the default threshold
  - consecutive 404s and failures are recorded before status transitions
- Notable facts:
  - `HttpStatusError` carries `statusCode`
  - default removal threshold is 3 consecutive 404s
  - HTML payloads are rejected for binary-only families
  - `better-sqlite3` 12 is required for Node 26

## SSA parser subsection splitting
- **ssa_parser_subsection_splitting_fix.md** records the fix for parsing large USC HTML statute sections into stable SSA subsections.
- Flow: parse USC HTML → find section heads → map USC to SSA → retain parent section → split large sections into top-level lettered child subsections → ingest and embed.
- Core change:
  - split only top-level lettered subsections into child section dicts
  - preserve parent section full text to keep existing IDs and citations stable
  - apply strict expected-letter sequencing to avoid misclassifying nested roman numeral markers
  - skip unmapped or freestanding USC sections
- Rules and constraints:
  - only sections larger than `SUBSECTION_SPLIT_MIN_CHARS` (30,000) are split
  - subsection markers must follow strict sequence `a -> b -> ... -> z -> aa -> ...`
  - nested roman numerals are not treated as boundaries unless they match the next expected letter
- Key facts:
  - child section IDs are formed as `<parent>-<letter>`
  - parent IDs are retained on children
  - parent text remains intact so citations stay stable
  - post-change workflow requires `ingest-ssa` and embed
- Related drill-down targets: `database_operations/neo4j_hybrid_search/neo4j_hybrid_search_indexing.md` and `agent_architecture/packages_pipeline/context.md`

## Relationships and drill-down map
- **Retrieval coverage and ranking:** `retrieval_fixes/_index.md`
- **Crawler sync phase handling:** `crawler_sync_behavior/_index.md`
- **SSA statute splitting and citation stability:** `ssa_parser_subsection_splitting_fix.md`
- The package-level `context.md` connects the retrieval concerns to the broader `packages_pipeline` scope and highlights the shared concepts used across the fixes.