---
children_hash: 734ffaaab9fbc78bd2539c9c55c3353837dcf2d5fbff2ed7f6e54327e1e81748
compression_ratio: 0.30400525279054497
condensation_order: 2
covers: [crawler/_index.md, intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md, pipeline/_index.md, policy_corpus/_index.md, retrieval-quality-depends-on-decontamination-plus-staged-ranking.md, retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md, retrieval_quality/_index.md, staged-retrieval-and-overscan-are-the-shared-answer-from-search-to-evaluation.md, staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-.md, staged-retrieval-is-the-project-s-shared-contract-from-search-to-evaluation.md, staged-retrieval-is-the-project-s-shared-retrieval-contract.md, staged-retrieval-is-the-shared-answer-from-policy-search-to-evaluation.md, staged-retrieval-not-global-top-k-is-the-project-s-retrieval-contract.md]
covers_token_total: 9138
summary_level: d2
token_count: 2778
type: summary
---
# Structural Summary: Retrieval, Curation, and Evaluation Contracts

## High-level pattern
These entries describe a shared project contract: **never trust naive global top-k or structural change without validation**. Across crawler, policy corpus, pipeline, retrieval quality, and evaluation, the recurring architecture is:

**overscan / isolate / filter / dedupe / rerank / verify**

This shows up in:
- crawler fetcher hardening for Node 26
- staged retrieval in policy corpus and hybrid search
- A/B evaluation harnesses for embeddings, rerankers, and verifiers
- CLI refactors that preserve command behavior under package restructuring

---

## 1) Crawler fetcher hardening
### `crawler/_index.md`
- Main concern: make crawl execution reliable on **Node 26** without changing crawl semantics.
- Key implementation detail: `packages/crawler/src/crawl/fetcher.ts` now uses a **private undici dispatcher** inside `createFetcher()`.
- Redirects are handled via `interceptors.redirect({ maxRedirections })`.
- The fix avoids relying on the **global undici dispatcher**, because importing crawler sources that load `cheerio` can mutate global state via `setGlobalDispatcher()`.
- Preserved runtime behavior:
  - per-domain serialization
  - rate limiting
  - retry/backoff
  - file streaming
- Required rule: do **not** pass `maxRedirections` directly to `request()`.
- Outcome: forward-compatible with undici 7 and verified in crawl discovery / robots.txt flow, including a dry run that found **177 clinical_policy docs**.

**Drill-down:** `Undici Redirect Interceptor Fetcher Fix`

---

## 2) Retrieval is staged, not one-shot
### `retrieval_quality/_index.md`
- Canonical flow:
  **query intent -> candidate scoring -> vector overscan -> topical filtering -> group-specific ranking -> RRF merge**
- Core technical constraint: `queryNodes(k)` in Neo4j returns a **global top-k**, so the system compensates by overscanning per group first.
- Key backend behavior:
  - `retrieval/backends/section-vector.ts` iterates `profile.typeGroups`
  - uses `vectorScanK(profile.perGroupK)`
  - filters by `document_type`
  - final ordering uses **reciprocal rank fusion (RRF)** after deduping by `sectionId`
- Decontamination rules matter:
  - HCWD should replace limit-history terms with HCWD income-rule terms
  - HCBS should preserve `WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS`
  - hardcoded heuristics like `5.4.3` should be removed from prior-auth quantity detection

### Synthesis entries reinforcing the same contract
- `staged-retrieval-and-overscan-are-the-shared-answer-from-search-to-evaluation.md`
- `staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-qa-trust.md`
- `staged-retrieval-is-the-project-s-shared-retrieval-contract.md`
- `staged-retrieval-is-the-project’s-shared-contract-from-search-to-evaluation.md`
- `staged-retrieval-is-the-shared-answer-from-policy-search-to-evaluation.md`
- `staged-retrieval-not-global-top-k-is-the-project’s-retrieval-contract.md`

These all restate the same architectural rule:
- overscan broadly
- filter by intent/type
- dedupe by stable identity
- rerank or fuse at the end
- treat retrieval quality as structural, not a single-model or single-pass issue

---

## 3) Policy corpus: stage-aware processing across retrieval, selection, and assembly
### `policy_corpus/_index.md`
This is the densest overview of the policy-corpus retrieval stack.

#### Retrieval and reranking
- `retrieval/_index.md` covers:
  - `hybrid_retrieval_collector_pipeline.md`
  - `reranker_gate_logic_and_a_b_evaluation.md`
- Collector pipeline stages:
  1. backends + fulltext
  2. amendment-title expansion
  3. document expansion
  4. change-notice header expansion
  5. final rerank
- `mergeMax` keeps the best hit per `sectionId`.
- `computeDocumentCoverageBoosts()` is intentionally called **twice**:
  - before expansion for title selection
  - after expansion for reranking
- Reranker gate behavior:
  - `shouldAttemptRerank()` controls reranking
  - fail-open to baseline unless gate conditions are met
  - triggers include `federal_authority`, `amendment`, `policy_variant`, HCWD income premium, and ambiguous top-hit cases
- Important evaluation note: retrieval-level A/B comparisons are misleading; answer-level evaluation is required via `scripts/eval-ab.sh` and `answer_arm()`.

#### Rerank scoring
- `rerank_scoring/_index.md`:
  - `rerankRetrievalHit` was decomposed into ~20 ordered `HitScorer` functions
  - shared `deriveHitFeatures` computes features once
  - exact floating-point behavior is contractually important
  - scoring covers policy-number boosts, federal authority routing, fee-schedule buckets, waiver handling, change-notice boosts, title penalties, and HCWD/waiver special cases

#### Document selection and routing
- `document_selection/_index.md`:
  - selection logic includes coverage boosts, title expansion, variant scoring, HCWD scoring, narrowing inferred docs
  - `selectSettingPreferredDocuments(queryLower, documents)` prioritizes documents matching the care setting named in the query
  - this must happen **before** `narrowInferredCoverageDocuments`
  - `variantReasoning` falls back to the setting preference reason when no sibling variant frame exists

- `coverage_routing/_index.md`:
  - flow: lookup documents -> infer documents from hits -> apply setting preference -> narrow -> return routing documents
  - explicit care setting preference must happen before narrowing
  - if query names a setting and titles match, only setting-matching docs are returned

- `coverage_frame_assembly/_index.md`:
  - final frame merges base hits, HCWD history hits, routed docs, and section candidates
  - evidence is split into primary / supporting / avoid
  - sibling variant frames take precedence; otherwise `settingPreference.documents` becomes `preferredRoutingDocuments`

#### Frame pipeline and authority handling
- `frame/_index.md`:
  - coverage selection is a **5-stage pipeline**
    1. score coverage sections
    2. collect/group by coverage flags
    3. build initial selection
    4. build anchors
    5. assemble final sections
  - `SectionCandidate.score` was removed; selection is positional, not score-field driven
  - strict Neo4j fixtures require handler execution checks
  - authority routing pairs statute and regulation when intent signals an authority citation
  - ordering matters: `WAIVER_AUTHORITY_HINT` must run before `WAIVER_HINT`

#### Tests and contract coverage
- `internal/_index.md`:
  - 31 Vitest tests
  - covers 11 of 12 exports from `src/internal/document-selection.ts`
  - pins behavior of `selectSettingPreferredDocuments`, `pickTopDocumentCandidates`, and related helpers
- `tests/_index.md`:
  - 30 tests across 21 pure predicates
  - hardcoded rules are preserved, including:
    - `isPriorAuthExceptionSection` uses section number `3.2.3`
    - `isAdministrativeFormTitle` excludes `"Change Notice"`
    - `isGenericSectionTitle` matches only exact titles
    - `extractTitleClusterTerms` lowercases, dedupes, removes stopwords, and keeps 4+ char tokens

**Cross-cutting policy-corpus rule:**  
Ordering is critical. Preference, narrowing, reranking, and assembly each have distinct phases and must not reuse intermediate outputs outside their intended stage.

---

## 4) Evaluation harnesses preserve behavior under controlled comparisons
### `pipeline/_index.md`
This cluster combines two related concerns:

#### Pipeline CLI package split
- `packages/pipeline/src/pipeline/cli.py` was split into a `pipeline.cli` package.
- New structure:
  - `_shared.py` for shared click/Rich setup
  - `__init__.py` as package entry
  - `__main__.py` to preserve `python -m pipeline.cli`
  - command modules: `build.py`, `references.py`, `federal.py`, `graph.py`, `eval.py`, `audit.py`
- Backward-compatible exports were retained.
- The split avoided partially initialized import problems.
- Validation: clean build, `ruff` clean, **301 passed**, **2 skipped**
- Command suite still registers **25 commands**

#### Eval A/B gate corrections
- `scripts/eval-ab.sh` now defines shared helpers:
  - `latest_run_id`
  - `summarize_metric`
  - `answer_arm`
  - `embeddings_arm`
- It dispatches to:
  - `gate_embeddings`
  - `gate_reranker`
  - `gate_verifier`
- Three gates are evaluated:
  - embeddings
  - reranker
  - verifier
- Embedding comparisons run on an **isolated AB Neo4j container** using the **same matched mixed corpus**.
- `CANDIDATE_DIMS` defaults to **1024**, matching `voyage-law-2`.
- `embeddings_arm` writes progress to stderr so stdout remains the latest run id.
- Reranker evaluation is answer-level, not retrieval-level.
- Verifier evaluation is stochastic and uses repeated answer runs with citation checks.
- Adoption rule: regression must stay within `EVAL_REGRESSION_THRESHOLD = 0.05`.

#### A/B embedding results
- `voyage-4` vs `voyage-law-2`:
  - similar quality on `precision@k` and `primary_hit_rate`
  - slightly better `MRR`
  - about **50% cheaper**
  - recommendation: adopt `voyage-4`
  - migration requires re-embedding the production corpus and updating `EMBEDDING_MODEL` and `VOYAGE_MODEL` together
- `voyage-law-2` vs `voyage-4-large`:
  - same 1024-dimensional width
  - `MRR` slightly improved, but `precision@k`, `primary_hit_rate`, and `recall@k` are flat or worse
  - same price ($0.12/M), so no cost win
  - verdict: wash
  - likely bottleneck is structural: chunking, query routing, or retrieval design

**Shared evaluation pattern:**  
controlled corpus + isolated environment + held-out metrics + regression threshold + quality/cost adoption decision

---

## 5) Cross-entry relationships
- **Crawler hardening** and **retrieval staging** both reflect a broader reliability principle: isolate mutable runtime behavior and preserve semantics while changing internals.
- **Policy corpus retrieval**, **database_operations hybrid search**, and **agent_architecture search** all converge on the same retrieval contract:
  - overscan first
  - dedupe by stable ID
  - fuse or rerank later
- **Pipeline CLI split** exists to preserve command behavior while enabling a more maintainable package structure.
- **Evaluation harness corrections** are what make the A/B results trustworthy enough to support model migration decisions.
- **Tests** across policy corpus encode contract-level rules, especially exact scoring, order of operations, and hardcoded predicate behavior.

---

## Overall takeaway
The project’s core architectural pattern is consistent:

1. **Preserve runtime semantics while isolating side effects**
2. **Prefer staged retrieval over single-pass top-k**
3. **Treat ordering and gating rules as contractual**
4. **Validate changes with isolated, repeatable A/B harnesses**
5. **Encode important behavior in tests and fixed predicates rather than informal expectations**

The entry names most useful for drill-down are:
- `Undici Redirect Interceptor Fetcher Fix`
- `Retrieval Quality / Staged Ranking`
- `Policy Corpus Structural Overview`
- `A/B Evaluation Harness and CLI Split`
- the staged-retrieval synthesis entries listed above