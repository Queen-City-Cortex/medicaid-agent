---
children_hash: 59ffa2eadf4c24d68c0b1d61dd5449fae89417b5ac97a9b9fa91462c2a8bd55c
compression_ratio: 0.4605353466026081
condensation_order: 1
covers: [collector_retrieval_merge_and_ranking.md]
covers_token_total: 1457
summary_level: d1
token_count: 671
type: summary
---
# Collector Retrieval Merge and Ranking

Structural summary of the policy-corpus retrieval collector behavior, centered on `collectHybridHitMap` and `finalizeHybridHits` in `packages/policy-corpus/src/retrieval/collector.ts` and their regression coverage in `packages/policy-corpus/tests/retrieval/collector.test.ts`.

## Core pipeline
- The collector follows a stage-ordered merge flow:
  1. enabled stage-1 backends merge into a section map
  2. fulltext recovery scoring is applied
  3. optional change-notice and document-expansion stages may add hits
  4. `finalizeHybridHits` ranks and caps the result set
- The shared merge key is `^sectionId$`, used to merge hits per section.

## Key behaviors locked in
- **Merge-max semantics**: for the same section, the higher-scored hit wins; equal scores keep the first-merged hit.
- **Backend handling**: unknown enabled backends are silently skipped during stage-1 collection.
- **Fulltext recovery**: `mergeFulltextHits` adds `FULLTEXT_BOOST` to existing hits; fulltext-only hits are inserted at `midScore - 0.02 * index`.
- **Final ranking**: when reranking is absent, `finalizeHybridHits` sorts baseline hits by score descending and truncates to `topK`.
- **Determinism**: the suite preserves deterministic capping and ranking behavior when rerankers are not involved.

## Test and dependency structure
- `collector.test.ts` adds 10 tests covering both collection and finalization behavior.
- Stage-1 backends are injected through a `backends` Map and a throwaway `withSession` executor.
- Only the fulltext backend is mocked, because it issues its own Cypher and cannot be supplied through the injected backend map.
- Other shared helpers run real, so the suite exercises actual orchestration rather than heavily stubbed logic.

## Function dependencies
- `collectHybridHitMap` depends on:
  - `withSession`
  - injected `RetrievalBackend` implementations
  - a mocked fulltext backend for the non-injectable stage
- `finalizeHybridHits` depends on:
  - `computeDocumentCoverageBoosts`
  - `rerankRetrievalHit`
  - `maybeRerankHits`

## Notable implementation patterns
- Real query analysis uses `analyzeQuery(query)`.
- Change-notice behavior is forced off in the test fixture for determinism.
- The suite captures the distinction between injected stage-1 backends and the separately handled fulltext stage.

## Drill-down entries
- `collector_retrieval_merge_and_ranking.md` for the full test coverage and behavioral notes
- Related context: `packages_pipeline/retrieval_fixes/crawler_cli_and_package_docs.md`
- Related consistency boundary: `database_operations/neo4j_write_read_consistency/corpusgraphwriter_write_boundary.md`