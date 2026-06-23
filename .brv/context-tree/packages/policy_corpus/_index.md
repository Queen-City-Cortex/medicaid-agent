---
children_hash: d549f8027e221074157f24fad38d281d9a65d6051ad5963449ecb765e0dda7a4
compression_ratio: 0.3691542288557214
condensation_order: 1
covers: [coverage_frame_assembly/_index.md, coverage_routing/_index.md, document_selection/_index.md, evaluation_harness_ab/_index.md, frame/_index.md, golden_dataset_de_contamination_and_retrieval_constants.md, internal/_index.md, rerank_scoring/_index.md, retrieval/_index.md, tests/_index.md]
covers_token_total: 7035
summary_level: d1
token_count: 2597
type: summary
---
# Policy Corpus Structural Overview

This layer captures the main retrieval, selection, frame assembly, evaluation, and test-coverage mechanics for policy-corpus behavior. The recurring design pattern is **stage-aware processing**: selection, narrowing, reranking, and assembly each have distinct responsibilities and must not reuse intermediate outputs outside their intended phase.

## Retrieval and Reranking Stack

### `retrieval/_index.md`
Covers the two linked retrieval paths:

- **`hybrid_retrieval_collector_pipeline.md`**
  - Multi-stage collector in `packages/policy-corpus/src/retrieval/collector.ts`
  - Stage order:
    1. backends + fulltext
    2. amendment-title expansion
    3. document expansion
    4. change-notice header expansion
    5. final rerank
  - `mergeMax` keeps the highest-scored hit per `sectionId`
  - `computeDocumentCoverageBoosts()` is intentionally called twice:
    - pre-expansion for title selection
    - post-expansion in `finalizeHybridHits` for reranking
  - `finalizeHybridHits` can hoist repeated `Array.from(sectionMap.values())` into a local const because the map is not mutated there

- **`reranker_gate_logic_and_a_b_evaluation.md`**
  - Reranker in `packages/policy-corpus/src/retrieval/rerank.ts`
  - Controlled by `shouldAttemptRerank()`
  - Fail-opens to baseline unless gate conditions are met
  - Gate triggers include:
    - `federal_authority`
    - `amendment`
    - `policy_variant`
    - HCWD income premium
    - ambiguous top-hit cases with enough distinct docs and small score gaps
  - Retrieval-level A/B comparisons are misleading because the CLI lacks route analysis
  - Correct evaluation path is answer-level, via `scripts/eval-ab.sh` and `answer_arm()`

### `rerank_scoring/_index.md`
Documents the refactor of `packages/policy-corpus/src/internal/rerank.ts`:

- `rerankRetrievalHit` was decomposed into ~20 ordered `HitScorer` functions
- Shared `deriveHitFeatures` computes hit features once
- Execution flow:
  `buildRerankQueryContext -> deriveHitFeatures -> HIT_SCORERS -> return adjusted hit`
- Public APIs stay unchanged
- Exact floating-point behavior is contractually important
- Scoring areas include:
  - policy-number boosts
  - federal-authority routing
  - fee-schedule bucket scoring
  - waiver application handling
  - change-notice boosts
  - title-quality penalties
  - HCWD / waiver special cases
- Validated by exact-score tests in `tests/retrieval-ranking.test.ts`

## Document Selection, Narrowing, and Coverage Routing

### `document_selection/_index.md`
Summarizes internal selection logic in `packages/policy-corpus/src/internal/document-selection.ts` and its routing impact:

- Responsibilities:
  - coverage boosts
  - title expansion
  - variant scoring
  - HCWD scoring
  - narrowing inferred coverage docs
- Key change:
  - `selectSettingPreferredDocuments(queryLower, documents)` prioritizes documents matching the care setting named in the query
  - This runs **before** `narrowInferredCoverageDocuments`
  - `variantReasoning` falls back to the setting preference reason when no sibling variant frame exists
- Flow:
  `query terms -> document scoring -> optional setting preference -> narrowing -> frame assembly`
- Depends on `VARIANT_SETTING_TERMS`, title matching, and existing narrowing behavior
- Related drill-down:
  - `coverage_routing.md`
  - `coverage_frame_assembly.md`

### `coverage_routing/_index.md`
Explains the routing behavior that feeds frame assembly:

- Core flow:
  `lookup documents -> infer documents from hits -> apply setting preference -> narrow -> return routing documents`
- Important ordering rule:
  - setting-scoped document preference must happen **before** `narrowInferredCoverageDocuments`
- When a query explicitly names a care setting and titles match, only setting-matching documents are returned
- If no sibling variant frame exists, the setting preference reason is preserved in `variantReasoning`
- Related files:
  - `packages/policy-corpus/src/frame/context/routing.ts`
  - `packages/policy-corpus/src/internal/document-selection.ts`
  - `packages/policy-corpus/src/frame/pipelines/coverage.ts`

### `coverage_frame_assembly/_index.md`
Describes how the final coverage answer frame is built from routed documents and evidence:

- Final frame merges:
  - base hits
  - HCWD history hits
  - routed documents
  - section candidates
- Evidence is organized into:
  - primary evidence
  - supporting evidence
  - avoid evidence
- Core rule:
  - for sibling sets, the variant frame takes precedence
  - otherwise, `settingPreference.documents` becomes `preferredRoutingDocuments`
- Setting-preferred routing documents are authoritative when no sibling variant frame overrides them
- Key files:
  - `packages/policy-corpus/src/frame/pipelines/coverage.ts`
  - `packages/policy-corpus/src/frame/context/routing.ts`
  - `packages/policy-corpus/src/internal/document-selection.ts`

## Frame Pipeline and Authority Handling

### `frame/_index.md`
Covers the broader frame pipeline:

- **`coverage_selection_and_graph_fixtures.md`**
  - Frame layer split across:
    - `packages/policy-corpus/src/frame/coverage/candidates.ts`
    - `coverage/selection.ts`
    - `federal-authority.ts`
  - Coverage selection is a 5-stage pipeline:
    1. score coverage sections
    2. collect/group by coverage flags
    3. build initial selection
    4. build anchors
    5. assemble final sections
  - `SectionCandidate.score` was removed; selection is positional, not score-field driven
  - Strict Neo4j graph fixtures enforce:
    - typed record builders
    - query matchers
    - corpus/session stubs
    - handler execution checks
  - `expectAllHandlersUsed()` is required; extra queries fail unless explicitly allowed

- **`federal_authority_pairing_and_rebalance.md`**
  - Authority retrieval explicitly pairs statute and regulation when query intent signals an authority citation
  - Driven by `asksForAuthorityCitation` in `query-intent.ts` and `authorityCitationQuery`
  - Steps:
    1. `buildFederalAuthoritySignals`
    2. `collectFederalAuthorityEvidence`
    3. `collectFederalImplementationEvidence`
    4. `buildFederalAuthorityCandidateSets`
  - Rebalance hints adjust primary/supporting/avoid sections for waiver authority, SPA, and EPSDT
  - Ordering matters: `WAIVER_AUTHORITY_HINT` must run before `WAIVER_HINT`
  - Intent-specific routing examples:
    - 1915(c) HCBS waiver authority -> `42 CFR Part 441 Subpart G`
    - SPA timeliness/submission -> `42 CFR 430`
    - EPSDT -> `42 CFR 441 Subpart B`

## Evaluation Harness

### `evaluation_harness_ab/_index.md`
Documents the policy-corpus A/B harness as an extension of the existing pipeline eval system:

- Orchestration:
  - baseline eval -> candidate eval -> `eval-compare`
  - repeated answer runs for verifier stability
  - citation gate for verifier output
- Key components:
  - `packages/pipeline/src/pipeline/config.py`
  - `packages/agent/src/config.ts`
  - `packages/pipeline/src/pipeline/eval/runner.py`
  - `scripts/eval-ab.sh`
  - `docker-compose.ab.yml`
- Gated comparisons:
  - embeddings: `voyage-law-2` vs `voyage-4-large`
  - reranker: LLM reranker vs none/alternate reranker
  - verifier: `gpt-5.4-mini` vs `gpt-5.4-nano`
- Key decisions:
  - Neo4j Community Edition is treated as single-database, so candidate corpus isolation uses a second container/volume on `bolt:7688`
  - `heldout-paraphrase.json` remains the honest baseline after de-contamination review
  - adoption is blocked unless regressions stay within `EVAL_REGRESSION_THRESHOLD = 0.05`
  - pipeline and agent embedding models must stay in lockstep: `PIPELINE EMBEDDING_MODEL` must equal `AGENT VOYAGE_MODEL`
- `runner.py` stamps provenance fields such as `embedding_dimensions`, `neo4j_uri`, and `reranker` so comparison tooling can distinguish baseline and candidate arms

## Internal Tests and Predicate Coverage

### `internal/_index.md`
Canonical test-suite entry for `packages/policy-corpus/src/internal/document-selection.ts`:

- 31 Vitest tests; package test count increased from 153 to 239
- Covers 11 of 12 exports from `src/internal/document-selection.ts`
- Locks in:
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
- Important behavior:
  - `selectSettingPreferredDocuments` uses `VARIANT_SETTING_TERMS`
  - returns `{ documents, reason: null }` when no setting or matching title is found
  - `pickTopDocumentCandidates` caps output at `FRAME_DOCUMENT_LIMIT = 3` unless overridden

### `tests/_index.md`
Section predicate coverage for `packages/policy-corpus/src/internal/section-predicates.js`:

- 30 tests spanning 21 pure predicates
- Focus areas:
  - hit text and role predicates
  - section shape predicates
  - prior-authorization predicates
  - title classification predicates
  - process/administrative predicates
  - year and premium helpers
  - title-cluster extraction helpers
- Key preserved rules:
  - `isPriorAuthExceptionSection` hardcodes section number `3.2.3`
  - `isAdministrativeFormTitle` excludes `"Change Notice"`
  - `isAttachmentTitle` requires `"attachment "` with a separator
  - `isGenericSectionTitle` matches only exact `"Information"` and `"Related Clinical Coverage Policies"`
  - `isTelehealthServiceTableSection` requires telehealth-eligible phrasing and no `sectionNumber`
  - `includesCalendarYear` matches only `20xx`
  - `extractTitleClusterTerms` keeps 4+ character tokens, removes stopwords, lowercases, and dedupes

## Cross-cutting themes

- **Ordering is a primary design constraint**: setting preference must precede narrowing, reranking gates must decide before scoring, and staged expansion must not reuse stale boosts.
- **Document preference is setting-aware** and can override raw-score winners when the query explicitly names a care setting.
- **Frame assembly is intent-aware**: authority questions, waiver questions, SPA, and EPSDT each surface different canonical evidence.
- **Tests are contract-level**: many helpers are pinned by exact scoring, thresholds, or hardcoded section rules, so changes must preserve behavior precisely.