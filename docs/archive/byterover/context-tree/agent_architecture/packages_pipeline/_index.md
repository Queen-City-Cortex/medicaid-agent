---
children_hash: 48993ef2224ba2ee17653686f10bf5f18823dd48362a49bd373d9c060ab5a9de
compression_ratio: 0.2760821309655938
condensation_order: 1
covers: [context.md, crawler_cli_and_package_docs.md, crawler_source_factories.md, crawler_sync_behavior/_index.md, retrieval_fixes/_index.md, ssa_parser_subsection_splitting_fix.md]
covers_token_total: 3604
summary_level: d1
token_count: 995
type: summary
---
# Packages Pipeline

Structural overview of the `packages_pipeline` knowledge cluster. This area ties together retrieval behavior, crawler architecture, and SSA parsing fixes, with a shared theme of preserving correctness across document discovery, deduplication, and downstream citation stability.

## Primary focus
- **Retrieval backend reliability**: `context.md` and `retrieval_fixes/_index.md` describe the policy-corpus retrieval path, including Neo4j vector overscan, fulltext recovery, and `sectionId`-based merge/dedup boundaries.
- **Crawler command and packaging structure**: `crawler_cli_and_package_docs.md` documents the crawler’s CLI entrypoint, npm shortcuts, and README/spec linkage.
- **Crawler discovery refactor**: `crawler_source_factories.md` captures the move to reusable source factories and the managed-care contract traversal model.
- **SSA section splitting stability**: `ssa_parser_subsection_splitting_fix.md` records the parser fix that splits large USC sections into stable SSA subsections without breaking parent citations.
- **Sync lifecycle behavior**: `crawler_sync_behavior/_index.md` summarizes phase separation, retryable 404 handling, and state transitions in sync processing.

## Shared architectural patterns
- **Boundary-aware processing**
  - Retrieval uses **per-group overscan** because Neo4j `queryNodes(k)` returns global top-k and cannot safely support post-filtered group retrieval.
  - Crawler sync separates **download** and **check** phases to avoid duplicate work and premature deletion.
  - SSA parsing preserves **parent section text** so IDs and citations remain stable while child subsections are added.
- **Deduplication and identity preservation**
  - Retrieval dedupes and merges by `sectionId`.
  - Crawler source discovery tracks `seenDocs`, `visitedPages`, and `queuedPages`.
  - SSA parsing assigns child subsection IDs as `<parent>-<letter>` while keeping parent identity intact.
- **Recovery over loss**
  - Retrieval includes fulltext recovery and scoring so non-vector matches can still survive ranking.
  - Crawler sync tolerates transient non-200 / 404 cases instead of immediately deleting documents.
  - SSA parser skips unmapped USC sections with warnings rather than forcing invalid splits.

## Drill-down map
- **`context.md`** — high-level retrieval backend overview: `queryNodes`, `vectorScanK` overscan, fulltext recovery, `sectionId` dedup.
- **`retrieval_fixes/_index.md`** — structural summary of the retrieval fix architecture and scoring/merge decisions.
- **`crawler_cli_and_package_docs.md`** — CLI entrypoint, command registration, npm shortcuts, and README/spec references.
- **`crawler_source_factories.md`** — reusable source factories, managed-care contract BFS traversal, and factory behavior constraints like ignoring `sinceYear`.
- **`crawler_sync_behavior/_index.md`** — sync lifecycle summary, phase separation, 404 thresholds, and document state handling.
- **`ssa_parser_subsection_splitting_fix.md`** — subsection splitting rules, parent retention, and strict sequencing for top-level lettered subsections.

## Notable facts and decisions
- Retrieval’s core fix is that **vector overscan must happen before filtering**, since global top-k from Neo4j is insufficient for per-group coverage.
- The hybrid collector uses **`sectionId` as the dedup/merge boundary** and reranks after combining vector, fulltext, and expansion hits.
- The crawler package exposes commands through **`src/index.ts`** with commands under **`src/cli/`**, and the README points to **`docs/superpowers/specs/2026-03-26-nc-medicaid-crawler-design.md`**.
- Reusable crawler source factories live in **`crawl-helpers.ts`** and provide **`singleIndexSource`**, **`pageCrawlSource`**, and **`pushNewDocuments`**.
- SSA subsection splitting only applies to **large sections over 30,000 characters**, with strict `a → b → ... → z → aa` progression to avoid mistaking nested roman numerals for top-level boundaries.