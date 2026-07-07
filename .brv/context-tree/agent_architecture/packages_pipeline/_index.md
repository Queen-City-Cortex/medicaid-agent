---
children_hash: 33ac2a5728c065d24f2f3a5f26aec3091205718d1348d7a5cc3ba1b8608171c6
compression_ratio: 0.3103615627274933
condensation_order: 1
covers: [context.md, crawler_cli_and_package_docs.abstract.md, crawler_cli_and_package_docs.md, crawler_cli_and_package_docs.overview.md, crawler_source_factories.md, crawler_sync_behavior/_index.md, retrieval_fixes/_index.md, ssa_parser_subsection_splitting_fix.abstract.md, ssa_parser_subsection_splitting_fix.md, ssa_parser_subsection_splitting_fix.overview.md]
covers_token_total: 4121
summary_level: d1
token_count: 1279
type: summary
---
# packages_pipeline

Structural overview of retrieval, crawler, and SSA parsing work under the packages pipeline. The child entries show two main themes: policy-corpus retrieval correctness and crawler/parser infrastructure behavior. Drill down into the named entries below for implementation details and exact rules.

## Core retrieval backend
- **context.md** establishes the retrieval focus: reliable hybrid policy search.
- Key retrieval concepts:
  - **Neo4j `queryNodes(k)`** returns global top-k and cannot be used for post-filtered per-group retrieval.
  - **`vectorScanK` overscan** is required to preserve coverage before filtering.
  - **fulltext recovery** and **sectionId deduplication** are central to hybrid ranking.
- Related drill-down:
  - **retrieval_fixes.md** for the detailed vector overscan and hybrid collector behavior.

## Crawler CLI, package docs, and source discovery
- **crawler_cli_and_package_docs.md** documents the public crawler interface and README expectations.
  - The crawler exposes a **commander-based CLI via `src/index.ts`**.
  - Commands remain valid after source reorganization and are available through npm shortcuts.
  - Common commands include **`crawl`**, **`check`**, **`stats`**, plus examples like `crawl --source clinical_policy` and `export --output registry.json`.
  - The README points to **`docs/superpowers/specs/2026-03-26-nc-medicaid-crawler-design.md`** as the design spec.
- **crawler_source_factories.md** captures the refactor that introduced reusable crawler source factories.
  - `crawl-helpers.ts` exports **`singleIndexSource`**, **`pageCrawlSource`**, and **`pushNewDocuments`**.
  - `singleIndexSource(logPrefix, indexUrl, parse)` handles single-index discovery.
  - `pageCrawlSource(logPrefix, startUrls, parsePage, extractSubpageUrls?, derivePageFromDocument?)` performs **BFS traversal** with `visited`, `queued`, and `seenDocs` sets.
  - Factory-built sources ignore **`sinceYear`** by design.
  - Migrated sources include:
    - single-index: **clinical-policies**, **nctracks**, **dhhs-policies**
    - page crawl: **billing-guidance**, **managed-care-guidance**, **managed-care-contracts**
  - Managed-care contracts uses **`derivePageFromDocument`** for detail-page derivation and keeps bespoke handling for fee-schedules, bulletins, state-plan, and waivers.
- Related drill-down:
  - **crawler_cli_and_package_docs.md**
  - **crawler_source_factories.md**

## Crawler sync behavior
- **crawler_sync_behavior/_index.md** summarizes sync lifecycle behavior in `packages/crawler/src/crawl/sync.ts`.
- Main structure:
  - `SyncStats`
  - `SyncContext`
  - `applyResult`
  - `processDocuments`
  - `runDownloadPhase`
  - `runCheckPhase`
- Key behavior:
  - Download and check phases are separated to reduce duplicate work.
  - Documents are not removed on the first 404; removal happens only after the configured not-found threshold.
  - Processed IDs from download are passed into check via `skipIds`.
  - Error handling tracks consecutive 404s and other failures before status transitions.
- Dependencies:
  - registry, fetcher, downloader, and source-type directory mapping.
- Key facts:
  - `HttpStatusError` carries `statusCode`
  - default removal threshold is **3 consecutive 404s**
  - HTML payloads are rejected for binary-only families
  - `better-sqlite3` 12 is required for Node 26
- Drill-down:
  - **crawler_sync_behavior.md**

## SSA parser subsection splitting
- **ssa_parser_subsection_splitting_fix.md** documents a parser fix for large USC statute sections.
- Main decision:
  - Only **top-level lettered subsections** are split into child sections.
  - Parent section text is preserved so citations and IDs remain stable.
  - Nested roman numeral markers are ignored unless they match the expected next letter.
- Parsing flow:
  - parse USC HTML → find section heads → map USC to SSA → retain parent section → split oversized sections → ingest and embed
- Important rules:
  - Sections larger than **`SUBSECTION_SPLIT_MIN_CHARS` = 30,000** are eligible.
  - Subsection letters must follow strict sequence: `a -> b -> ... -> z -> aa -> ...`
  - Unmapped USC sections are skipped with a warning or note.
- Key entities:
  - `packages/pipeline/src/pipeline/federal/ssa_parser.py`
  - `USC_TO_SSA`
  - `FREESTANDING_USC_SECTIONS`
- Facts:
  - Child subsection IDs use `<parent>-<letter>`
  - Parent citations remain stable
  - Real USC HTML contains **235 subsections across 15 statutes**
- Drill-down:
  - **ssa_parser_subsection_splitting_fix.md**

## Structural relationships
- The retrieval work in **context.md** and **retrieval_fixes.md** is about preserving recall and ranking correctness in the policy-corpus backend.
- The crawler work in **crawler_cli_and_package_docs.md**, **crawler_source_factories.md**, and **crawler_sync_behavior/_index.md** describes how policy sources are discovered, queued, deduplicated, and synchronized.
- The SSA parser fix in **ssa_parser_subsection_splitting_fix.md** supports stable downstream ingestion and citation integrity, aligning with the broader pipeline and retrieval goals.