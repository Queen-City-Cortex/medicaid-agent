---
children_hash: 3507fd3f903a6ea893c9c72d0a2f6130ac4138cc0c47155f63a107b0503b52f4
compression_ratio: 0.42623863425496383
condensation_order: 2
covers: [crawler/_index.md, intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md, pipeline/_index.md, policy_corpus/_index.md, retrieval-quality-depends-on-decontamination-plus-staged-ranking.md, retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md, retrieval_quality/_index.md, staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-.md]
covers_token_total: 5389
summary_level: d2
token_count: 2297
type: summary
---
# Structural Summary: Retrieval and Evaluation Stack

This cluster centers on a shared system pattern: **staged retrieval with overscan, filtering, deduplication, and reranking/verification**. Across crawler, pipeline evaluation, policy corpus retrieval, and graph-based search, the architecture consistently avoids trusting single-pass top-k results and instead uses intent-aware or constraint-aware selection before final assembly.

## 1) Crawler Fetcher Hardening
**Drill down:** `crawler/_index.md` → `fetching/_index.md`

- The crawler’s fetch path was hardened for **Node 26** by isolating redirect handling inside a **private undici dispatcher** created in `createFetcher()`.
- Redirects now use `request({ dispatcher })` with `new Agent().compose(interceptors.redirect({ maxRedirections }))`.
- This preserves existing crawl semantics:
  - per-domain serialization
  - rate limiting
  - retry/backoff behavior
  - file streaming behavior
- Root cause: importing crawler modules that load `cheerio` mutates undici global state via `setGlobalDispatcher()`, which makes global `request({ maxRedirections })` unsafe.
- Key rule: **do not rely on undici global dispatcher when crawler sources may import `cheerio`**.
- Outcome: forward-compatible with undici 7 and verified on crawl discovery / robots.txt handling, including a dry run that discovered **177 clinical_policy docs**.

## 2) A/B Embedding Evaluation Harness
**Drill down:** `pipeline/_index.md` → `eval_a_b_gate_corrections.md`, `evaluation_harness_ab/_index.md` → result entries

- The A/B harness in `scripts/eval-ab.sh` now runs three gates:
  - **embeddings**
  - **reranker**
  - **verifier**
- The embeddings gate is now **apples-to-apples**, using a controlled mixed corpus rather than the production graph.
- Mixed corpus sources: **dhhs_policy, clinical_policy, state_plan_amendment, CFR, SSA**.
- Important harness constraints:
  - `CANDIDATE_DIMS` defaults to **1024**
  - `embeddings_arm` writes progress to **stderr**, leaving stdout for the latest `run_id`
  - reranker evaluation should be measured via **answer eval**, not retrieval-only eval
  - verifier is **stochastic** and uses repeated answer runs
  - swaps are only accepted if regression stays within **`EVAL_REGRESSION_THRESHOLD = 0.05`**
- Structural evaluation flow:
  1. build matched corpus
  2. run retrieval or answer evaluation
  3. compare held-out metrics
  4. enforce regression threshold
  5. choose based on **quality + cost**
- Key result pattern:
  - **`voyage-4` vs `voyage-law-2`**: `voyage-4` is preferred; quality matches on precision@k and primary_hit_rate with slight MRR improvement, while cost drops ~50%.
  - **`voyage-law-2` vs `voyage-4-large`**: larger model is a wash; slight MRR gain but flat/worse precision@k, primary_hit_rate, and recall@k, with no cost advantage.
- Migration rule: re-embed the production corpus and update **both** `EMBEDDING_MODEL` and `VOYAGE_MODEL` together.

## 3) Policy Corpus Structural Pipeline
**Drill down:** `policy_corpus/_index.md` → `coverage_routing/_index.md`, `document_selection/_index.md`, `coverage_frame_assembly/_index.md`, `frame/_index.md`, `retrieval/_index.md`, `evaluation_harness_ab/_index.md`

### Coverage routing and document selection
- The routing chain is:
  **lookup documents -> infer documents from hits -> apply setting preference -> narrow -> return routing documents**
- Core rule: **setting-preferred routing documents are authoritative before inferred narrowing**.
- `selectSettingPreferredDocuments(queryLower, documents)` runs before `narrowInferredCoverageDocuments`.
- `variantReasoning` falls back to the setting-preference reason when no sibling variant frame exists.
- This prevents strong explicit matches from being displaced by weaker inferred matches.

### Frame assembly
- Routed documents feed final answer framing via merged evidence buckets:
  - **primary**
  - **supporting**
  - **avoid**
- In sibling sets, the **variant frame** takes precedence; otherwise `settingPreference.documents` becomes `preferredRoutingDocuments`.
- Relevant implementation paths:
  - `packages/policy-corpus/src/frame/context/routing.ts`
  - `packages/policy-corpus/src/internal/document-selection.ts`
  - `packages/policy-corpus/src/frame/pipelines/coverage.ts`

### Broader frame pipeline
- Coverage selection follows a **5-stage pipeline**:
  1. score coverage sections
  2. collect/group by coverage flags
  3. build initial selection
  4. build anchors
  5. assemble final sections
- `SectionCandidate.score` was removed; selection is now **positional**, not score-field driven.
- Authority handling explicitly pairs **statute and regulation** when citation intent is detected.
- Authority evidence is resolved in four steps:
  1. `buildFederalAuthoritySignals`
  2. `collectFederalAuthorityEvidence`
  3. `collectFederalImplementationEvidence`
  4. `buildFederalAuthorityCandidateSets`
- Rebalance hints adjust primary/supporting/avoid sections for **waiver authority**, **SPA**, and **EPSDT**.
- Ordering matters: `WAIVER_AUTHORITY_HINT` must run before `WAIVER_HINT`.

### Retrieval gating and evaluation
- `shouldAttemptRerank()` only activates for **hard or ambiguous queries** and fail-opens to baseline hits otherwise.
- Reranking is disabled for:
  - explicit document types
  - deterministic route / deterministic evidence
  - too few candidates
- It is enabled for query types such as:
  - `federal_authority`
  - `amendment`
  - `policy_variant`
  - `HCWD income premium`
- The reranker is a **guarded, fail-open refinement**; embeddings are identified as the more important optimization target.

### A/B harness integration
- The policy-corpus A/B harness extends the existing eval system rather than replacing it.
- Main components:
  - `packages/pipeline/src/pipeline/config.py`
  - `packages/agent/src/config.ts`
  - `packages/pipeline/src/pipeline/eval/runner.py`
  - `scripts/eval-ab.sh`
  - `docker-compose.ab.yml`
- Design constraints:
  - Neo4j Community Edition is treated as **single-database**
  - candidate corpus is isolated in a **second container/volume** on `bolt:7688`
  - `heldout-paraphrase.json` is the trusted baseline after de-contamination review
  - adoption is blocked unless regression stays within `0.05`
- Provenance fields used for comparison include:
  - `embedding_dimensions`
  - `neo4j_uri`
  - `reranker`
- Environment-overridable settings include:
  - `EMBEDDING_MODEL`
  - `EMBEDDING_DIMENSIONS`
  - `VOYAGE_MODEL`
- Core compatibility rule: `PIPELINE EMBEDDING_MODEL` must equal `AGENT VOYAGE_MODEL` for meaningful vector similarity.

## 4) Shared Retrieval Principle Across Stacks
**Drill down:** `retrieval_quality/_index.md`, `packages/_index.md` synthesis entries, `database_operations/_index.md`

- A common architecture appears across policy search, graph frame assembly, and QA trust:
  **query intent -> candidate scoring -> vector overscan -> topical filtering -> group-specific ranking -> RRF merge**
- Neo4j’s `queryNodes(k)` returns a **global top-k**, so the system compensates by overscanning per type group first.
- Deduplication is done by stable identities such as:
  - `sectionId`
  - `section_id`
- Search stacks combine multiple signals:
  - vector embeddings
  - chunk embeddings
  - concept-graph matches
  - fulltext keyword hits
- Final merge uses **Reciprocal Rank Fusion (RRF)**, with `RRF_K = 60` in the graph-search path.
- Key insight: **specialized routing and filtering should happen before generic narrowing**.

## 5) Decontamination and Retrieval Quality
**Drill down:** `retrieval_quality/_index.md` and related synthesis entries

- Retrieval quality depends on both **decontamination** and **staged ranking**.
- The retrieval backend in `packages/policy-corpus/src/retrieval/backends/section-vector.ts`:
  - iterates `profile.typeGroups`
  - overscans each group with `vectorScanK(profile.perGroupK)`
  - filters by `document_type`
- The collector in `packages/policy-corpus/src/retrieval/collector.ts` performs staged ranking and final merge ordering.
- Cleanup rules reduce contamination:
  - **HCWD**: replace limit-history terms with topical HCWD income-rule terms; remove the `01-14` change-notice bonus from HCWD history retrieval
  - **HCBS**: keep `WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS`, but remove hardcoded section-number heuristics like `5.4.3`
- Retrieval quality is therefore tied to:
  - candidate selection
  - fixture/data contamination control
  - stable identity deduplication
  - controlled reranking

## 6) Cross-Cluster Pattern
- The dominant design across these entries is a **staged, intent-aware retrieval architecture**.
- Whether the system is:
  - crawling remote sources,
  - evaluating embeddings,
  - assembling policy frames,
  - or doing hybrid graph search,
  it consistently prefers:
  1. broad collection
  2. filtering by intent or type
  3. deduplication by stable identity
  4. reranking/fusion
  5. guarded verification or final assembly

- The operational constraint throughout is the same: **avoid trusting raw top-k results**; use controlled intermediate stages and preserve provenance, authority, and routing preferences.