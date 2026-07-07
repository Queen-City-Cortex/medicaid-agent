---
children_hash: 19a1c6a5b7cecbde094462f475c33a5de5184a710b4a63f50b70dbabf50eab63
compression_ratio: 0.2604346752284515
condensation_order: 1
covers: [coverage_frame_assembly/_index.md, coverage_routing/_index.md, coverage_sections/_index.md, document_selection/_index.md, evaluation_harness_ab/_index.md, frame/_index.md, golden_dataset_de_contamination_and_retrieval_constants.md, internal/_index.md, refactoring_audit/_index.md, rerank_scoring/_index.md, retrieval/_index.md, tests/_index.md]
covers_token_total: 8098
summary_level: d1
token_count: 2109
type: summary
---
# Policy Corpus Structural Overview

## Retrieval, reranking, and A/B evaluation
The retrieval stack is organized as a staged pipeline where **collector behavior**, **reranker gating**, and **evaluation harnesses** are tightly coupled. The dominant design rule across these entries is that **stage order matters** and results must be evaluated at the correct layer.

### Core retrieval flow
- **`retrieval/hybrid_retrieval_collector_pipeline.md`**
  - Collector pipeline stages:
    1. backends + fulltext
    2. amendment-title expansion
    3. document expansion
    4. change-notice header expansion
    5. final rerank
  - `mergeMax` keeps the top-scored hit per `sectionId`.
  - `computeDocumentCoverageBoosts()` is intentionally called twice:
    - before expansion to guide title choice
    - after expansion in `finalizeHybridHits` to feed reranking
  - `finalizeHybridHits` can safely hoist repeated `Array.from(sectionMap.values())` calls because the map is not mutated there.
  - Dependencies include Neo4j session isolation and `maybeRerankHits`.

- **`retrieval/reranker_gate_logic_and_a_b_evaluation.md`**
  - `shouldAttemptRerank()` is selective, not always-on.
  - Reranking fail-opens to baseline when gating conditions are not met.
  - Gates are disabled for:
    - explicit document types
    - `deterministic_evidence`
    - too few candidates
  - Gates are enabled for hard queries such as:
    - `federal_authority`
    - `amendment`
    - `policy_variant`
    - HCWD income premium queries
    - ambiguous top-hit situations with enough distinct docs and small score gaps
  - Important evaluation lesson: **retrieval-level A/B is misleading**; reranker comparisons must run through **answer-level evaluation**.
  - `scripts/eval-ab.sh` was corrected so `gate_reranker` flows through `answer_arm()`, matching verifier evaluation.

### A/B model comparison harness
- **`evaluation_harness_ab/_index.md`**
  - Extends the existing pipeline eval system rather than replacing it.
  - Orchestrates:
    - baseline eval
    - candidate eval
    - `eval-compare`
  - Covers three gated comparisons:
    - embeddings
    - reranker
    - verifier
  - Key constraints:
    - Neo4j Community Edition is treated as single-database, so the candidate corpus runs in a second container/volume on `bolt:7688`
    - the heldout paraphrase split is the only trusted baseline after de-contamination review
    - adoption is blocked unless regression stays within `EVAL_REGRESSION_THRESHOLD = 0.05`
    - pipeline and agent embedding models must stay in lockstep
  - Provenance fields stamped by `runner.py` include:
    - `embedding_dimensions`
    - `neo4j_uri`
    - `reranker`

## Coverage frame assembly and document selection
These entries describe how policy coverage queries route documents, prefer setting-specific matches, and assemble the final answer frame.

- **`coverage_routing/_index.md`**
  - Core routing flow:
    `lookup documents -> infer documents from hits -> apply setting preference -> narrow -> return routing documents`
  - `selectSettingPreferredDocuments` now runs **before** `narrowInferredCoverageDocuments`.
  - When a query names a care setting and titles match, only setting-matching documents are returned.
  - If no sibling policy variant frame exists, the setting preference reason carries forward into `variantReasoning`.
  - This ordering prevents distractor variants, such as CAP/DA, from displacing the intended congregate PCS document.

- **`document_selection/_index.md`**
  - Documents coverage boosts, title expansion, variant scoring, HCWD coverage scoring, and narrowing behavior.
  - Setting preference depends on `VARIANT_SETTING_TERMS` and title matching.
  - `narrowInferredCoverageDocuments` still reduces non-sibling sets to the raw-score winner.
  - Related structure:
    `query terms -> document scoring -> optional setting preference -> narrowing -> frame assembly`

- **`coverage_frame_assembly/_index.md`**
  - Final coverage answer frame merges:
    - base hits
    - HCWD history hits
    - routed documents
    - section candidates
  - These become:
    - primary evidence
    - supporting evidence
    - avoid evidence
  - Sibling policy variants take precedence; otherwise `settingPreference.documents` become `preferredRoutingDocuments`.
  - `variantReasoning` falls back to the setting preference reason when no variant frame exists.

## Section selection and candidate profiles
- **`coverage_sections/_index.md`**
  - Refactors `packages/policy-corpus/src/frame/coverage-sections/candidates.ts` from clone-heavy builders into **two declarative ordered rule tables**.
  - New pipeline:
    `query flags -> derived signals -> ordered rule tables -> profilesFor() -> collectProfiles() -> uniqueBy(section.id)`
  - Exposes:
    - `buildCoverageQueryFlags`
    - `buildCoverageDocumentCandidateProfiles`
    - `collectCoverageDocumentHydratedCandidates`
  - Rule order is load-bearing because downstream selection uses **first-wins deduplication** on `section.id`.
  - Primary table: 9 rules; supporting table: 11 rules.
  - Refactor preserved behavior with all tests passing unchanged.

## Internal helpers and contract-level tests
Several test-oriented entries lock in exact helper behavior and floating-point behavior.

- **`internal/_index.md`**
  - Canonical test-suite entry for `packages/policy-corpus/src/internal/document-selection.ts`.
  - Covers ranking, narrowing, deduplication, and setting preference behavior.
  - Key helper contracts include:
    - `documentKeyForHit`
    - `computeDocumentCoverageBoosts`
    - `selectDocumentTitlesForExpansion`
    - `policyFamilyKey`
    - `looksLikeSiblingPolicySet`
    - `narrowInferredCoverageDocuments`
    - `scoreHcwdCoverageDocument`
    - `narrowHcwdCoverageDocuments`
    - `selectSettingPreferredDocuments`
    - `scoreVariantDocument`
    - `pickTopDocumentCandidates`
  - `pickTopDocumentCandidates` caps output at `FRAME_DOCUMENT_LIMIT = 3` unless overridden.

- **`tests/_index.md`**
  - Section predicate suite covers 21 exported pure predicates with 30 tests.
  - Key preserved rules:
    - `isPriorAuthExceptionSection` short-circuits `true` for section number `3.2.3`
    - `isAdministrativeFormTitle` excludes `"Change Notice"`
    - `isAttachmentTitle` requires `"attachment "` with a separator
    - `isGenericSectionTitle` matches only exact `"Information"` and `"Related Clinical Coverage Policies"`
    - `isBoilerplateTitle` strips trailing colon/space via `normalizeTitleKey`
    - `isTelehealthServiceTableSection` requires telehealth-eligible phrasing and no `sectionNumber`
    - `includesCalendarYear` matches only `20xx`
    - `extractTitleClusterTerms` keeps 4+ character tokens, removes `TITLE_CLUSTER_STOPWORDS`, lowercases, and dedupes

- **`rerank_scoring/_index.md`**
  - `packages/policy-corpus/src/internal/rerank.ts` was decomposed from one monolithic accumulator into ~20 ordered `HitScorer` functions.
  - Flow:
    `buildRerankQueryContext -> deriveHitFeatures -> apply HIT_SCORERS in order -> return adjusted hit`
  - Public APIs remain unchanged.
  - Exact floating-point order is critical; scorers must fold deltas in original statement order.
  - `HitScorer` signature:
    `(score, hit, ctx, features) => number`

## Refactoring risk and cross-cutting constraints
- **`refactoring_audit/_index.md`**
  - Main audit risks are:
    - pinned float-score assertions
    - waiver-authority predicate drift
  - Ordered float additions must not be regrouped.
  - Exact-float assertions appear across internal document-selection, scoring, and collector tests.
  - Waiver-authority logic is inconsistent across:
    - `packages/policy_corpus/src/internal/term-lists.ts`
    - `packages/policy_corpus/src/frame/federal-authority.ts`
    - `packages/policy_corpus/src/frame/rebalance/federal-authority.ts`
  - Recommended consolidation point: `isWaiverAuthoritySection()` in `section-predicates.ts`.

## Overall pattern
Across the policy corpus, the recurring architectural principles are:
- **ordering is semantic**: routing, narrowing, expansion, scoring, and rebalance steps must stay in sequence
- **setting and intent awareness** shape document preference and frame assembly
- **exact score behavior** is contract-level and protected by tests
- **evaluation must match the product layer**: retrieval-only comparisons can be misleading when routing gates suppress reranking