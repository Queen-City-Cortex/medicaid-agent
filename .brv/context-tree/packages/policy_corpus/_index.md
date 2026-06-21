---
children_hash: 874694b86da2931dba996f760f0346d5887a4321563fdb55c9bded0f4ea91f31
compression_ratio: 0.4827887471605801
condensation_order: 1
covers: [coverage_frame_assembly/_index.md, coverage_routing/_index.md, document_selection/_index.md, evaluation_harness_ab/_index.md, frame/_index.md, golden_dataset_de_contamination_and_retrieval_constants.md, rerank_scoring/_index.md, retrieval/_index.md]
covers_token_total: 5723
summary_level: d1
token_count: 2763
type: summary
---
# Policy Corpus Retrieval and Frame Pipeline

This cluster documents the retrieval, reranking, document-selection, and frame-assembly layers of the policy corpus pipeline. The shared theme is **stage ordering matters**: each layer has a specific boundary, and reusing results outside that boundary can change ranking, routing, or final frame composition.

## Retrieval stack

### `retrieval/_index.md`
Covers the linked retrieval pipeline and reranker gate/A-B evaluation path.

- **Hybrid retrieval collector pipeline**: `packages/policy-corpus/src/retrieval/collector.ts` uses a multi-stage merge flow:
  - backends + fulltext
  - amendment-title expansion
  - document expansion
  - change-notice header expansion
  - final rerank
- Core functions: `mergeMax`, `collectHybridHitMap`, `mergeFulltextHits`, `finalizeHybridHits`
- Key rules:
  - stages run in order
  - `mergeMax` keeps the highest-scored hit per `sectionId`
  - fulltext recovery is the exception and uses score adjustment rather than merge-max semantics
- `computeDocumentCoverageBoosts()` is intentionally called twice:
  - pre-expansion to guide later title selection
  - post-expansion in `finalizeHybridHits` to feed reranking
- `finalizeHybridHits` can safely hoist repeated `Array.from(sectionMap.values())` calls because the map is not mutated there
- Depends on Neo4j session isolation and feeds into `maybeRerankHits`

- **Reranker gate / A/B evaluation**: `packages/policy-corpus/src/retrieval/rerank.ts` uses `shouldAttemptRerank()`
  - reranking is selective and fail-opens to baseline hits
  - disabled for explicit document types, `deterministic_evidence`, and too-few candidates
  - enabled for hard queries such as:
    - `federal_authority`
    - `amendment`
    - `policy_variant`
    - HCWD income premium queries
    - ambiguous top-hit sets meeting score-gap and document-count thresholds
- Evaluation finding:
  - retrieval-level reranker A/B is misleading because the standalone CLI lacks route analysis
  - correct comparison must run through answer-level evaluation
  - `scripts/eval-ab.sh` was corrected so `gate_reranker` uses `answer_arm()`, matching `gate_verifier`
- Common design conclusion:
  - stage-specific logic is essential
  - answer-level evaluation is the meaningful reranker measurement layer

## Document selection and coverage routing

### `document_selection/_index.md`
Describes document-level scoring, title expansion, and setting-aware narrowing in policy-corpus routing.

- Core responsibilities:
  - coverage boosts
  - title expansion for matching
  - variant scoring
  - HCWD coverage scoring
  - narrowing inferred coverage documents after scoring
- Key architectural change:
  - added `selectSettingPreferredDocuments(queryLower, documents)` to prioritize documents matching the care setting named in the query
  - setting preference is applied **before** `narrowInferredCoverageDocuments`
  - `variantReasoning` falls back to the setting preference reason when no sibling variant frame exists
- Processing flow:
  - `query terms -> document scoring -> optional setting preference -> narrowing -> frame assembly`
- Depends on `VARIANT_SETTING_TERMS`, title matching, and existing narrowing behavior
- Related drill-down targets:
  - `packages/policy_corpus/coverage_routing.md`
  - `packages/policy_corpus/coverage_frame_assembly.md`

### `coverage_routing/_index.md`
Summarizes the routing flow that feeds frame assembly.

- Routing flow:
  - `lookup documents -> infer documents from hits -> apply setting preference -> narrow -> return routing documents`
- Important behavior:
  - setting-scoped preference runs before inferred narrowing
  - if a query explicitly names a care setting and titles match, only setting-matching documents are returned
  - if no sibling policy variant frame exists, the setting preference reason is preserved in `variantReasoning`
- Key architectural decisions:
  - ordering matters: setting preference must precede narrowing
  - `narrowInferredCoverageDocuments` remains the final reducer for non-sibling sets
- Implemented across:
  - `packages/policy-corpus/src/frame/context/routing.ts`
  - `packages/policy-corpus/src/internal/document-selection.ts`
- Related to `coverage_frame_assembly.md`

### `coverage_frame_assembly/_index.md`
Covers how the final coverage answer frame is assembled from routed documents and evidence candidates.

- Core decision:
  - **setting-preferred routing documents are authoritative when no sibling variant frame takes precedence**
- The pipeline uses `selectSettingPreferredDocuments` to scope `preferredRoutingDocuments`
- `variantReasoning` falls back to the setting preference reason when no variant frame exists
- Key files:
  - `packages/policy-corpus/src/frame/pipelines/coverage.ts`
  - `packages/policy-corpus/src/frame/context/routing.ts`
  - `packages/policy-corpus/src/internal/document-selection.ts`
- Frame composition:
  - base hits
  - HCWD history hits
  - routed documents
  - section candidates
- These are organized into:
  - primary evidence
  - supporting evidence
  - avoid evidence
- Dependency pattern:
  - route selection
  - wildcard widening policy
  - sibling policy variant detection
  - document-scoped preference logic
- Rule:
  - for sibling sets, the variant frame takes precedence
  - otherwise, `settingPreference.documents` become `preferredRoutingDocuments`

## Rerank scoring

### `rerank_scoring/_index.md`
Documents the refactor of `packages/policy-corpus/src/internal/rerank.ts`.

- `rerankRetrievalHit` was split from a monolithic scorer into ~20 ordered `HitScorer` functions
- A shared `deriveHitFeatures` helper computes per-hit values once
- Scoring is orchestrated by `HIT_SCORERS`
- Execution flow:
  - `buildRerankQueryContext -> deriveHitFeatures -> apply HIT_SCORERS in order -> return adjusted hit`
- Constraints:
  - public signatures of `rerankRetrievalHit` and `buildRerankQueryContext` stay unchanged
  - exact floating-point behavior must be preserved for pinned tests in `tests/retrieval-ranking.test.ts`
  - scorer order matters; grouped summation can alter bit-level results
  - some boosts must remain early or late in the sequence
- Scoring areas include:
  - policy-number boosts
  - federal-authority routing
  - fee-schedule bucket scoring
  - waiver application handling
  - change-notice boosts
  - title-quality penalties
  - operational role alignment
  - HCWD / waiver special cases
  - boilerplate penalties
- Signature noted:
  - `HitScorer`: `(score, hit, ctx, features) => number`

## Frame assembly and authority rebalance

### `frame/_index.md`
Covers the broader policy-corpus frame pipeline, including selection and federal authority handling.

#### Coverage selection and graph fixtures
- Frame layer split across:
  - `packages/policy-corpus/src/frame/coverage/candidates.ts`
  - `coverage/selection.ts`
  - `federal-authority.ts`
- `SectionCandidate.score` was removed; selection is now positional rather than score-field driven
- Coverage selection pipeline:
  1. score coverage sections
  2. collect/group by coverage flags
  3. build initial selection
  4. build anchors
  5. assemble final sections by merging primary, supporting, and avoid sections
- Shared strict Neo4j graph fixtures provide:
  - typed record builders
  - query matchers
  - corpus/session stubs
  - handler execution checks
- Fixture rules:
  - strict records throw on missing fields
  - `expectAllHandlersUsed()` is required to flush dead handlers
  - scripted runs throw on unexpected extra queries unless `allowExtraQueries` is set

#### Federal authority pairing and rebalance
- Federal authority retrieval now explicitly pairs statute and regulation when query intent indicates an authority citation
- Driven by:
  - `asksForAuthorityCitation` in `query-intent.ts`
  - `authorityCitationQuery`
- Authority handling adds:
  - title boosting for official CFR/program headings
  - statute/regulation title pairing
  - candidate pairing so CFR remains authority-first
- Federal-authority pipeline steps:
  1. `buildFederalAuthoritySignals`
  2. `collectFederalAuthorityEvidence`
  3. `collectFederalImplementationEvidence`
  4. `buildFederalAuthorityCandidateSets`
- Rebalance hints adjust primary/supporting/avoid sections for:
  - waiver authority
  - SPA
  - EPSDT
- Important ordering rule:
  - `WAIVER_AUTHORITY_HINT` must run before `WAIVER_HINT`
- Intent-specific routing examples:
  - 1915(c) HCBS waiver authority -> `42 CFR Part 441 Subpart G`
  - SPA timeliness/submission -> `42 CFR 430`
  - EPSDT -> `42 CFR 441 Subpart B`
- MLR-specific hinting was considered but intentionally excluded because existing tests already produce the correct frame

## Evaluation harness

### `evaluation_harness_ab/_index.md`
Documents the A/B model comparison harness for the policy-corpus eval pipeline.

- This is an extension of the existing pipeline eval system, not a rewrite
- Harness compares model swaps for:
  - embeddings
  - reranker
  - verifier
- Orchestration:
  - `scripts/eval-ab.sh`
  - `runner.py`
  - baseline eval -> candidate eval -> `eval-compare`
- Key gate comparisons:
  - embeddings: `voyage-law-2` vs `voyage-4-large`
  - reranker: LLM reranker vs none/alternate reranker
  - verifier: `gpt-5.4-mini` vs `gpt-5.4-nano`
- Design decisions:
  - Neo4j Community Edition is treated as single-database, so the candidate corpus is isolated in a second container/volume on `bolt:7688`
  - `heldout-paraphrase.json` remains the only honest baseline after de-contamination review
  - adoption is blocked unless regression stays within `EVAL_REGRESSION_THRESHOLD = 0.05`
  - pipeline and agent embedding models must remain in lockstep: `PIPELINE EMBEDDING_MODEL` must equal `AGENT VOYAGE_MODEL`
  - `input_type` remains asymmetric between document and query embeddings
- Environment behavior:
  - `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `VOYAGE_MODEL` are environment-overridable
  - subprocesses propagate full `os.environ`
  - `load_dotenv(override=True)` does not override those values because the root `.env` only contains three API keys
- Provenance:
  - `runner.py` stamps fields such as `embedding_dimensions`, `neo4j_uri`, and `reranker`
  - this allows comparison tooling to separate baseline and candidate arms reliably
- Supported commands:
  - `scripts/eval-ab.sh embeddings`
  - `scripts/eval-ab.sh reranker`
  - `scripts/eval-ab.sh verifier`

## Cross-cutting structure

- **Routing and selection**: setting preference is applied before narrowing, and the selected routing documents become the frame inputs unless a sibling variant frame overrides them.
- **Ranking**: rerank scoring is exact, ordered, and test-protected; floating-point stability is a hard requirement.
- **Evaluation**: answer-level evaluation is the trusted comparison layer for reranker changes, while embeddings remain the higher-value optimization target.
- **Graph and test infrastructure**: strict fixture behavior and query/handler validation are used to surface missing data and dead branches early.