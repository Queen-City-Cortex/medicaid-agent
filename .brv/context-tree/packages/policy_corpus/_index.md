---
children_hash: 17197a604836771268ee92e71fd6061f4ed553b77225ffe660c85c3ae4cc5f26
compression_ratio: 0.3922955974842767
condensation_order: 1
covers: [coverage_frame_assembly/_index.md, coverage_routing/_index.md, document_selection/_index.md, evaluation_harness_ab/_index.md, frame/_index.md, golden_dataset_de_contamination_and_retrieval_constants.md, retrieval/_index.md]
covers_token_total: 5088
summary_level: d1
token_count: 1996
type: summary
---
# Policy Corpus Retrieval and Frame Assembly

This cluster covers the policy-corpus pipeline from hit collection through document selection, routing, frame assembly, and evaluation. The shared theme is **stage-specific ordering matters**: the system preserves intent-sensitive choices at each step instead of reusing earlier results out of context.

## 1) Coverage selection, routing, and frame assembly

### `coverage_frame_assembly/_index.md`
- Describes how the final coverage answer frame is assembled from routed documents and evidence candidates.
- The assembly merges:
  - base hits
  - HCWD history hits
  - routed documents
  - section candidates
- These are organized into primary, supporting, and avoid evidence.
- Key rule: **setting-preferred routing documents become authoritative when no sibling variant frame takes precedence**.
- `selectSettingPreferredDocuments` scopes `preferredRoutingDocuments`; `variantReasoning` falls back to the setting-preference reason when no variant frame exists.
- Important dependencies:
  - route selection
  - wildcard widening policy
  - sibling policy variant detection
  - document-scoped preference logic
- Related drill-down:
  - `coverage_routing.md`
  - `document_selection.md`

### `coverage_routing/_index.md`
- Documents the routing flow for policy coverage questions:
  - lookup documents → infer documents from hits → apply setting preference → narrow → return routing documents
- Main architectural decision: **setting-scoped document preference runs before inferred narrowing**.
- When a query names a care setting and titles match, routing returns only setting-matching documents.
- If no sibling policy variant frame exists, the setting preference reason is preserved in `variantReasoning`.
- The final reducer remains `narrowInferredCoverageDocuments`, which keeps the raw-score winner for non-sibling sets.
- This prevents distractor variants, such as CAP/DA, from displacing the intended congregate PCS document.
- Related source files:
  - `packages/policy-corpus/src/frame/context/routing.ts`
  - `packages/policy-corpus/src/internal/document-selection.ts`

### `document_selection/_index.md`
- Covers document-level selection, scoring, narrowing, and setting preference.
- Core responsibilities:
  - document coverage boosts
  - title expansion
  - variant scoring
  - HCWD coverage scoring
  - narrowing inferred coverage documents after scoring
- Key change: `selectSettingPreferredDocuments(queryLower, documents)` prioritizes documents matching the care setting named in the query.
- Setting preference is applied **before** `narrowInferredCoverageDocuments`.
- Depends on `VARIANT_SETTING_TERMS`, title matching, and existing narrowing behavior.
- Processing flow:
  - query terms → document scoring → optional setting preference → narrowing → frame assembly
- Related routing/assembly areas:
  - `coverage_routing.md`
  - `coverage_frame_assembly.md`

## 2) Hybrid retrieval and reranking

### `retrieval/_index.md`
This entry describes two linked retrieval layers.

#### `hybrid_retrieval_collector_pipeline.md`
- The collector uses a multi-stage merge pipeline:
  - stage 1: backends + fulltext
  - stage 3: amendment-title expansion
  - stage 4: document expansion
  - stage 5: change-notice header expansion
  - final rerank
- Key functions:
  - `mergeMax`
  - `collectHybridHitMap`
  - `mergeFulltextHits`
  - `finalizeHybridHits`
- `mergeMax` keeps the highest-scored hit per `sectionId`.
- Fulltext recovery is the exception and uses score adjustment rather than merge-max semantics.
- `computeDocumentCoverageBoosts()` is intentionally called twice:
  - once on the pre-expansion map to guide expansion
  - once in `finalizeHybridHits` on the post-expansion map to feed reranking
- These two calls must not be deduped or reused across stages.
- `finalizeHybridHits` can safely hoist repeated `Array.from(sectionMap.values())` calls into a local `hits` const because the map is not mutated there.
- Depends on Neo4j session isolation and feeds into `maybeRerankHits`.
- Verification status: `typecheck:tests` and `vitest 153/153 pass`.

#### `reranker_gate_logic_and_a_b_evaluation.md`
- The reranker is selective and controlled by `shouldAttemptRerank()`.
- It fail-opens to baseline hits when gate conditions are not met.
- Gate conditions include:
  - disabled for explicit document types
  - disabled for `deterministic_evidence`
  - disabled when below `MIN_RERANK_CANDIDATES`
  - enabled for hard queries with question types:
    - `federal_authority`
    - `amendment`
    - `policy_variant`
  - enabled for HCWD income premium queries
  - enabled for `ambiguous_top_hits` when `distinctDocuments.size >= 3` and `scoreGap <= 0.2`
- Retrieval-level reranker A/B was found to be misleading because the standalone retrieval CLI lacks route analysis and often reports `reason=not_hard_query`, effectively skipping reranking.
- Correct evaluation path is **answer-level evaluation**.
- `scripts/eval-ab.sh` was corrected so `gate_reranker` uses `answer_arm()`, aligning it with `gate_verifier`.
- Broader conclusion: embeddings are the higher-value optimization target because the reranker is dormant for many queries.
- Example gate reasons:
  - `explicit_document_types`
  - `deterministic_route`
  - `too_few_candidates`
  - `not_hard_query`
  - `hard_query:federal_authority`
  - `hard_query:hcwd_income_premium`
  - `ambiguous_top_hits`

## 3) Coverage frame assembly dependencies

### `coverage_frame_assembly/_index.md` and `coverage_routing/_index.md`
- The routing layer feeds the frame assembler.
- Setting-specific routing is preserved even when non-sibling documents have higher raw scores.
- When sibling sets exist, the variant frame takes precedence; otherwise, `settingPreference.documents` becomes `preferredRoutingDocuments`.
- The assembler merges routed documents with evidence candidates and sorts them into primary, supporting, and avoid evidence.

## 4) Evaluation harness and A/B comparisons

### `evaluation_harness_ab/_index.md`
- Documents the policy-corpus A/B evaluation harness as an extension of the existing pipeline eval system, not a rewrite.
- The harness compares baseline vs candidate arms for:
  - embeddings
  - reranker
  - verifier
- Orchestration flow:
  - baseline eval → candidate eval → `eval-compare`
  - repeated verifier runs for stability
  - citation gate for verifier output
- Key pipeline components:
  - `packages/pipeline/src/pipeline/config.py`
  - `packages/agent/src/config.ts`
  - `packages/pipeline/src/pipeline/eval/runner.py`
  - `scripts/eval-ab.sh`
  - `docker-compose.ab.yml`
- Major design decisions:
  - Neo4j Community Edition is treated as single-database, so the candidate corpus is isolated in a second container/volume on `bolt:7688`
  - `heldout-paraphrase.json` is the only honest baseline after de-contamination review
  - adoption is blocked unless regression is no greater than `EVAL_REGRESSION_THRESHOLD = 0.05`
  - `PIPELINE EMBEDDING_MODEL` must equal `AGENT VOYAGE_MODEL`
  - `input_type` remains asymmetric between document and query embeddings
- `runner.py` stamps provenance such as `embedding_dimensions`, `neo4j_uri`, and `reranker` so comparison tooling can separate baseline and candidate arms.
- Supporting drill-down entries:
  - `embeddings_a_b_result_voyage_4_vs_voyage_law_2.md`
  - `embeddings_a_b_result_voyage_law_2_vs_voyage_4_large.md`
  - `a_b_model_comparison_eval_harness_corrections.md`
  - `eval_a_b_gate_corrections.md`

## 5) Cross-cutting pattern

- The retrieval stack, routing logic, and evaluation harness all enforce **ordering and stage boundaries**.
- Setting preference must happen before narrowing.
- Boosts must be computed in the correct stage and not reused across phases.
- Reranker results must be measured at the answer layer, not the raw retrieval CLI layer.
- Frame assembly remains intent-aware, with query intent controlling which documents are surfaced, paired, or demoted.