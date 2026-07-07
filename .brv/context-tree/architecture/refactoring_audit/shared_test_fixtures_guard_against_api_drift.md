---
title: Shared Test Fixtures Guard Against API Drift
tags: []
related: [architecture/refactoring_audit/shared_test_fixture_layer.md, evaluation/answer_quality/cross_reference_resolution_evaluation.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-07T02:05:30.044Z'
updatedAt: '2026-07-07T02:05:30.044Z'
---
## Raw Concept
**Task:**
Document the shared test fixture fakes and the review-driven fixes for API-drift safety in tests.

**Changes:**
- Added RecordingGraphWriter.__getattr__ validation against the real CorpusGraphWriter
- Added _first_argument(args, kwargs) helper to support kwargs in received() and len-return behavior
- Moved makeHit import above vi.mocked const in collector.test.ts
- Noted that a Greptile P2 finding about retrievalReady: null was stale and should not be fixed

**Files:**
- packages/pipeline/tests/fakes.py
- packages/policy-corpus/tests/retrieval/collector.test.ts

**Flow:**
review findings -> validate actual API -> harden test fakes -> reverify suites

**Timestamp:** 2026-07-06

**Author:** PR 59 review

**Patterns:**
- `^_.*` - RecordingGraphWriter blocks private attribute access

## Narrative
### Structure
packages/pipeline/tests/fakes.py defines FakeResult, RecordingSession, session_factory, _first_argument, and RecordingGraphWriter. The graph writer fake records per-method calls and validates method names against CorpusGraphWriter. collector.test.ts mocks only the fulltext backend and uses real shared helpers plus injected stage-1 backends to exercise merge orchestration.

### Dependencies
RecordingGraphWriter depends on the real CorpusGraphWriter class for method validation. collector.test.ts depends on analyzeQuery, fulltextBackend mock, collectHybridHitMap, finalizeHybridHits, and makeHit fixtures.

### Highlights
The shared fake layer now fails loudly on writer API drift, which prevents silent recording of typoed or renamed methods. The collector tests emphasize merge-max behavior, first-merged-wins stability, fulltext boost recovery, and topK ranking/capping.

### Rules
Method names are validated against the real CorpusGraphWriter so a typo'd or renamed writer method fails the test loudly instead of being recorded silently. Like the real merge_* methods, a recorded call returns len(first argument) when it is sized. Only the fulltext backend is mocked in collector.test.ts.

### Examples
Example: fulltext recovery boosts an existing section by FULLTEXT_BOOST and inserts fulltext-only sections mid-range. Example: collectHybridHitMap keeps the higher-scored hit per section and preserves the first merged hit when scores are equal. Example: finalizeHybridHits returns hits sorted by score descending and capped at topK.

## Facts
- **recording_graph_writer_validation**: RecordingGraphWriter.__getattr__ validates method names against the real CorpusGraphWriter using getattr plus callable checks. [project]
- **writer_api_drift_behavior**: Typos or renamed writer methods now raise AttributeError in tests instead of being recorded silently. [project]
- **first_argument_helper**: _first_argument(args, kwargs) makes received() and len-return behavior kwargs-tolerant. [project]
- **import_order_fix**: makeHit import was moved above vi.mocked const in collector.test.ts. [project]
- **pr_59_review_outcome**: The PR 59 review outcome was Greptile 4/5 safe-to-merge and Augment summary-only. [project]
- **commit_reference**: The fix was addressed in commit dc72591. [project]
- **verification_status**: All suites were re-verified green at 305/239. [project]
