---
children_hash: ed60ac0afd795acf729ce57353a7b7179173770c27567649024b6e9ab9aaf9a0
compression_ratio: 0.29269953691092343
condensation_order: 2
covers: [crawler/_index.md, intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md, pipeline/_index.md, policy_corpus/_index.md, retrieval-quality-depends-on-decontamination-plus-staged-ranking.md, retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md, retrieval_quality/_index.md, staged-retrieval-and-overscan-are-the-shared-answer-from-search-to-evaluation.md, staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-.md, staged-retrieval-is-the-shared-answer-from-policy-search-to-evaluation.md]
covers_token_total: 7342
summary_level: d2
token_count: 2149
type: summary
---
# Retrieval, Evaluation, and Crawler Hardening

This d2 cluster groups the project’s main reliability patterns: staged retrieval across search and evaluation, controlled A/B harnesses for model changes, and crawler fetcher hardening for Node 26 compatibility. The shared design principle is **preserve behavior by isolating runtime boundaries, overscanning candidates, and validating changes in controlled environments**.

## 1) Staged retrieval is the dominant search pattern

See **Policy Corpus Retrieval and Frame Assembly**, **Retrieval Quality / Staged Ranking**, and the synthesis entries on staged retrieval.

- Retrieval consistently avoids single-pass global top-k.
- Canonical flow:
  - **query intent → candidate scoring → vector overscan → topical filtering → group-specific ranking → RRF merge**
- Core mechanisms repeated across entries:
  - per-type-group vector overscan via `vectorScanK(profile.perGroupK)`
  - filtering by `document_type`
  - deduplication by stable identity (`sectionId` / `section_id`)
  - reciprocal rank fusion
  - final reranking after broader collection
- Important constraint:
  - Neo4j `queryNodes(k)` returns **global top-k**, so it cannot satisfy per-group coverage alone.
  - The system compensates by overscanning first, then filtering and reranking.
- Recurrent relationship:
  - retrieval quality depends on **decontamination + staged ranking**, not raw ranking scores alone.

### Related drill-down entries
- **Policy Corpus Retrieval and Frame Assembly**
  - Coverage selection, routing, document selection, hybrid retrieval, and evaluation harness integration.
- **Retrieval Quality / Staged Ranking**
  - Per-group overscan, collector behavior, and decontamination rules.
- **Intent-aware staged retrieval dominates both policy search and graph frame assembly**
  - Cross-domain statement of the same staged-retrieval principle.
- **Staged retrieval and overscan are the shared answer from search to evaluation**
  - Connects retrieval behavior to evaluation.
- **Staged retrieval is the common answer to policy search, graph frame assembly, and QA trust**
  - Shows the same pattern across search, graph assembly, and QA.

## 2) Policy corpus frame assembly is intent-sensitive and stage-ordered

See **Policy Corpus Retrieval and Frame Assembly**.

### Coverage routing and document selection
- Routing flow:
  - lookup documents → infer documents from hits → apply setting preference → narrow → return routing documents
- Key architectural decision:
  - **setting-scoped document preference runs before inferred narrowing**
- Behavior preserved:
  - if a query names a care setting and titles match, routing returns only setting-matching documents.
  - if no sibling policy variant frame exists, setting preference reason is preserved in `variantReasoning`.
- `selectSettingPreferredDocuments(queryLower, documents)` is the central selector.

### Frame assembly
- Final coverage answer frame merges:
  - base hits
  - HCWD history hits
  - routed documents
  - section candidates
- These are organized into:
  - primary evidence
  - supporting evidence
  - avoid evidence
- Important rule:
  - **setting-preferred routing documents become authoritative when no sibling variant frame takes precedence**

### Hybrid retrieval and reranking
- Collector pipeline stages:
  - backend/fulltext collection
  - amendment-title expansion
  - document expansion
  - change-notice header expansion
  - final rerank
- `mergeMax` keeps highest-scored hit per `sectionId`.
- Fulltext recovery is handled specially with score adjustment rather than merge-max semantics.
- `computeDocumentCoverageBoosts()` is intentionally run twice:
  - pre-expansion to guide expansion
  - post-expansion in `finalizeHybridHits` to feed reranking
- `finalizeHybridHits` may hoist `Array.from(sectionMap.values())` locally, but stage-sensitive boosts must not be deduped across phases.

### Evaluation harness
- The policy-corpus A/B harness is an extension of the existing pipeline eval system, not a rewrite.
- It compares:
  - embeddings
  - reranker
  - verifier
- Major guardrails:
  - isolated candidate corpus on a second Neo4j container/volume
  - `heldout-paraphrase.json` as the honest baseline after decontamination review
  - adoption blocked unless regression is within `EVAL_REGRESSION_THRESHOLD = 0.05`
  - `PIPELINE EMBEDDING_MODEL` must equal `AGENT VOYAGE_MODEL`
  - `input_type` remains asymmetric between document and query embeddings

## 3) A/B evaluation and CLI refactors preserve behavior under structural change

See **A/B Evaluation Harness and CLI Split**.

### Pipeline CLI package split
- `packages/pipeline/src/pipeline/cli.py` was split into a `pipeline.cli` package.
- New package structure:
  - `pipeline/cli/_shared.py`
  - `pipeline/cli/__init__.py`
  - `pipeline/cli/__main__.py`
  - command modules: `build.py`, `references.py`, `federal.py`, `graph.py`, `eval.py`, `audit.py`
- Compatibility was preserved:
  - registration side effects still load the full command suite
  - backward-compatible exports remain
  - `python -m pipeline.cli` still works
- Tests were updated to monkeypatch module-local helpers in the new command modules.
- Verified outcome:
  - clean build
  - `ruff` clean
  - **301 passed, 2 skipped**
  - **25 commands** still register

### Eval A/B gate corrections
- `scripts/eval-ab.sh` defines shared helpers:
  - `latest_run_id`
  - `summarize_metric`
  - `answer_arm`
  - `embeddings_arm`
- It dispatches to:
  - `gate_embeddings`
  - `gate_reranker`
  - `gate_verifier`
- Important corrections:
  - embeddings gates compare models on a matched mixed corpus in an isolated AB Neo4j container
  - comparison dimension is embedding model only, not corpus composition
  - `CANDIDATE_DIMS` defaults to **1024**
  - `embeddings_arm` sends progress to stderr so stdout remains the latest `run_id`
  - reranker evaluation is answer-level, not retrieval-level
  - verifier evaluation is stochastic and repeated with citation checking
- Adoption rule:
  - accept only when regression stays within **0.05**

### Embedding A/B results
- `voyage-4` vs `voyage-law-2`
  - matched mixed corpus
  - **1024-dim vectors**
  - **50 held-out items**
  - quality matches on `precision@k` and `primary_hit_rate`
  - `MRR` slightly improves
  - embedding cost drops about **50%**
  - recommendation: **adopt voyage-4**
- `voyage-law-2` vs `voyage-4-large`
  - both are **1024-dimensional**
  - `MRR` slightly improves
  - other metrics are flat or worse
  - no cost advantage
  - verdict: **wash**
  - bottleneck likely structural: chunking, query routing, or retrieval design

## 4) Crawler fetcher hardening isolates undici state

See **Crawler Fetching**.

- The crawler fetcher was hardened for Node 26 by moving redirect handling into a **private undici dispatcher** inside `createFetcher()`.
- Redirects are handled with:
  - `new Agent().compose(interceptors.redirect({ maxRedirections }))`
- Preserved runtime behavior:
  - per-domain serialization
  - rate limiting
  - retry/backoff
  - file streaming
- Root cause:
  - importing crawler source modules that load `cheerio` mutates undici global state via `setGlobalDispatcher()`
  - Node 26 rejects `maxRedirections` passed directly to `request()`
- Required rules:
  - do not rely on the undici global dispatcher when crawl sources may import `cheerio`
  - do not pass `maxRedirections` directly to `request()`
  - consume error response bodies before retrying or returning
  - preserve domain-level serialization and rate limiting
- Outcome:
  - forward-compatible with undici 7
  - verification succeeded, including a dry run that discovered **177 clinical_policy docs**

## 5) Cross-entry pattern

Across these clusters, the project repeatedly uses the same engineering strategy:

- **Stage work instead of collapsing it into one step**
  - retrieval overscans, filters, dedupes, then reranks
- **Preserve intent-sensitive boundaries**
  - setting preference before narrowing
  - answer-level evaluation instead of retrieval-only evaluation
- **Isolate runtime state**
  - private undici dispatcher instead of global state
- **Validate changes with controlled comparisons**
  - isolated AB corpus
  - held-out baselines
  - explicit regression thresholds
- **Keep behavioral compatibility during refactors**
  - CLI package split retained the command surface and import behavior

### Best drill-down path
1. **Policy Corpus Retrieval and Frame Assembly**
2. **Retrieval Quality / Staged Ranking**
3. **A/B Evaluation Harness and CLI Split**
4. **Crawler Fetching**