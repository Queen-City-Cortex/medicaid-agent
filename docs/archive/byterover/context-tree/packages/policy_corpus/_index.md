---
children_hash: e3ceab53056bbe9ca979cb412089bbc48628ca2680aa815507efd96c85242023
compression_ratio: 0.2856124509920399
condensation_order: 1
covers: [coverage_frame_assembly/_index.md, coverage_routing/_index.md, coverage_sections/_index.md, document_selection/_index.md, evaluation_harness_ab/_index.md, frame/_index.md, golden_dataset_de_contamination_and_retrieval_constants.md, internal/_index.md, refactoring_audit/_index.md, rerank_scoring/_index.md, retrieval/_index.md, tests/_index.md]
covers_token_total: 8417
summary_level: d1
token_count: 2404
type: summary
---
# Policy Corpus Retrieval and Coverage Summary

## Overview
These entries describe the policy-corpus retrieval, reranking, frame assembly, and document-selection layers, with emphasis on **stage ordering**, **setting-preferred routing**, and **exact-score preservation**. The main pattern is that query intent and document structure drive routing before narrowing or reranking, and downstream frame assembly consumes those ordered outputs.

## Coverage routing and frame assembly
- **coverage_routing/_index.md** and **coverage_frame_assembly/_index.md** document the setting-preference fix in the routing path.
- Core flow:
  - `lookup documents -> infer documents from hits -> apply setting preference -> narrow -> return routing documents`
  - frame assembly then merges `base hits`, `HCWD history hits`, `routed documents`, and `section candidates` into `primary evidence`, `supporting evidence`, and `avoid evidence`.
- Key architectural decision:
  - `selectSettingPreferredDocuments(queryLower, documents)` runs **before** `narrowInferredCoverageDocuments`.
  - If no sibling variant frame exists, `variantReasoning` falls back to the **setting preference reason**.
- Important rule:
  - for sibling sets, the variant frame takes precedence; otherwise `settingPreference.documents` become `preferredRoutingDocuments`.
- Implementation files:
  - `packages/policy-corpus/src/frame/context/routing.ts`
  - `packages/policy-corpus/src/internal/document-selection.ts`
  - `packages/policy-corpus/src/frame/pipelines/coverage.ts`

## Document selection and narrowing
- **document_selection/_index.md** captures the document-level selection and narrowing behavior that supports routing.
- Responsibilities include:
  - document coverage boosts
  - title expansion
  - variant scoring
  - HCWD coverage scoring
  - narrowing inferred coverage documents
- Structural rule:
  - setting preference is applied **before** narrowing, so explicit care-setting queries keep matching documents even when raw scores favor distractors.
- Key helper behavior:
  - `selectSettingPreferredDocuments` depends on `VARIANT_SETTING_TERMS` and title matching.
  - `narrowInferredCoverageDocuments` keeps the most common repeated family or falls back to the first document.
  - `scoreVariantDocument` boosts exact policy-number matches and penalizes change-notice/amendment documents.
  - `pickTopDocumentCandidates` dedupes by document id and caps results at `FRAME_DOCUMENT_LIMIT = 3` unless overridden.
- Related files:
  - `packages/policy-corpus/src/internal/document-selection.ts`
  - `packages/policy-corpus/src/frame/context/routing.ts`
  - `packages/policy-corpus/src/frame/pipelines/coverage.ts`

## Coverage section profile refactor
- **coverage_sections/_index.md** documents the refactor of `packages/policy-corpus/src/frame/coverage-sections/candidates.ts`.
- The old clone-heavy profile builders were replaced by two ordered rule tables:
  - `COVERAGE_PRIMARY_PROFILE_RULES` (9 rules)
  - `COVERAGE_SUPPORTING_PROFILE_RULES` (11 rules)
- Processing flow:
  - `query flags -> derived signals -> ordered rule tables -> profilesFor() -> collectProfiles() -> uniqueBy(section.id)`
- Critical invariant:
  - **order is load-bearing**; `collectProfiles()` dedupes with first-wins behavior on `section.id`.
- The refactor preserves behavior using shared module-level profile objects from `makeSectionProfile` and `makeLimitationProfile`.
- Reported validation: **all 239 tests passing unchanged**.

## Retrieval pipeline and reranking
- **retrieval/_index.md** ties together the hybrid collector pipeline and reranker gating.
- Hybrid retrieval collector flow:
  - backends + fulltext
  - amendment-title expansion
  - document expansion
  - change-notice header expansion
  - final rerank
- Key collector behavior:
  - `mergeMax` keeps the highest-scored hit per `sectionId`
  - fulltext recovery uses score adjustment rather than merge-max semantics
  - `computeDocumentCoverageBoosts()` is intentionally called **twice**:
    - before expansion to choose titles
    - after expansion in `finalizeHybridHits` to feed reranking
- Important constraint:
  - these boost computations must not be deduped or reused across stages, or ranking becomes stale.
- Reranker behavior:
  - `shouldAttemptRerank()` is selective, not always-on.
  - It fail-opens to baseline hits when gate conditions are not met.
  - It activates for hard queries such as `federal_authority`, `amendment`, `policy_variant`, HCWD income premium queries, and certain ambiguous top-hit cases.
- Evaluation finding:
  - retrieval-level A/B comparison is misleading; correct reranker evaluation must happen at the **answer-level**.
- Related files:
  - `packages/policy-corpus/src/retrieval/collector.ts`
  - `packages/policy-corpus/src/retrieval/rerank.ts`
  - `scripts/eval-ab.sh`

## Rerank scoring refactor
- **rerank_scoring/_index.md** documents the decomposition of `packages/policy-corpus/src/internal/rerank.ts`.
- `rerankRetrievalHit` was split into about 20 ordered `HitScorer` functions.
- Shared helper:
  - `deriveHitFeatures` computes per-hit values once.
- Flow:
  - `buildRerankQueryContext -> deriveHitFeatures -> apply HIT_SCORERS in order -> return adjusted hit`
- Constraints:
  - public signatures remain unchanged
  - exact floating-point behavior must be preserved for pinned tests
  - scorer order matters because grouped summation can change bit-level results
- Notable scoring areas:
  - policy-number boosts
  - federal-authority routing
  - fee-schedule bucket scoring
  - waiver application handling
  - change-notice boosts
  - title-quality penalties
  - HCWD / waiver special cases
- Related test file:
  - `tests/retrieval-ranking.test.ts`

## A/B evaluation harness
- **evaluation_harness_ab/_index.md** describes the A/B model comparison harness as an extension of the existing pipeline eval system.
- Orchestration:
  - baseline eval -> candidate eval -> `eval-compare`
  - repeated answer runs for verifier stability
  - citation gate for verifier output
- Gated comparisons:
  - embeddings: `voyage-law-2` vs `voyage-4-large`
  - reranker: LLM reranker vs none/alternate reranker
  - verifier: `gpt-5.4-mini` vs `gpt-5.4-nano`
- Structural decisions:
  - Neo4j Community Edition is treated as **single-database**; the candidate corpus is isolated in a second container/volume on `bolt:7688`.
  - `heldout-paraphrase.json` remains the only honest baseline after de-contamination review.
  - adoption is blocked unless regression stays within `EVAL_REGRESSION_THRESHOLD = 0.05`.
  - pipeline and agent embedding models must stay in lockstep.
- Environment behavior:
  - embedding/query model settings are environment-overridable
  - eval subprocesses propagate full `os.environ`
  - `runner.py` stamps provenance fields such as `embedding_dimensions`, `neo4j_uri`, and `reranker`

## Coverage candidate profiles and selection tests
- **internal/_index.md** and **tests/_index.md** provide the locked behavior for internal selection helpers and their test suite.
- Document-selection suite:
  - 31 tests
  - 11 of 12 exports from `src/internal/document-selection.ts`
  - key checks include document keying, expansion ranking, sibling-set detection, HCWD narrowing, setting preference, and top candidate picking.
- Locked behaviors include:
  - `documentKeyForHit` null only when all identifying fields are empty
  - `selectDocumentTitlesForExpansion` returns the top 8 titles by `hit.score + coverageBoost`
  - `looksLikeSiblingPolicySet` is true only when a policy family repeats
  - `scoreHcwdCoverageDocument` favors `MA-2180` and penalizes administrative-form titles
  - `narrowHcwdCoverageDocuments` may keep up to two close documents when the query mentions a year or chart
- The broader test suite also preserves exact predicate edge cases such as:
  - `isPriorAuthExceptionSection` matching hardcoded section `3.2.3`
  - `isAdministrativeFormTitle` excluding `Change Notice`
  - `extractTitleClusterTerms` lowercasing and deduping tokens

## Refactoring audit and predicate stability
- **refactoring_audit/_index.md** notes two linked concerns in policy-corpus ranking:
  - exact-float score pinning / ordered-fold invariants
  - waiver-authority section-number predicate drift
- The audit recommends consolidating waiver-authority logic into a single `isWaiverAuthoritySection()` predicate in `section-predicates.ts`.
- This must not disturb ordered-fold float logic in:
  - `term-lists.ts`
  - `federal-authority.ts`
  - `rebalance/federal-authority.ts`
  - `retrieval/collector.ts`
- **tests/_index.md** confirms predicate test coverage for `section-predicates.js` and preserves exact helper behavior for section, title, and year predicates.

## Cross-cutting themes
- **Ordering is load-bearing** across routing, narrowing, profile selection, scoring, and reranking.
- **Setting preference and variant reasoning** are treated as first-class routing signals.
- **Exact score stability** is protected by ordered folds and pinned tests.
- **Stage-specific reuse is prohibited** when it would create stale boosts or misleading evaluation results.
- The related drill-down entries are:
  - `coverage_routing.md`
  - `coverage_frame_assembly.md`
  - `document_selection_and_narrowing.md`
  - `coverage_candidate_profiles_table_refactor.md`
  - `hybrid_retrieval_collector_pipeline.md`
  - `reranker_gate_logic_and_a_b_evaluation.md`
  - `rerank_scoring_refactor.md`
  - `a_b_model_comparison_eval_harness.md`
  - `document_selection_tests.md`
  - `section_predicates_test_suite.md`
  - `refactoring_audit_2026_07_05.md`