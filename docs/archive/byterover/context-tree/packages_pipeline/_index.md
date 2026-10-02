---
children_hash: d6f3730efeef7f18eb5ae3fe1228f974a68c4ba5d7afcc14bbee394bdd2138cb
compression_ratio: 0.9025710419485792
condensation_order: 2
covers: [retrieval_fixes/_index.md]
covers_token_total: 739
summary_level: d2
token_count: 667
type: summary
---
# Retrieval Fixes

Structural overview of the policy-corpus retrieval collector behavior, centered on `collectHybridHitMap` and `finalizeHybridHits` in `packages/policy-corpus/src/retrieval/collector.ts`, with regression coverage in `packages/policy-corpus/tests/retrieval/collector.test.ts`.

## Core collection and ranking flow
- The pipeline is stage-ordered:
  1. enabled stage-1 backends merge into a section map
  2. fulltext recovery scoring is applied
  3. optional change-notice and document-expansion stages may add hits
  4. `finalizeHybridHits` ranks and caps the result set
- The shared merge key is `^sectionId$`, which groups hits by section across stages.

## Locked-in behaviors
- **Merge-max semantics:** for the same section, the higher-scored hit wins; equal scores keep the first-merged hit.
- **Backend handling:** unknown enabled backends are skipped silently during stage-1 collection.
- **Fulltext recovery:** `mergeFulltextHits` adds `FULLTEXT_BOOST` to existing hits; fulltext-only hits are inserted at `midScore - 0.02 * index`.
- **Final ranking:** when reranking is absent, `finalizeHybridHits` sorts baseline hits by score descending and truncates to `topK`.
- **Determinism:** the suite preserves deterministic capping and ranking behavior when rerankers are not involved.

## Test and dependency structure
- `collector.test.ts` contains 10 tests covering both collection and finalization behavior.
- Stage-1 backends are injected through a `backends` Map and a throwaway `withSession` executor.
- The fulltext backend is mocked separately because it issues its own Cypher and cannot be supplied through the injected backend map.
- Other shared helpers run real, so the suite exercises orchestration logic rather than heavily stubbed paths.

## Function dependencies
- `collectHybridHitMap` depends on:
  - `withSession`
  - injected `RetrievalBackend` implementations
  - a mocked fulltext backend for the non-injectable stage
- `finalizeHybridHits` depends on:
  - `computeDocumentCoverageBoosts`
  - `rerankRetrievalHit`
  - `maybeRerankHits`

## Implementation patterns
- Query analysis uses `analyzeQuery(query)`.
- Change-notice behavior is forced off in the test fixture to keep behavior deterministic.
- The suite explicitly distinguishes injected stage-1 backends from the separately handled fulltext stage.

## Drill-down entries
- `collector_retrieval_merge_and_ranking.md` for full behavioral notes and test coverage
- Related context: `packages_pipeline/retrieval_fixes/crawler_cli_and_package_docs.md`
- Related consistency boundary: `database_operations/neo4j_write_read_consistency/corpusgraphwriter_write_boundary.md`