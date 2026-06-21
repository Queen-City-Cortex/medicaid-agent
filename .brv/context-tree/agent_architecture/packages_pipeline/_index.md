---
children_hash: 5114bc22a4368bec1ebc62c627e260a81ebf0bec7d8d77c859d8c46c57f4b39f
compression_ratio: 0.5338882282996433
condensation_order: 1
covers: [context.md, crawler_cli_and_package_docs.md, crawler_sync_behavior/_index.md, retrieval_fixes/_index.md, ssa_parser_subsection_splitting_fix.md]
covers_token_total: 2523
summary_level: d1
token_count: 1347
type: summary
---
# packages_pipeline

Structural overview of the retrieval and parsing-related pipeline knowledge. The children below split into two main concerns: **policy corpus retrieval behavior** and **SSA statute subsection parsing**.

## Core retrieval architecture

### `context.md`
- Sets the top-level scope: reliable hybrid policy search in the retrieval backend.
- Key concepts to retain:
  - Neo4j `queryNodes`
  - `vectorScanK` overscan
  - fulltext recovery
  - `sectionId` deduplication
- Use as the entry point for how retrieval behavior is organized and why the fixes exist.

### `retrieval_fixes/_index.md` → `retrieval_fixes.md`
- Documents the main backend correction for **coverage-preserving vector retrieval**.
- Architectural split:
  - **Section vector backend** (`packages/policy-corpus/src/retrieval/backends/section-vector.ts`)
    - iterates `profile.typeGroups`
    - uses `vectorScanK(profile.perGroupK)` for per-group overscan
    - filters by `document_type` after retrieval
  - **Hybrid collector** (`packages/policy-corpus/src/retrieval/collector.ts`)
    - merges by `sectionId`
    - absorbs fulltext and expansion hits
    - reranks before final `topK`
- Important relationship:
  - `queryNodes(k)` is global top-k, so it cannot satisfy post-filtered per-group retrieval by itself.
  - Overscan is required, with an 8x cap at 200, followed by group filtering and `LIMIT k`.
- Ranking behavior:
  - fulltext-only matches get mid-range scores so they survive reranking
  - existing fulltext hits receive `FULLTEXT_BOOST`
  - deduplication happens on `sectionId` before final trim

### `crawler_cli_and_package_docs.md`
- Documents crawler package CLI structure and the README expectations.
- The crawler entrypoint is `src/index.ts`, which registers commands in `src/cli/`.
- Common commands and npm shortcuts remain valid after the source split: `crawl`, `check`, `stats`.
- README structure combines usage, sources, testing, and design references.
- The README points to `docs/superpowers/specs/2026-03-26-nc-medicaid-crawler-design.md`.
- Drill down here for the command surface and package documentation conventions.

### `crawler_sync_behavior/_index.md` → `crawler_sync_behavior.md`
- Captures sync lifecycle behavior in `packages/crawler/src/crawl/sync.ts`.
- Main design goal:
  - avoid premature deletion
  - prevent duplicate work across download and check phases
- Key structure:
  - `SyncStats`, `SyncContext`, `applyResult`, `processDocuments`, `runDownloadPhase`, `runCheckPhase`
  - filenames are tracked lazily per source type to keep collision handling correct
  - `runDownloadPhase` returns processed IDs so `runCheckPhase` can skip them
- Important rules:
  - download and check phases are separated
  - first 404 does not remove documents
  - removal occurs only after `config.notFoundRemovalThreshold` or the default threshold
  - processed IDs are excluded later via `skipIds`
- Notable facts:
  - `HttpStatusError` carries `statusCode`
  - default removal threshold is 3 consecutive 404s
  - HTML payloads are rejected for binary-only families
  - `better-sqlite3` 12 is required for Node 26

## SSA parsing and subsection splitting

### `ssa_parser_subsection_splitting_fix.md`
- Documents the fix for splitting large USC statute sections into stable SSA child subsections.
- Core change:
  - split only **top-level lettered subsections**
  - preserve parent section full text so IDs and citations remain stable
  - enforce strict expected-letter sequencing to avoid misreading nested roman numeral markers
  - skip unmapped or freestanding USC sections using USC-to-SSA mappings
- Flow:
  - parse USC HTML → find section heads → map USC to SSA → retain parent section → split oversized sections into top-level lettered children → ingest and embed
- Dependencies:
  - `USC_TO_SSA`
  - `FREESTANDING_USC_SECTIONS`
  - downstream `ingest-ssa` and embedding workflows
- Rules to preserve:
  - only sections larger than `SUBSECTION_SPLIT_MIN_CHARS` (30,000) are eligible
  - subsections must follow strict sequence `a → b → … → z → aa → …`
  - nested roman numeral starts are not top-level boundaries unless they match the next expected letter
- Key facts:
  - child ids are formed as `<parent>-<letter>`
  - parent IDs remain stable
  - 235 subsections exist across 15 statutes in real USC HTML
  - section `1905(r)` is a 3.9K-char EPSDT-definition section
  - parser changes require follow-up ingest and embed steps

## Cross-entry relationships

- `context.md` ties the retrieval work together and points to:
  - `retrieval_fixes.md` for backend ranking/coverage behavior
  - `crawler_cli_and_package_docs.md` for crawler packaging/documentation
- `crawler_sync_behavior/_index.md` and `crawler_cli_and_package_docs.md` both describe crawler behavior, but from different angles:
  - CLI surface and docs
  - sync lifecycle and state transitions
- `ssa_parser_subsection_splitting_fix.md` is connected to the same pipeline area through SSA ingestion and downstream indexing, especially where stable section identities matter.

## Drill-down guide

- Retrieval backend coverage and scoring: `retrieval_fixes.md`
- Crawler command surface and docs: `crawler_cli_and_package_docs.md`
- Crawler sync lifecycle and 404 handling: `crawler_sync_behavior.md`
- SSA subsection split logic and identity stability: `ssa_parser_subsection_splitting_fix.md`