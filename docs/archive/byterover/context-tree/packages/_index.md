---
children_hash: 81c0dbc7e784851ab432827301d04ae6b6fd4ca25a76d4d9859e61cf79e9345a
compression_ratio: 0.21108924445965602
condensation_order: 2
covers: [agent/_index.md, crawler/_index.md, intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md, pipeline/_index.md, policy_corpus/_index.md, production-readiness-depends-on-realistic-probes-not-synthetic-health-signals.md, production-realism-is-the-reliability-gate-across-health-smoke-tests-and-refresh.md, retrieval-quality-depends-on-decontamination-plus-staged-ranking.md, retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md, retrieval_quality/_index.md, staged-retrieval-and-overscan-are-the-shared-answer-from-search-to-evaluation.md, staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-.md, staged-retrieval-is-the-project-s-shared-contract-from-search-to-evaluation.md, staged-retrieval-is-the-project-s-shared-retrieval-contract.md, staged-retrieval-is-the-project-wide-answer-to-ranking-routing-and-evaluation.md, staged-retrieval-is-the-project-wide-contract-from-search-to-evaluation.md, staged-retrieval-is-the-shared-answer-from-policy-search-to-evaluation.md, staged-retrieval-not-global-top-k-is-the-project-s-retrieval-contract.md]
covers_token_total: 11687
summary_level: d2
token_count: 2467
type: summary
---
# D2 Structural Summary

## Operational readiness and realistic verification
The knowledge set repeatedly rejects shallow success signals in favor of production-realistic checks. `agent/_index.md` captures this through provider health probes and a live Playwright smoke test, while the synthesis entries reinforce the same rule across health checks, smoke tests, and refresh jobs.

### `agent/_index.md`
- Groups two production-facing checks:
  - `provider_health_checks.md`
  - `production_smoke_test.md`
- Shared pattern: validate **real failure modes**, not superficial pass conditions.
- `provider_health_checks.md`
  - `packages/agent/src/health.ts`
  - Exports `checkProviders` and `resetProviderHealthCache`
  - Deploy-gating sources: **Neo4j** and **LibSQL**
  - Informational sources: **OpenAI** and **Voyage**
  - Flow: `/healthz` → cached result or refresh → parallel probes → classify status → cache update
  - Uses **stale-while-revalidate** with a **60-second refresh window** and shared `inFlight` deduplication
  - OpenAI failures are classified by **status code**, not `response.ok`
  - Probe constraints: minimal tokens, **5-second timeout**
- `production_smoke_test.md`
  - `e2e/scripts/smoke-production.mjs`
  - Playwright-based production smoke test for `/chat`
  - Flow: load envs → authenticate via WorkOS → open fresh chat → ask question → wait for final answer → expand research trail → count tool steps → save screenshot
  - Required credentials: `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`
  - Fails on assistant error, missing answer, or too-short answer
  - Default minimum answer length: **200 characters**
  - Requires at least **one visible tool step** and visible sources
  - Must expand `research-trail-trigger` because step cards unmount when collapsed
  - Env precedence: `.env.local` before `.env`, including `packages/web/.env.local`
  - Saves success screenshot and `.failed` screenshot on error
- Shared theme: **production realism** and guardrails against false positives.

### Related synthesis entries
- `production-readiness-depends-on-realistic-probes-not-synthetic-health-signals.md`
- `production-realism-is-the-reliability-gate-across-health-smoke-tests-and-refresh-jobs.md`

---

## Crawler fetcher hardening
`crawler/_index.md` documents a runtime fix focused on Node 26 compatibility and preserving crawl semantics.

### `crawler/_index.md`
- Core file: `packages/crawler/src/crawl/fetcher.ts`
- The fetcher now owns a **private undici dispatcher** inside `createFetcher()`
- Redirects use `interceptors.redirect({ maxRedirections })`
- Preserved behavior:
  - per-domain serialization
  - rate limiting
  - retry/backoff logic
  - file streaming
- Root cause:
  - full crawl path breaks when imported modules such as `cheerio` mutate undici global state via `setGlobalDispatcher()`
  - Node 26 rejects `maxRedirections` passed directly to `request()`
- Runtime flow:
  - crawl start → robots.txt fetch → source imports load `cheerio` → global dispatcher mutation → private dispatcher handles redirects → crawl continues
- Preserved rules:
  - do not rely on the undici global dispatcher when `cheerio` may be imported
  - use `request({ dispatcher })` with `new Agent().compose(interceptors.redirect({ maxRedirections }))`
  - do not pass `maxRedirections` directly to `request()`
  - consume error response bodies before retrying or returning
- Outcome:
  - forward-compatible with undici 7
  - verified crawl discovery and robots.txt handling, including a dry run that found **177 clinical_policy docs**

---

## Retrieval architecture is staged, not single-pass
Multiple summaries across `policy_corpus`, `retrieval_quality`, and the staged-retrieval syntheses converge on one contract: retrieval must overscan, filter, dedupe, and rerank rather than trust a global top-k.

### `policy_corpus/_index.md`
- Covers retrieval, reranking, frame assembly, document selection, tests, and evaluation harness behavior
- Core pattern:
  - query intent and document structure drive routing before narrowing/reranking
  - downstream frame assembly consumes ordered outputs
- Major subareas:
  - `coverage_routing/_index.md`
  - `coverage_frame_assembly/_index.md`
  - `coverage_sections/_index.md`
  - `document_selection/_index.md`
  - `retrieval/_index.md`
  - `rerank_scoring/_index.md`
  - `evaluation_harness_ab/_index.md`
  - `tests/_index.md`
  - `refactoring_audit/_index.md`
- Key routing rule:
  - `selectSettingPreferredDocuments(queryLower, documents)` runs **before** `narrowInferredCoverageDocuments`
  - sibling variant frame takes precedence; otherwise `settingPreference.documents` become `preferredRoutingDocuments`
- Frame assembly:
  - merges base hits, HCWD history hits, routed documents, and section candidates into primary/supporting/avoid evidence
- Document selection:
  - boosts coverage, title expansion, variant scoring, and HCWD coverage scoring
  - `pickTopDocumentCandidates` dedupes by document id and caps at `FRAME_DOCUMENT_LIMIT = 3`
- Coverage sections refactor:
  - `COVERAGE_PRIMARY_PROFILE_RULES` and `COVERAGE_SUPPORTING_PROFILE_RULES`
  - order is load-bearing; first-wins dedupe by `section.id`
- Retrieval collector:
  - `computeDocumentCoverageBoosts()` is intentionally called twice
  - `mergeMax` keeps highest-scored hit per `sectionId`
  - reranking is selective and fail-open
- Rerank scoring:
  - `rerankRetrievalHit` split into ~20 ordered `HitScorer` functions
  - scorer order preserves exact floating-point behavior
- A/B harness:
  - baseline eval → candidate eval → `eval-compare`
  - compares embeddings, reranker, verifier
  - adoption blocked unless regression stays within `EVAL_REGRESSION_THRESHOLD = 0.05`
  - Neo4j Community Edition treated as single-database; candidate corpus isolated in second container/volume on `bolt:7688`
- Cross-cutting theme:
  - **ordering is load-bearing**
  - exact score stability is protected by pinned tests
  - stage-specific reuse is prohibited when it would make boosts stale

### `retrieval_quality/_index.md`
- Canonical flow:
  - `query intent -> candidate scoring -> vector overscan -> topical filtering -> group-specific ranking -> RRF merge`
- Core architecture:
  - `retrieval/backends/section-vector.ts` overscans each type group with `vectorScanK(profile.perGroupK)`
  - `retrieval/collector.ts` performs staged ranking and final merge
  - final ordering uses **reciprocal rank fusion (RRF)** after deduplicating by `sectionId`
- Key constraint:
  - `queryNodes(k)` returns a **global top-k**, so it cannot satisfy per-group coverage alone
- Decontamination rules:
  - HCWD: replace limit-history terms with topical HCWD income-rule terms; remove `01-14` change-notice bonus
  - HCBS: preserve `WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS`, but remove hardcoded section-number heuristics like `5.4.3`
- Related concern:
  - retrieval quality depends on both candidate selection and contamination control

### Shared staged-retrieval syntheses
- `staged-retrieval-and-overscan-are-the-shared-answer-from-search-to-evaluation.md`
- `staged-retrieval-is-the-common-answer-to-policy_search_graph_frame_assembly_and_qa_trust.md`
- `staged-retrieval-is-the-project-wide-answer-to-ranking-routing-and-evaluation.md`
- `staged-retrieval-is-the-project-wide-contract-from-search-to-evaluation.md`
- Common message:
  - search stacks reject single-pass top-k
  - they overscan broadly, filter by intent or type, dedupe by stable identity, then rerank/fuse
  - evaluation depends on those staged behaviors to produce trustworthy answer-quality and cross-reference results

### A/B and pipeline execution
`pipeline/_index.md` ties together evaluation harness corrections and the CLI package split that preserved command behavior.

#### `pipeline/_index.md`
- Two subclusters:
  - `Eval A/B Gate Corrections`
  - `Pipeline CLI Package Split`
- CLI split:
  - `packages/pipeline/src/pipeline/cli.py` split into `pipeline.cli` package
  - structure includes:
    - `_shared.py`
    - `__init__.py`
    - `__main__.py`
    - command modules: `build.py`, `references.py`, `federal.py`, `graph.py`, `eval.py`, `audit.py`
  - preserves `python -m pipeline.cli`
  - retains backward-compatible exports
  - avoids partially initialized package import issues
  - validation: clean build, `ruff` clean, **301 passed**, **2 skipped**
  - command suite still registers **25 commands**
- Eval A/B gate corrections:
  - shared helpers: `latest_run_id`, `summarize_metric`, `answer_arm`, `embeddings_arm`
  - gates: embeddings, reranker, verifier
  - embeddings gate uses isolated AB Neo4j container with the same controlled matched mixed corpus for both arms
  - `CANDIDATE_DIMS` defaults to **1024**
  - embeddings arm writes progress to stderr so stdout only contains the latest `run_id`
  - reranker evaluation is answer-level, not retrieval-level
  - verifier uses repeated answer runs with citation checking
  - accept only if regression stays within `0.05`
- A/B result summaries:
  - `voyage-4` matches quality vs `voyage-law-2` with ~50% lower embedding cost
  - `voyage-4-large` is a wash vs `voyage-law-2`; bottleneck appears structural, not model-related

---

## Cross-entry themes
- **Production realism**: prefer live probes, authenticated smoke tests, and real service behavior over synthetic indicators
- **Runtime boundary correctness**: private dispatchers, env precedence, and isolated execution containers prevent environment leakage
- **Staged retrieval**: overscan, filter, dedupe, rerank, and fuse is the repeated architectural contract
- **Order sensitivity**: routing, scoring, and profile selection preserve exact ordering because it affects behavior and float stability
- **Evaluation discipline**: compare against controlled corpora and held-out baselines, then decide based on regression thresholds and grounded outputs