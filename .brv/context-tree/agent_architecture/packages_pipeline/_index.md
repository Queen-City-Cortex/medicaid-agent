---
children_hash: 0248ad88a6bfbe705fcc49e8f5b9372840d10322869c5ac9a82b500f93b35482
compression_ratio: 0.7729885057471264
condensation_order: 1
covers: [context.md, crawler_sync_behavior/_index.md, retrieval_fixes/_index.md]
covers_token_total: 1044
summary_level: d1
token_count: 807
type: summary
---
# packages_pipeline

Structural overview of retrieval backend behavior and scoring adjustments for reliable hybrid policy search.

## Main themes
- **Neo4j vector retrieval coverage**: `queryNodes(k)` returns global top-k, so retrieval must overscan per group before filtering.
- **Hybrid merging and ranking**: results are deduped and merged on `sectionId`, then reranked with fulltext/expansion hits preserved.
- **Crawler sync behavior**: sync lifecycle is split into download and check phases to avoid duplicate work and premature deletion.

## Child entry drill-down

### `crawler_sync_behavior/_index.md`
Summarizes `crawler_sync_behavior.md`, which documents the sync lifecycle in `packages/crawler/src/crawl/sync.ts`.

- Core pieces: `SyncStats`, `SyncContext`, `applyResult`, `processDocuments`, `runDownloadPhase`, `runCheckPhase`
- Phase design:
  - download and check are separated to reduce duplicate fetches and improve state handling
  - processed IDs from `runDownloadPhase` are passed to `runCheckPhase` via `skipIds`
- 404 handling:
  - documents are not removed on first 404
  - removal happens only after `config.notFoundRemovalThreshold` or the default threshold
  - consecutive 404s and other failures are tracked before status changes
- Dependencies:
  - registry, fetcher, downloader, and source-type directory mapping
  - configurable `config.notFoundRemovalThreshold`
- Key facts:
  - `HttpStatusError` carries `statusCode`
  - default removal threshold is 3 consecutive 404s
  - HTML payloads are rejected for binary-only families
  - `better-sqlite3` 12 is required for Node 26

### `retrieval_fixes/_index.md`
Summarizes `retrieval_fixes.md`, the structural overview of policy-corpus retrieval backend changes.

- **Section vector backend**: `packages/policy-corpus/src/retrieval/backends/section-vector.ts`
  - iterates `profile.typeGroups`
  - overscans each group with `vectorScanK(profile.perGroupK)`
  - filters by `document_type` after retrieval
- **Hybrid collector**: `packages/policy-corpus/src/retrieval/collector.ts`
  - merges hits by `sectionId`
  - includes fulltext and expansion hits
  - reranks before final `topK` trimming
- Retrieval flow:
  - `query analysis -> per-group vector overscan -> group filter -> merge by sectionId -> fulltext merge -> rerank -> topK`
- Important decisions:
  - Neo4j `queryNodes(k)` is global top-k and cannot satisfy post-filtered per-group retrieval by itself
  - per-group retrieval uses overscan with an 8x cap at 200, then group filtering and `LIMIT k`
  - fulltext-only matches get mid-range scores so they survive final ranking
  - existing fulltext hits in the section map receive `FULLTEXT_BOOST`
  - hybrid collection dedupes by `sectionId` before reranking and truncation
- Dependencies:
  - Neo4j vector index `section_embeddings`
  - scoring helpers `FULLTEXT_BOOST`, `rerankRetrievalHit`
  - hybrid merge logic in the collector

## Cross-cutting architectural pattern
Across the retrieval entries, the system favors:
- **overscan first, filter later** for coverage
- **`sectionId` as the merge boundary** for deduplication and reranking
- **phase separation** in operational pipelines to avoid duplicate work and unsafe state transitions