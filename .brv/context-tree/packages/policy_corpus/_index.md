---
children_hash: c1a7825eedffbe00011e073aa89fd8584b021acf9cfa95026c2378d800342919
compression_ratio: 0.335960801022582
condensation_order: 1
covers: [coverage_frame_assembly/_index.md, coverage_routing/_index.md, document_selection/_index.md, evaluation_harness_ab/_index.md, frame/_index.md, golden_dataset_de_contamination_and_retrieval_constants.md, retrieval/_index.md]
covers_token_total: 4694
summary_level: d1
token_count: 1577
type: summary
---
# Policy Corpus Structural Summary

## Coverage routing, document selection, and frame assembly
- **`coverage_routing/_index.md`** and **`document_selection/_index.md`** describe the same routing chain from document hits to final routing documents.
- Core flow: `lookup documents -> infer documents from hits -> apply setting preference -> narrow -> return routing documents`.
- Key architectural decision: **setting-preferred routing documents are authoritative before inferred narrowing**.
- `selectSettingPreferredDocuments(queryLower, documents)` runs ahead of `narrowInferredCoverageDocuments`, and `variantReasoning` falls back to the setting-preference reason when no sibling variant frame exists.
- This protects explicit setting matches, preventing distractors such as **CAP/DA** from displacing intended documents like **congregate PCS**.
- `coverage_frame_assembly/_index.md` shows how routed documents feed the final answer frame: base hits, HCWD history hits, routed documents, and section candidates are merged into **primary**, **supporting**, and **avoid** evidence.
- In sibling sets, the **variant frame** takes precedence; otherwise `settingPreference.documents` becomes `preferredRoutingDocuments`.
- Relevant source files across these entries:
  - `packages/policy-corpus/src/frame/context/routing.ts`
  - `packages/policy-corpus/src/internal/document-selection.ts`
  - `packages/policy-corpus/src/frame/pipelines/coverage.ts`

## Frame pipeline and authority handling
- **`frame/_index.md`** captures the broader policy-corpus frame pipeline.
- Coverage selection is a **5-stage pipeline**:
  1. score coverage sections
  2. collect/group by coverage flags
  3. build initial selection
  4. build anchors
  5. assemble final sections by merging primary, supporting, and avoid sections
- `SectionCandidate.score` was removed; selection is now **positional**, not score-field driven.
- Shared strict Neo4j graph fixtures centralize typed record builders, query matchers, corpus/session stubs, and handler execution checks.
- Fixture behavior is intentionally strict:
  - missing fields throw
  - `expectAllHandlersUsed()` is required
  - unexpected extra queries fail unless `allowExtraQueries` is set
- Authority retrieval now explicitly pairs **statute and regulation** when query intent indicates an authority citation.
- The authority pipeline resolves evidence in four steps:
  1. `buildFederalAuthoritySignals`
  2. `collectFederalAuthorityEvidence`
  3. `collectFederalImplementationEvidence`
  4. `buildFederalAuthorityCandidateSets`
- Rebalance hints adjust primary/supporting/avoid sections for **waiver authority**, **SPA**, and **EPSDT**.
- Ordering matters: `WAIVER_AUTHORITY_HINT` must run before `WAIVER_HINT`.
- Intent-specific routing examples:
  - 1915(c) HCBS waiver authority -> `42 CFR Part 441 Subpart G`
  - SPA timeliness/submission -> `42 CFR 430`
  - EPSDT -> `42 CFR 441 Subpart B`

## Retrieval gating and evaluation
- **`retrieval/_index.md`** documents reranker gating and its evaluation findings.
- `shouldAttemptRerank()` only runs for **hard or ambiguous queries** and fail-opens to baseline hits otherwise.
- Reranking is disabled for:
  - explicit document types
  - deterministic route / deterministic evidence
  - too few candidates (`MIN_RERANK_CANDIDATES`)
- It is enabled for hard queries with question types such as:
  - `federal_authority`
  - `amendment`
  - `policy_variant`
  - `HCWD income premium`
- It is also enabled for `ambiguous_top_hits` when `distinctDocuments.size >= 3` and `scoreGap <= 0.2`.
- Evaluation was corrected to happen at the **answer level** via `scripts/eval-ab.sh` and `answer_arm()`, not retrieval-level comparison.
- Retrieval-level reranker A/B showed no meaningful delta; the conclusion is that the reranker is a guarded, fail-open refinement, while **embeddings** are the more important optimization target.
- Related evaluation artifacts:
  - `packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_4_vs_voyage_law_2.md`
  - `packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_law_2_vs_voyage_4_large.md`
  - `packages/pipeline/evaluation_harness_ab/a_b_model_comparison_eval_harness_corrections.md`
  - `packages/pipeline/eval_a_b_gate_corrections.md`

## A/B model comparison harness
- **`evaluation_harness_ab/_index.md`** describes the policy-corpus A/B eval harness as an extension of the existing pipeline eval system, not a rewrite.
- Orchestration pattern: **baseline eval -> candidate eval -> `eval-compare`**, with repeated answer runs for verifier stability and a citation gate.
- Main pipeline components:
  - `packages/pipeline/src/pipeline/config.py`
  - `packages/agent/src/config.ts`
  - `packages/pipeline/src/pipeline/eval/runner.py`
  - `scripts/eval-ab.sh`
  - `docker-compose.ab.yml`
- Gated comparisons:
  - **Embeddings**: `voyage-law-2` vs `voyage-4-large`
  - **Reranker**: LLM reranker vs none/alternate reranker
  - **Verifier**: `gpt-5.4-mini` vs `gpt-5.4-nano`
- Design constraints:
  - Neo4j Community Edition is treated as **single-database**
  - candidate corpus is isolated in a **second container/volume** on `bolt:7688`
  - `heldout-paraphrase.json` remains the only honest baseline after de-contamination review
  - adoption is blocked unless regression stays within `EVAL_REGRESSION_THRESHOLD = 0.05`
- Provenance is stamped in `runner.py` so `eval-compare` can distinguish baseline vs candidate arms using fields like `embedding_dimensions`, `neo4j_uri`, and `reranker`.
- Environment-overridable settings include:
  - `EMBEDDING_MODEL`
  - `EMBEDDING_DIMENSIONS`
  - `VOYAGE_MODEL`
- `PIPELINE EMBEDDING_MODEL` must equal `AGENT VOYAGE_MODEL` for meaningful vector similarity, and `input_type` remains asymmetric between document and query embeddings.

## Cross-cutting patterns
- The policy-corpus frame pipeline is increasingly **intent-aware**: query intent determines which sections are surfaced, paired, narrowed, or demoted.
- Setting preference, authority citation handling, and reranking all reflect a common rule: **specialized routing should happen before generic narrowing**.
- The local context emphasizes strict, failure-loud fixtures and provenance-preserving evaluation so routing and scoring changes can be compared reliably.