---
children_hash: 91c58f90d12d8af25173839426df2f388842809d41d4a15842cb6662d185e381
compression_ratio: 0.2711551376762928
condensation_order: 2
covers: [crawler/_index.md, intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md, pipeline/_index.md, policy_corpus/_index.md, retrieval-quality-depends-on-decontamination-plus-staged-ranking.md, retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md, retrieval_quality/_index.md, staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-.md, staged-retrieval-is-the-shared-answer-from-policy-search-to-evaluation.md]
covers_token_total: 5956
summary_level: d2
token_count: 1615
type: summary
---
## Structural Summary: Retrieval, Curation, and Evaluation Patterns

This cluster is dominated by a shared architectural pattern: **staged retrieval with overscan, filtering, deduplication, and reranking/fusion**. Across the entries, the system consistently avoids trusting a single global top-k pass and instead uses intent-aware candidate collection followed by controlled merge and verification stages.

### 1) Crawler fetcher hardening
- **`crawler/_index.md`** documents the fetcher fix for Node 26 reliability in `packages/crawler/src/crawl/fetcher.ts`.
- Core decision: use a **private undici dispatcher** inside `createFetcher()` rather than relying on global dispatcher state.
- Redirect handling is moved to `interceptors.redirect({ maxRedirections })`, preserving:
  - per-domain serialization
  - rate limiting
  - retry/backoff
  - file streaming
- Root cause: importing crawler modules that load `cheerio` mutates undici global state via `setGlobalDispatcher()`, which breaks full crawl execution.
- Verification notes include successful crawl discovery and robots handling, with a dry run discovering **177 clinical_policy docs**.
- Drill-down entry: **Undici Redirect Interceptor Fetcher Fix**.

### 2) Retrieval as a staged system
Multiple synthesis entries converge on the same retrieval design:

- **`retrieval-quality-depends-on-decontamination-plus-staged-ranking.md`**
- **`retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md`**
- **`retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-search-stacks.md`**
- **`staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-.md`**
- **`staged-retrieval-is-the-shared-answer-from-policy-search-to-evaluation.md`**
- **`intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md`**

Common pattern:
1. **query intent**
2. **candidate scoring**
3. **vector overscan**
4. **topical or document-type filtering**
5. **group-specific ranking**
6. **dedupe by stable identity** such as `sectionId` or `section_id`
7. **RRF merge / fusion**

Key architectural implications:
- Neo4j `queryNodes(k)` is **global top-k only**, so it cannot satisfy per-group coverage alone.
- Systems compensate by overscanning per group first, then filtering and reranking.
- Retrieval quality depends on **decontamination** as well as ranking:
  - HCWD cleanup removes misleading limit-history cues and preserves topical income-rule terms.
  - HCBS cleanup keeps legitimate waiver section numbers while removing hardcoded heuristics.
- The policy-corpus stack uses **intent-aware routing**, where specialized routing or authority handling happens before generic narrowing.

Drill-down anchors:
- policy-corpus frame assembly and coverage routing
- retrieval backends and collector logic
- graph search / hybrid retrieval behavior in database_operations
- evaluation and QA evidence-handling constraints

### 3) Policy corpus routing and frame assembly
- **`policy_corpus/_index.md`** describes the structural pipeline that routes documents and assembles the final evidence frame.
- Core routing chain:
  - `lookup documents -> infer documents from hits -> apply setting preference -> narrow -> return routing documents`
- Important rule: **setting-preferred routing documents are authoritative before inferred narrowing**.
- `selectSettingPreferredDocuments(queryLower, documents)` runs before `narrowInferredCoverageDocuments`.
- `variantReasoning` falls back to the setting-preference reason when no sibling variant frame exists.
- This prevents explicit setting matches from being displaced by distractors.
- Frame assembly merges **base hits, HCWD history hits, routed documents, and section candidates** into:
  - **primary**
  - **supporting**
  - **avoid**
- In sibling sets, the **variant frame** takes precedence; otherwise `settingPreference.documents` becomes `preferredRoutingDocuments`.

Related drill-down entries:
- **coverage_routing/_index.md**
- **document_selection/_index.md**
- **coverage_frame_assembly/_index.md**
- **frame/_index.md**

### 4) Retrieval gating and evaluation harness
- **`pipeline/_index.md`** summarizes the corrected A/B evaluation harness for embedding and reranker/verifier comparisons.
- `scripts/eval-ab.sh` now drives three gates:
  - **embeddings**
  - **reranker**
  - **verifier**
- The embeddings gate uses a **controlled mixed corpus**, not the production graph.
- Mixed corpus sources: **dhhs_policy, clinical_policy, state_plan_amendment, CFR, SSA**.
- `CANDIDATE_DIMS` defaults to **1024**, matching `voyage-law-2` and `voyage-4-large`.
- Adoption threshold: only accept swaps if regression stays within **`EVAL_REGRESSION_THRESHOLD = 0.05`**.
- `verifier` is stochastic and uses repeated answer runs.
- `embeddings_arm` writes progress to **stderr** so stdout only returns the latest `run_id`.

Result summaries:
- **`Embeddings A/B Result: voyage-4 vs voyage-law-2`**
  - `voyage-4` matches quality, slightly improves MRR, and cuts cost by about **50%**
  - recommendation: **adopt voyage-4**
  - migration requires re-embedding and updating both `EMBEDDING_MODEL` and `VOYAGE_MODEL`
- **`Embeddings A/B Result: voyage-law-2 vs voyage-4-large`**
  - slight MRR improvement but no meaningful recall/precision gain
  - same cost, so effectively a wash
  - likely bottleneck is structural, not embedding-specific

### 5) Cross-cutting themes
- **Staged retrieval is the dominant design pattern** across search, frame assembly, evaluation, and QA.
- The system favors:
  - overscan before precision
  - stable identity deduplication
  - intent-aware filtering
  - provenance-preserving merge boundaries
  - fail-open or guarded fallback behavior where appropriate
- Structural correctness is treated as more important than single-pass ranking convenience.
- Evaluation is designed to compare **entire retrieval behaviors**, not isolated retrieval scores.

### 6) Where to drill down
- **Crawler Fetching** → undici dispatcher isolation, redirect handling, Node 26 compatibility
- **Policy Corpus Structural Summary** → routing, frame assembly, authority handling, reranking
- **Retrieval Quality / Staged Ranking** → per-group overscan, deduplication, decontamination rules
- **A/B Embedding Evaluation Harness** → gate corrections, controlled corpus, candidate dimension policy
- **Embedding result entries** → model selection outcomes and migration implications