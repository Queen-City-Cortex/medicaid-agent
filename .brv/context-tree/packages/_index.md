---
children_hash: 8b9747b8856bc4b28338a47c912cb19de56dc98681fff53be9b7d9539a5d3c4f
compression_ratio: 0.18996415770609318
condensation_order: 2
covers: [crawler/_index.md, intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md, pipeline/_index.md, policy_corpus/_index.md, retrieval-quality-depends-on-decontamination-plus-staged-ranking.md, retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md, retrieval_quality/_index.md, staged-retrieval-and-overscan-are-the-shared-answer-from-search-to-evaluation.md, staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-.md, staged-retrieval-is-the-project-s-shared-retrieval-contract.md, staged-retrieval-is-the-shared-answer-from-policy-search-to-evaluation.md, staged-retrieval-not-global-top-k-is-the-project-s-retrieval-contract.md]
covers_token_total: 8928
summary_level: d2
token_count: 1696
type: summary
---
## d2 Structural Summary: Retrieval, Evaluation, and Crawl Hardening

This cluster shows a consistent architectural theme across crawler, retrieval, policy-corpus, and evaluation systems: **preserve behavior by isolating boundaries, stage candidate selection, and verify under controlled conditions**. The major patterns are: avoid mutable global state, prefer overscan + filter + dedup + rerank over naive top-k, and keep evaluation aligned with the real execution path.

### Crawler Fetching
- **`crawler/_index.md`** documents the Node 26 crawl fetcher hardening in `packages/crawler/src/crawl/fetcher.ts`.
- Core fix: the fetcher now uses a **private undici dispatcher** created in `createFetcher()`, with redirect handling via `interceptors.redirect({ maxRedirections })`.
- Key behavioral guarantees preserved:
  - per-domain serialization
  - rate limiting
  - retry/backoff logic
  - file streaming
- Root cause: importing crawler modules that load `cheerio` mutates undici global state via `setGlobalDispatcher()`, which breaks the full crawl path on Node 26 if `maxRedirections` is passed directly to `request()`.
- Rule set: use `request({ dispatcher })` with a composed agent; do not depend on the global dispatcher; consume error bodies before retry/return.
- Outcome: forward-compatible with undici 7 and verified on a dry run that discovered **177 clinical_policy docs**.
- Drill-down: **Undici Redirect Interceptor Fetcher Fix**.

### Retrieval as a Shared Contract
Several synthesis entries converge on the same cross-domain rule: **retrieval is staged, not single-pass**.
- Broadly:
  - overscan candidates first
  - filter by intent or document type
  - dedupe by stable identity (`sectionId` / `section_id`)
  - rerank or fuse at the end
- This pattern appears in:
  - **`retrieval-quality/_index.md`**
  - **`retrieval-quality-depends-on-decontamination-plus-staged-ranking.md`**
  - **`retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md`**
  - **`staged-retrieval-and-overscan-are-the-shared-answer-from-search-to-evaluation.md`**
  - **`staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-.md`**
  - **`staged-retrieval-is-the-project-s-shared-retrieval-contract.md`**
  - **`staged-retrieval-not-global-top-k-is-the-project’s-retrieval-contract.md`**
- Shared constraint: Neo4j `queryNodes(k)` is **global top-k**, so systems compensate by overscanning per group first.

### Policy Corpus Retrieval and Frame Pipeline
- **`policy_corpus/_index.md`** is the most complete structural map of the policy-corpus pipeline.
- Retrieval stack:
  - `packages/policy-corpus/src/retrieval/collector.ts`
  - stages include backends + fulltext, amendment-title expansion, document expansion, change-notice expansion, then final rerank
  - `mergeMax` keeps the highest-scored hit per `sectionId`
  - `computeDocumentCoverageBoosts()` is intentionally run twice: pre-expansion and post-expansion
- Reranker gating:
  - `packages/policy-corpus/src/retrieval/rerank.ts`
  - `shouldAttemptRerank()` is selective and fail-open
  - rerank is disabled for explicit document types, `deterministic_evidence`, and too-few candidates
  - hard-query routing includes federal authority, amendment, policy variant, HCWD income premium, and ambiguous top-hit sets
- Document selection / routing:
  - **`document_selection/_index.md`**
  - **`coverage_routing/_index.md`**
  - setting-aware narrowing happens **before** `narrowInferredCoverageDocuments`
  - if a query names a care setting, matching documents are preferred
  - `variantReasoning` falls back to setting-preference reasoning when no sibling variant frame exists
- Frame assembly:
  - **`coverage_frame_assembly/_index.md`**
  - setting-preferred routing documents are authoritative unless a sibling variant frame takes precedence
  - final frame composition merges base hits, HCWD history hits, routed documents, and section candidates into primary/supporting/avoid evidence
- Rerank scoring:
  - **`rerank_scoring/_index.md`**
  - `rerankRetrievalHit` was decomposed into ~20 ordered `HitScorer` functions
  - `deriveHitFeatures` computes per-hit features once
  - `HIT_SCORERS` order matters; floating-point behavior must remain pinned
  - public signatures must remain unchanged
- Frame assembly and authority rebalance:
  - **`frame/_index.md`**
  - coverage selection moved from score-field driven to positional selection
  - federal authority handling pairs statute and regulation when query intent indicates citation lookup
  - `WAIVER_AUTHORITY_HINT` must run before `WAIVER_HINT`
  - intent-specific routing examples include 1915(c) HCBS, SPA timeliness/submission, and EPSDT

### Evaluation and A/B Harness
- **`pipeline/_index.md`** captures the evaluation harness and CLI split.
- Pipeline CLI refactor:
  - `packages/pipeline/src/pipeline/cli.py` split into `pipeline.cli` package
  - preserved `python -m pipeline.cli` via `__main__.py`
  - command modules: `build.py`, `references.py`, `federal.py`, `graph.py`, `eval.py`, `audit.py`
  - validation reported clean build, `ruff` clean, **301 passed**, **2 skipped**, and **25 commands** still registered
- Eval A/B gate corrections:
  - `scripts/eval-ab.sh` now has three gates: embeddings, reranker, verifier
  - embeddings compare on an isolated AB Neo4j container using the same matched mixed corpus
  - reranker and verifier are measured at the **answer level**, not retrieval level
  - acceptance threshold: `EVAL_REGRESSION_THRESHOLD = 0.05`
- A/B harness results:
  - `voyage-4` vs `voyage-law-2`: quality comparable, slightly better MRR, ~50% cheaper; recommended adoption
  - `voyage-4-large` vs `voyage-law-2`: mostly a wash; suggests the bottleneck is structural rather than model choice
- Structural takeaway:
  - evaluation is designed to detect whether retrieval architecture, not just embedding choice, is the limiting factor.

### Cross-Cluster Pattern
Across these entries, the system’s design contract is consistent:
- **Isolate mutable runtime boundaries** when external modules can alter global state.
- **Stage retrieval** with overscan, filtering, deduplication, and reranking/fusion.
- **Preserve ordering and evaluation semantics** when refactoring scoring or CLI surfaces.
- **Use answer-level evaluation** when retrieval-only metrics miss routing or frame-assembly behavior.

### Drill-down Map
- **Crawler**: `crawler/_index.md`
- **Policy corpus retrieval**: `policy_corpus/_index.md`
- **Retrieval quality**: `retrieval-quality/_index.md`
- **Frame assembly**: `frame/_index.md`
- **Document selection / routing**: `document_selection/_index.md`, `coverage_routing/_index.md`
- **Rerank scoring**: `rerank_scoring/_index.md`
- **Evaluation harness**: `pipeline/_index.md`