---
children_hash: 3ad06a6b2a33a49ae72e09ff86677e5fe37137a27689c87ddb80fc7406c27058
compression_ratio: 0.7487266553480475
condensation_order: 0
covers: [retrieval_fixes.md]
covers_token_total: 589
summary_level: d0
token_count: 441
type: summary
---
# Retrieval Fixes

Structural overview of the policy-corpus retrieval backend changes. The core fix is in **retrieval_fixes.md**, which documents how Neo4j vector retrieval now uses per-group overscan to preserve coverage, while the hybrid collector keeps `sectionId` as the merge/dedup boundary.

## Key architecture changes
- **Section vector backend** (`packages/policy-corpus/src/retrieval/backends/section-vector.ts`)
  - Iterates `profile.typeGroups`
  - Uses `vectorScanK(profile.perGroupK)` to overscan each group
  - Filters results by `document_type` after retrieval
- **Hybrid collector** (`packages/policy-corpus/src/retrieval/collector.ts`)
  - Merges hits by `sectionId`
  - Incorporates fulltext and expansion hits
  - Reranks before final `topK` trimming

## Retrieval flow
`query analysis -> per-group vector overscan -> group filter -> merge by sectionId -> fulltext merge -> rerank -> topK`

## Important facts and decisions
- Neo4j `queryNodes(k)` returns **global top-k**, so it cannot be relied on for post-filtered per-group retrieval.
- Per-group vector retrieval requires **overscan**, with an **8x cap at 200**, then group filtering and `LIMIT k`.
- Fulltext-only matches are given **mid-range scores** so they can survive final ranking instead of being pushed below all vector hits.
- Existing fulltext hits in the section map receive `FULLTEXT_BOOST`.
- Hybrid collection dedupes by `sectionId` before reranking and final truncation.

## Dependencies
- Neo4j vector indexes: `section_embeddings`
- Shared scoring helpers: `FULLTEXT_BOOST`, `rerankRetrievalHit`
- Hybrid merge logic in the retrieval collector

## Drill-down
See **retrieval_fixes.md** for the detailed fix rationale, scoring behavior, and backend/collector relationships.