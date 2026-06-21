---
children_hash: 4050fd3327a889efb4df34e7627e7af8842913fa64e8ee4bc8fd4d6fa5e86b0b
compression_ratio: 0.19048175865294667
condensation_order: 2
covers: [crawler/_index.md, intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md, pipeline/_index.md, policy_corpus/_index.md, retrieval-quality-depends-on-decontamination-plus-staged-ranking.md, retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md, retrieval_quality/_index.md, staged-retrieval-and-overscan-are-the-shared-answer-from-search-to-evaluation.md, staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-.md, staged-retrieval-is-the-shared-answer-from-policy-search-to-evaluation.md, staged-retrieval-not-global-top-k-is-the-project-s-retrieval-contract.md]
covers_token_total: 8552
summary_level: d2
token_count: 1629
type: summary
---
# Structural Summary: Retrieval, Evaluation, and Crawl Hardening

## Main themes
- The knowledge entries converge on a shared architectural rule: **avoid single-pass global top-k behavior** and instead use **staged retrieval** with overscan, filtering, deduplication, and reranking/fusion.
- A second recurring theme is **behavior preservation under structural change**: refactors and runtime fixes are accepted only when they keep semantics, command surfaces, and validation outcomes stable.
- A third theme is **runtime boundary correctness**: crawler and auth-related fixes focus on isolating mutable global state and keeping behavior reliable across Node/runtime changes.

## Retrieval contract across systems
See:
- **`staged-retrieval-not-global-top-k-is-the-project-s-retrieval-contract.md`**
- **`staged-retrieval-is-the-shared-answer-from-policy-search-to-evaluation.md`**
- **`staged-retrieval-and-overscan-are-the-shared-answer-from-search-to-evaluation.md`**
- **`retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md`**
- **`retrieval-quality-depends-on-decontamination-plus-staged-ranking.md`**
- **`intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md`**

### Core pattern
- Canonical flow is: **query intent → candidate scoring → vector overscan → topical/type filtering → group-specific ranking → RRF merge**.
- Neo4j `queryNodes(k)` is a **global top-k** API, so the system compensates with **per-group overscan** before filtering and reranking.
- Deduplication is stable and identity-based, commonly by **`sectionId`** or **`section_id`** before fusion.
- Hybrid retrieval blends multiple signals:
  - vector / embedding search
  - chunk embeddings
  - concept-graph matches
  - fulltext recovery
  - reranker / verifier layers

### Policy corpus specifics
Covered primarily in **`policy_corpus/_index.md`** and its children:
- `retrieval/_index.md`: staged collector pipeline, `mergeMax`, fulltext recovery exception, `finalizeHybridHits`, and selective reranking.
- `document_selection/_index.md` and `coverage_routing/_index.md`: setting-aware routing must happen **before** narrowing; preferred documents are narrowed only after preference logic.
- `coverage_frame_assembly/_index.md`: routing documents become authoritative unless a sibling variant frame overrides them.
- `rerank_scoring/_index.md`: `rerankRetrievalHit` was split into ~20 ordered `HitScorer` functions; scorer order and floating-point stability are hard requirements.
- `frame/_index.md`: selection and federal-authority rebalance logic preserve intent-specific routing for waiver, SPA, and EPSDT queries.
- `evaluation_harness_ab/_index.md`: A/B harness compares embeddings, reranker, and verifier changes under controlled evaluation conditions.

### Retrieval-quality constraints
- Decontamination matters alongside ranking:
  - HCWD cleanup removes misleading hardcoded history cues.
  - HCBS preserves legitimate waiver section numbers while removing brittle heuristics.
- Retrieval quality is treated as a **pipeline property**, not a model-only property.

## Evaluation and A/B harness structure
See:
- **`pipeline/_index.md`**
- **`policy_corpus/_index.md`** sections on evaluation harness
- **`staged-retrieval-and-overscan-are-the-shared-answer-from-search-to-evaluation.md`**

### Two linked evaluation layers
1. **Pipeline CLI split**
   - `packages/pipeline/src/pipeline/cli.py` was refactored into a `pipeline.cli` package.
   - Command registration is preserved via package entry-point imports.
   - Modules include:
     - `_shared.py`
     - `__init__.py`
     - `__main__.py`
     - `build.py`, `references.py`, `federal.py`, `graph.py`, `eval.py`, `audit.py`
   - Validation remained clean: build, `ruff`, **301 passed**, **2 skipped**.
   - The command suite still registers **25 commands**.

2. **A/B evaluation corrections**
   - `scripts/eval-ab.sh` now supports three gates:
     - embeddings
     - reranker
     - verifier
   - Embeddings comparisons run in an isolated AB Neo4j container with a matched corpus.
   - The evaluator uses a **0.05 regression threshold** for adoption.
   - `voyage-4` is recommended over `voyage-law-2` due to similar quality and lower cost.
   - `voyage-4-large` was a wash versus `voyage-law-2`, suggesting the bottleneck is structural, not just model choice.

### Shared evaluation rule
- The project prefers **answer-level evaluation** for reranker/verifier changes.
- Retrieval-only comparisons are considered misleading when route analysis exists only in the full agent path.

## Crawler fetcher hardening
See:
- **`crawler/_index.md`**

### Root problem
- Crawl failures appeared in the **full crawl path**, not isolated `request()` calls.
- Source imports that load `cheerio` mutate undici global state via `setGlobalDispatcher()`.
- On Node 26, passing `maxRedirections` directly to `request()` fails with:
  - `maxRedirections is not supported, use the redirect interceptor`

### Architectural fix
- `createFetcher()` now owns a **private undici dispatcher**.
- Redirects use:
  - `new Agent().compose(interceptors.redirect({ maxRedirections }))`
- The fetcher no longer relies on the **global dispatcher** when crawler sources may import `cheerio`.
- Existing crawl behavior is preserved:
  - per-domain serialization
  - rate limiting
  - retry/backoff
  - file streaming

### Outcome
- The fix is forward-compatible with undici 7.
- Verification confirmed crawl discovery and robots.txt handling succeed, including a dry run that discovered **177 clinical_policy docs**.

## Structural takeaways
- **Staged retrieval is the project’s retrieval contract**: broad candidate collection first, then controlled narrowing and fusion.
- **Ordering matters** in routing, ranking, and evaluation:
  - preference before narrowing
  - rerank after candidate assembly
  - answer-level evaluation for reranker/verifier changes
- **Runtime isolation matters** for reliability:
  - crawler fetchers must avoid mutable global dispatcher dependence
  - refactors must preserve command and evaluation behavior

## Drill-down map
- **Crawler fetcher hardening** → `crawler/_index.md`
- **Policy corpus retrieval and frame pipeline** → `policy_corpus/_index.md`
- **Rerank scoring and evaluation harness** → `pipeline/_index.md`
- **Retrieval-quality / staged ranking synthesis** → `retrieval_quality/_index.md`
- **Cross-system staged retrieval synthesis entries** → the four staged-retrieval synthesis files above