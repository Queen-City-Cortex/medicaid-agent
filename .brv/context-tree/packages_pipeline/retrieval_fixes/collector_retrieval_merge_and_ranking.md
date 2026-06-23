---
title: Collector Retrieval Merge and Ranking
summary: Tests and behavior for collector retrieval merging and ranking, including collectHybridHitMap, finalizeHybridHits, merge-max semantics, fulltext recovery, and deterministic topK capping.
tags: []
related: [packages_pipeline/retrieval_fixes/crawler_cli_and_package_docs.md, database_operations/neo4j_write_read_consistency/corpusgraphwriter_write_boundary.md]
keywords: []
createdAt: '2026-06-21T20:16:36.619Z'
updatedAt: '2026-06-21T20:16:36.619Z'
consolidated_at: '2026-06-23T02:10:21.838Z'
consolidated_from: [{date: '2026-06-23T02:10:21.838Z', path: packages_pipeline/retrieval_fixes/collector_retrieval_merge_and_ranking.abstract.md, reason: 'These three files cover the same collector retrieval merge/ranking topic and the abstract/overview are summaries of the main document, so they are redundant rather than complementary.'}, {date: '2026-06-23T02:10:21.838Z', path: packages_pipeline/retrieval_fixes/collector_retrieval_merge_and_ranking.overview.md, reason: 'These three files cover the same collector retrieval merge/ranking topic and the abstract/overview are summaries of the main document, so they are redundant rather than complementary.'}]
---
## Reason
Document the retrieval collector test coverage and merge behavior for policy-corpus.

## Raw Concept
**Task:**
Document the retrieval collector merge orchestration and its regression tests in policy-corpus.

**Changes:**
- Added coverage for collectHybridHitMap backend merging and fulltext recovery behavior
- Added coverage for finalizeHybridHits sorting and topK capping
- Captured injected-dependency testability patterns for stage-1 retrieval

**Files:**
- packages/policy-corpus/tests/retrieval/collector.test.ts
- packages/policy-corpus/src/retrieval/collector.ts

**Flow:**
enabled backends -> stage-1 merge-max -> optional fulltext recovery -> optional expansion stages -> finalize and topK cap

**Timestamp:** 2026-06-21T20:16:12.648Z

**Patterns:**
- `^sectionId$` - Section map key used to merge hits per section

## Narrative
### Structure
The collector is organized around a stage-ordered merge pipeline. Stage 1 merges injected backends into a section map, stage 2 applies fulltext recovery scoring, later stages add change-notice and document expansion hits, and finalizeHybridHits produces the ranked topK output.

### Dependencies
collectHybridHitMap depends on withSession, injected RetrievalBackend implementations, and a mocked fulltext backend for the stage that cannot be injected. finalizeHybridHits depends on computeDocumentCoverageBoosts, rerankRetrievalHit, and maybeRerankHits.

### Highlights
The important locked-in behaviors are merge-max semantics, silent skipping of unknown enabled backends, fulltext boost/insertion rules, and deterministic topK truncation when reranking is absent.

### Rules
Only the fulltext backend is mocked — it is the one stage that issues its own Cypher and can't be supplied through the injected `backends` map. Stage-1 backends are passed in directly, change-notice / document-expansion stages are left disabled, and every shared.ts helper runs for real, so the rest of the suite exercises the genuine merge orchestration with zero stubbing.

## Facts
- **collector_test_coverage**: collector.test.ts adds 10 tests for collectHybridHitMap and finalizeHybridHits [project]
- **stage1_injection**: Stage-1 backends are injected through a backends Map and a throwaway withSession executor [project]
- **fulltext_mocking**: Only the fulltext backend is mocked because it issues its own Cypher and cannot be supplied through the injected backends map [project]
- **merge_max_semantics**: mergeMax keeps the higher-scored hit per section and equal scores keep the first-merged hit [convention]
- **unregistered_backend_behavior**: Unregistered enabled backend names are silently skipped during stage-1 collection [project]
- **fulltext_scoring**: mergeFulltextHits adds FULLTEXT_BOOST to existing hits and places fulltext-only hits at midScore minus 0.02 times their index [project]
- **finalize_ranking**: finalizeHybridHits sorts baseline hits by score descending and slices the result to topK when rerankHits is omitted [project]
- **analysis_fixture**: The suite uses analyzeQuery(query) for real analysis but forces change-notice flags off for deterministic test fixtures [project]

## Consolidated Overview
- Documents regression-test coverage for the policy-corpus retrieval collector, focusing on `collectHybridHitMap` and `finalizeHybridHits`.
- Core behaviors captured include merge-max semantics, fulltext recovery/boosting, later-stage expansion hooks, and deterministic topK ranking/capping.
- The collector is described as a stage-ordered merge pipeline: injected stage-1 backends first, then fulltext recovery, then optional change-notice/document-expansion stages, ending with final ranking.
- Dependencies noted for the main functions include `withSession`, injected `RetrievalBackend` implementations, mocked fulltext backend behavior, and ranking helpers like `computeDocumentCoverageBoosts`, `rerankRetrievalHit`, and `maybeRerankHits`.
- A key implementation pattern is the `^sectionId$` section-map key used to merge hits per section.
- Important decisions include silently skipping unknown enabled backends, mocking only the fulltext stage because it issues its own Cypher, and keeping other shared helpers real to exercise actual orchestration.
- The suite adds 10 tests and locks in deterministic behaviors such as higher-score preference in merges, equal-score tie handling, fulltext-only hit placement, and baseline topK truncation when reranking is absent.
- Notable entities include `collector.test.ts`, `collector.ts`, `analyzeQuery(query)`, `FULLTEXT_BOOST`, and the `backends` Map used for dependency injection.