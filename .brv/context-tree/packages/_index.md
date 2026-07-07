---
children_hash: f0c719bee80bf2c8cc746c890f52a90af48a26471264cff32c14543ed251a7e4
compression_ratio: 0.2754315492346108
condensation_order: 2
covers: [crawler/_index.md, intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md, pipeline/_index.md, policy_corpus/_index.md, retrieval-quality-depends-on-decontamination-plus-staged-ranking.md, retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md, retrieval_quality/_index.md, staged-retrieval-and-overscan-are-the-shared-answer-from-search-to-evaluation.md, staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-.md, staged-retrieval-is-the-project-s-shared-contract-from-search-to-evaluation.md, staged-retrieval-is-the-project-s-shared-retrieval-contract.md, staged-retrieval-is-the-project-wide-answer-to-ranking-routing-and-evaluation.md, staged-retrieval-is-the-shared-answer-from-policy-search-to-evaluation.md, staged-retrieval-not-global-top-k-is-the-project-s-retrieval-contract.md]
covers_token_total: 9211
summary_level: d2
token_count: 2537
type: summary
---
# d2 Structural Summary

## Crawler fetching hardening
- **`crawler/_index.md`** documents the fetcher reliability fix for Node 26. The key architectural change is a **private undici dispatcher** created inside `createFetcher()`, with redirects handled by `interceptors.redirect({ maxRedirections })`.
- The fix isolates crawl execution from mutable global undici state triggered when imported crawler modules load `cheerio` and call `setGlobalDispatcher()`.
- Preserved behavior includes **per-domain serialization**, **rate limiting**, **retry/backoff**, and **file streaming**. The full crawl path remains the relevant failure surface, not isolated `request()` calls.
- Important rule set:
  - do not rely on the global dispatcher when `cheerio` may be imported
  - use `request({ dispatcher })` with `new Agent().compose(interceptors.redirect({ maxRedirections }))`
  - do not pass `maxRedirections` directly to `request()`
  - consume error response bodies before retrying or returning
- Outcome: the approach is forward-compatible with undici 7 and verified via crawl discovery / robots.txt handling, including a dry run that found **177 clinical_policy docs**.

## Retrieval as a staged, intent-aware contract
Several entries converge on the same core retrieval pattern: **broad candidate collection first, then filtering, deduplication, and reranking/fusion**.

### Shared retrieval principle
- **`intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md`**
- **`retrieval-quality-depends-on-decontamination-plus-staged-ranking.md`**
- **`retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md`**
- **`staged-retrieval-and-overscan-are-the-shared-answer-from-search-to-evaluation.md`**
- **`staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-.md`**
- **`staged-retrieval-is-the-project-s-shared-contract-from-search-to-evaluation.md`**
- **`staged-retrieval-is-the-project-s-shared-retrieval-contract.md`**
- **`staged-retrieval-is-the-project-wide-answer-to-ranking-routing-and-evaluation.md`**
- **`staged-retrieval-is-the-shared-answer-from-policy-search-to-evaluation.md`**
- **`staged-retrieval-not-global-top-k-is-the-project-s-retrieval-contract.md`**

Common structure across these entries:
- query intent / candidate scoring
- vector overscan
- topical or type filtering
- dedupe by stable identity such as `sectionId` / `section_id`
- group-specific ranking
- reciprocal rank fusion or final rerank
- evaluation against held-out or grounded evidence

### Why staged retrieval is necessary
- Neo4j `queryNodes(k)` is **global top-k** and therefore too lossy for grouped coverage needs.
- Systems compensate by **overscanning per group first** and then filtering/reranking.
- Retrieval quality is tied to **coverage preservation**, **intent awareness**, and **decontamination** rather than single-pass ranking.
- In evaluation contexts, retrieval must be judged at the **same layer as the product behavior**; retrieval-only comparisons can miss routing or gating effects.

### Key relationships across domains
- **`policy_corpus/_index.md`** is the central structural summary for policy retrieval, reranking, coverage routing, section selection, and contract-level tests.
- **`retrieval_quality/_index.md`** provides the canonical retrieval-quality flow:
  - `query intent -> candidate scoring -> vector overscan -> topical filtering -> group-specific ranking -> RRF merge`
- **`intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md`** links policy search, Neo4j hybrid search, and agent retrieval tooling under the same staged model.
- **`database_operations/_index.md`** repeatedly reinforces the same pattern in graph search and frame assembly.
- **`evaluation/_index.md`** ties these retrieval behaviors to answer-quality and cross-reference validation.

## Policy corpus architecture
- **`policy_corpus/_index.md`** is the main structural overview for the policy corpus retrieval stack.
- It separates the system into:
  - **retrieval / reranking**
  - **coverage routing**
  - **document selection**
  - **coverage frame assembly**
  - **section candidate profiles**
  - **internal helper contracts**
  - **test predicates**
  - **rerank scoring**
  - **refactoring risk**
- The dominant architectural rule is that **ordering is semantic**: routing, narrowing, expansion, scoring, and rebalance steps must remain in sequence.

### Retrieval and reranking
- **`retrieval/hybrid_retrieval_collector_pipeline.md`**
  - Collector stages:
    1. backends + fulltext
    2. amendment-title expansion
    3. document expansion
    4. change-notice header expansion
    5. final rerank
  - `mergeMax` preserves the top-scored hit per `sectionId`.
  - `computeDocumentCoverageBoosts()` is intentionally called twice: before expansion and again during finalization.
- **`retrieval/reranker_gate_logic_and_a_b_evaluation.md`**
  - `shouldAttemptRerank()` is selective and fail-open.
  - Reranking is gated off for explicit document types, deterministic evidence, too few candidates, and similar cases.
  - Reranker comparisons must run through **answer-level evaluation**, not retrieval-only evaluation.

### Coverage routing and frame assembly
- **`coverage_routing/_index.md`**
  - Flow: `lookup documents -> infer documents from hits -> apply setting preference -> narrow -> return routing documents`
  - `selectSettingPreferredDocuments` runs **before** `narrowInferredCoverageDocuments`
  - Setting-matching documents win when the query names a care setting and titles match.
- **`document_selection/_index.md`**
  - Combines coverage boosts, title expansion, variant scoring, HCWD scoring, and narrowing behavior.
  - `narrowInferredCoverageDocuments` still reduces non-sibling sets to the raw-score winner.
- **`coverage_frame_assembly/_index.md`**
  - Final frame merges base hits, HCWD history hits, routed documents, and section candidates into primary/supporting/avoid evidence.
  - Sibling policy variants take precedence; otherwise setting preference carries through as `preferredRoutingDocuments`.

### Section candidates and score contracts
- **`coverage_sections/_index.md`**
  - Refactors candidate building into **two declarative ordered rule tables**.
  - Pipeline:
    `query flags -> derived signals -> ordered rule tables -> profilesFor() -> collectProfiles() -> uniqueBy(section.id)`
  - Rule order is load-bearing because downstream selection uses **first-wins deduplication**.
- **`internal/_index.md`**
  - Enumerates canonical helper contracts like `documentKeyForHit`, `computeDocumentCoverageBoosts`, `selectSettingPreferredDocuments`, and `pickTopDocumentCandidates`.
  - `pickTopDocumentCandidates` defaults to `FRAME_DOCUMENT_LIMIT = 3`.
- **`tests/_index.md`**
  - Locks in exact predicate behavior, including section-title rules, telehealth checks, date detection, and title clustering.
- **`rerank_scoring/_index.md`**
  - `packages/policy-corpus/src/internal/rerank.ts` was split into ~20 ordered `HitScorer` functions.
  - Public APIs remain unchanged, but **floating-point fold order is critical**.

### Refactoring risk
- **`refactoring_audit/_index.md`**
  - Main risks are pinned float-score assertions and waiver-authority predicate drift.
  - Ordered float additions must not be regrouped.
  - Waiver-authority logic is duplicated across multiple modules and should be consolidated around `isWaiverAuthoritySection()`.

## A/B evaluation and CLI/package structure
- **`pipeline/_index.md`** covers two connected areas:
  1. the **pipeline CLI package split**
  2. the **A/B evaluation harness and gate corrections**
- The shared theme is preserving behavior under structural change and validating with controlled, repeatable runs.

### CLI package split
- `packages/pipeline/src/pipeline/cli.py` was split into a `pipeline.cli` package.
- New structure:
  - `_shared.py` for shared click setup and Rich console
  - `__init__.py` as package entry point
  - `__main__.py` to preserve `python -m pipeline.cli`
  - command modules: `build.py`, `references.py`, `federal.py`, `graph.py`, `eval.py`, `audit.py`
- The split preserved the full command suite, backward-compatible exports, and avoided partially initialized package import issues.
- Validation: clean build, `ruff` clean, **301 passed**, **2 skipped**, with **25 commands** still registered.

### A/B gate corrections
- `scripts/eval-ab.sh` defines shared helpers for `latest_run_id`, `summarize_metric`, `answer_arm`, and `embeddings_arm`, then dispatches to three gates:
  - `gate_embeddings`
  - `gate_reranker`
  - `gate_verifier`
- Embeddings comparisons run in an **isolated AB Neo4j container** using the same matched mixed corpus for both arms.
- `CANDIDATE_DIMS` defaults to **1024**, matching `voyage-law-2` and avoiding width mismatch with `voyage-4-large`.
- `embeddings_arm` keeps progress on stderr so stdout only contains the latest run id.
- Adoption rule: regressions must stay within `EVAL_REGRESSION_THRESHOLD = 0.05`.

### Embedding A/B outcomes
- **`A/B Embedding Evaluation Harness and Results`** within `pipeline/_index.md`
  - `voyage-4` matches quality on `precision@k` and `primary_hit_rate`, slightly improves `MRR`, and cuts cost by about **50%**.
  - Recommendation: **adopt voyage-4** and re-embed the production corpus, updating `EMBEDDING_MODEL` and `VOYAGE_MODEL` together.
  - `voyage-4-large` versus `voyage-law-2` is effectively a wash: slightly better `MRR`, but flat or worse `precision@k`, `primary_hit_rate`, and `recall@k`, with no cost benefit.
  - The bottleneck is likely **structural** rather than model choice.

## Overall pattern across the corpus
- The knowledge base consistently treats **ordering, gating, and staged selection** as first-class design constraints.
- Retrieval is not “top-k and done”; it is:
  - overscan
  - filter
  - dedupe
  - rerank / fuse
  - evaluate at the correct layer
- Structural changes are acceptable when they preserve:
  - public behavior
  - stable identities like `sectionId`
  - exact score semantics
  - controlled evaluation methodology