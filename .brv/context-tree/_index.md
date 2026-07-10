---
children_hash: 2d4cd29066e60fc08dd90f716dea9d5b086a715597a11d708af680b826b7dbd6
compression_ratio: 0.25664129978056865
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, architecture/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, packages_pipeline/_index.md, qa/_index.md]
covers_token_total: 21419
summary_level: d3
token_count: 5497
type: summary
---
# Structural Summary: agent_architecture / amendment_detection / architecture / auth_integration / database_operations / evaluation / facts / frontend_ui / packages / qa

## Cross-cutting architecture themes

These clusters describe a repository organized around a few stable system-level contracts:

- **Runtime-boundary correctness**: configuration, auth, and transport must resolve at runtime, not at build time.
- **Staged retrieval and validation**: broad candidate gathering first, then filtering, deduplication, reranking, and verification.
- **Schema-aware safety**: graph writes, retrieval outputs, and evaluation inputs are normalized before trust is assigned.
- **Durable curation**: knowledge is intentionally condensed into `.brv/context-tree` with explicit structure and verification.
- **End-to-end trust chains**: retrieval, hallucination verification, and evaluation work together rather than as isolated checks.

---

## `agent_architecture`

Core knowledge for the NC Medicaid policy agent’s architecture, operational curation, and research workflow.

### Main clusters

#### `amendment_pipeline_and_prompt`
- Focuses on NC Medicaid amendment-graph interpretation, change-summary extraction, and system-prompt guardrails.
- Drill down here for pipeline behavior, traversal heuristics, and prompt rules.

#### `context`
- Central knowledge-capture backbone for single-pass curation and durable operational notes.
- Common pattern:
  - `recon -> extraction -> dedup/group -> UPSERT curate -> verify applied file paths`
- Important structural rules:
  - prefer **single-pass** when recon says the context is small enough
  - do **not** print raw source text
  - verify via `result.applied[].filePath`
  - keep knowledge in `.brv/context-tree` with max depth 2

Key entries:
- `curated_context_*` — example of curation workflow in action
- `curated_operational_knowledge_*` — records session-level workflow metadata like `curation_mode: single-pass`
- `epsdt_exception_completeness_workstream_e.*` — durable recall for EPSDT exception completeness
- `mastra_upgrade_type_and_runtime_boundaries.md` — shared fix for Mastra upgrade boundaries
- `policy_corpus_embedding_client_and_verifier_flow.md` — embedding client plus deterministic verifier flow

#### `deep_research_workflow`
- Documents the Mastra vNext deep research pipeline.
- Core flow:
  - `plan -> plan-approval -> research -> synthesize -> verify`
- Includes HITL approval suspend/resume, parallel fan-out over sub-questions, cited markdown synthesis, and verification/rewrite behavior.
- The companion `deep_research_workflow_fixes` entry records fixes for worker stability, cancel UX, routing, and deterministic URL validation.

#### `local_dev_setup`
- Repository-level operational guidance for local development, CI, and environment management.
- Major topics:
  - local startup for Neo4j, web, and agent services
  - CI job structure and concurrency rules
  - root `.env` as source of truth
  - documentation audit conventions

#### `mastra_server_configuration`
- Preserves timeout tuning for long-running research workflows.
- Key fact: server timeout raised to **10 minutes** to support multi-step research and SSE lifecycle behavior.

#### `navigate_tools`
- Documents `getAmendments` Neo4j query behavior.
- Main mechanism: uses **OPTIONAL MATCH** plus null-row filtering to keep only meaningful amendment data.

#### `nc_medicaid_agent`
- Canonical implementation and hardening notes for the NC Medicaid Navigator agent.
- Covers startup checks, CLI runner behavior, memory payload expectations, tool usage, and anti-hallucination guidance.
- Includes runtime fixes like LibSQL storage replacing DuckDB on Railway.

#### `neo4j_tool_output_validation`
- Validates Neo4j-backed read-tool output.
- Focus: normalized numeric metadata, schema acceptance, container-heading expansion, and Zod-compatible payloads.

#### `packages_pipeline`
- Covers crawler, retrieval, and SSA parsing work.
- Major subtopics:
  - `crawler_cli_and_package_docs`
  - `crawler_source_factories`
  - `crawler_sync_behavior`
  - `retrieval_fixes`
  - `ssa_parser_subsection_splitting_fix`
- Central pattern: preserve coverage via staged retrieval and stable parsing boundaries rather than global top-k shortcuts.

#### `search_tooling`
- Canonical hybrid policy search topic.
- Combines embeddings, graph matching, reciprocal rank fusion, Neo4j indexes, and query-intent-aware search.

### Shared lesson
Many entries reinforce the same architecture rule: **runtime and environment boundaries are the common root cause of auth, deployment, and database reliability issues**. Relevant drill-downs:
- `environment-ownership-and-runtime-boundaries-are-a-common-root-cause-class.md`
- `runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md`

---

## `amendment_detection`

Graph-based DHHS amendment detection for Medicaid documentation.

### Core structure
- Purpose: detect amendment relationships, extract surrounding context, and write `AMENDS` relationships into Neo4j.
- Primary implementation: `packages/pipeline/src/pipeline/references/amendments.py`
- Flow:
  - scan documents
  - detect change notices and revised SPAs
  - extract MA/SPA references and sentence context
  - write batched `AMENDS` edges
  - mark source documents with `status="amendment"`

### Key behaviors
- Uses helper predicates like `_is_change_notice`, `_is_revised_spa`, and `_is_signal_section`.
- Sentence boundary detection was fixed so dotted MA identifiers do not split incorrectly.
- `change_description` entries are deduplicated per `(source, target)` before batch merge.
- Signal sections are preferred over fallback bodies when choosing excerpts.

### Detection patterns
- Change notices: `CHANGE NOTICE FOR MANUAL NO. ...`
- MA-series patterns: `((?:MA|DMA|DHB|DSS)-\d+)`
- SPA identifiers: `SPA\s+(\d+[\s\-]+\d+)`

---

## `architecture`

Refactoring audit and test-infrastructure knowledge.

### Core themes
- Replace duplicated imperative logic with shared canonical structures.
- Preserve behavior through differential tests, fixture hardening, and CI-aware optimization.

### Major patterns
- **Rules-as-data / table-driven refactors**
  - e.g. checklist rule tables replacing chained builder logic
- **Shared canonical helpers and types**
  - path normalization, matching helpers, and shared fixture layers
- **Behavior-preserving verification**
  - differential harnesses, green suites, and removal of temporary scaffolding after validation
- **Import-cycle and API-safety fixes**
  - guard against unsafe barrel imports and unknown reference types
- **CI and review-bot suppression for artifact-only PRs**
  - `.brv/**` and `graphify-out/**` can be skipped when appropriate, but main deploy gates remain intact
- **Shared test-fixture architecture**
  - pipeline, policy-corpus, and agent layers each own a distinct fixture responsibility
- **Fixture drift protection**
  - recording writers validate against the real `CorpusGraphWriter`

### Important stable constraints
- `CHECKLIST_LIMIT = 6`
- ordered float-score folding must not be regrouped
- deployment gating depends on commit-specific CI results
- import-path restrictions prevent barrel cycles

---

## `auth_integration`

Runtime-boundary correctness across auth, deployment, and database state.

### Core rule
- Resolve public-facing values at runtime.
- Keep a single source of truth for environment configuration.
- Treat Neo4j auth as initialization-only on first volume setup.

### Main clusters
- **Auth callback and deploy-time origin resolution**
  - callback origin is resolved dynamically
  - flow: `NEXT_PUBLIC_WORKOS_REDIRECT_URI -> WORKOS_REDIRECT_URI -> RAILWAY_PUBLIC_DOMAIN`
- **Environment ownership and synchronized runtime configuration**
  - root `.env` is the source of truth
  - app env files are symlinked to it
- **Runtime-aware UI transport and auth reinitialization**
  - chat identity expands to `threadId:resourceId`
  - transport must refresh when auth changes
- **Database initialization vs live credential updates**
  - existing Neo4j instances require live password changes, not reinitialization

### Relationship summary
- `auth_integration` provides callback-origin and `handleAuth` baseURL fixes.
- `frontend_ui` handles transport reinitialization on auth changes.
- `database_operations` defines Neo4j initialization semantics.
- `agent_architecture` contributes env-centralization rules.

---

## `database_operations`

Operational knowledge about database deployment, auth incidents, and graph-safety guarantees.

### Core themes
1. **Neo4j safety depends on schema-aware validation**
   - normalize values before validation
   - filter malformed `OPTIONAL MATCH` rows
   - validate graph outputs before search, scoring, or QA
2. **Neo4j auth on Railway is environment-sensitive**
   - Railway URL-decodes env vars
   - `NEO4J_AUTH` only applies on first volume setup
   - password rotation often requires alphanumeric-only values and bolt-proxy updates
3. **Production refresh must be targeted**
   - do not reset production destructively
   - use Railway TCP proxy, incremental ingest, and re-embedding
4. **Hybrid search is built from multiple ranked signals**
   - embeddings, concept matching, fulltext, RRF, deduplication, reranking
5. **Deployment and embedding updates support retrieval**
   - includes both destructive refresh workflows and in-place migration workflows
6. **Source selection and waiver classification shape correctness**
   - fee schedules are bucketed by normalized variant groups
   - Subpart G / H split is intentional and affects primary vs supporting evidence

### Write-path architecture
- `neo4j_write_read_consistency` describes the safe mutation boundary:
  - `connection.py` owns sessions and driver lifecycle
  - `corpus_writer.py` owns mutations
  - `get_session()` is the access choke point
  - unchanged sections retain embeddings/chunks
- Incremental cleanup and batched merges preserve idempotence and repeatability.

---

## `evaluation`

Central evaluation domain for answer quality and cross-reference resolution.

### Shared structure
- Golden entries flow into:
  - agent execution
  - Neo4j evidence lookup
  - judgment/scoring
  - aggregate metrics or cross-reference checks
- The system evaluates **grounded correctness**, not prose quality.

### Main topics

#### `answer_quality`
- Level 3 answer-quality evaluation for `ncMedicaidAgent`
- Flow:
  - golden entries
  - `_invoke_agent` over HTTP with CLI fallback
  - fetch evidence from Neo4j
  - `judge_answer`
  - build metrics
- Important rules:
  - answer extraction uses content after `---ANSWER---`
  - judge failures yield `None`
  - agent failures yield `0` with explanation
  - timeout is 180 seconds

#### `cross_reference_resolution`
- Level 2 graph relationship validation
- Resolution order:
  - document-level `REFERENCES_DOCUMENT` and `AMENDS`
  - fallback to section-level `REFERENCES`
- Tracks resolved vs missed cross-refs and computes precision/recall.

#### `pipeline_overview`
- Umbrella view tying both levels together.
- Shared dependencies:
  - mastra dev HTTP service on `localhost:4111`
  - Neo4j evidence retrieval
  - metadata such as difficulty and reasoning type

### Retrieval-model finding
- `voyage-4-large` produced only a small MRR gain and no meaningful overall improvement over `voyage-law-2`.
- Conclusion: the bottleneck appears structural, not purely embedding-model choice.

---

## `facts`

Durable standalone facts and conventions.

### `conventions`
- Standard curation workflow:
  - `recon -> extraction -> curate -> verify`
- UPSERT-first updates with `rawConcept` + `narrative`
- Key guardrails:
  - do not print raw context
  - use `mapExtract()` for chunked extraction
  - verify via `result.applied[].filePath`
  - preserve exact rules, timestamps, and file references

### `project`
- Records project-level operational decisions.
- Common thread: explicit contracts for model choice, reranking, embeddings, environment parsing, coverage scoring, dependency migrations, and tracing defaults.
- Includes:
  - fixed agent/verifier model inventory
  - verifier toggle semantics
  - eval harness constraints
  - reranker routing and removal
  - section coverage scoring
  - dependency upgrade compatibility fixes
  - Sentry defaults and host guards

### Cross-cutting pattern
The `facts` domain captures the project’s contract-like invariants: exact defaults, thresholds, file paths, and model names that must remain stable for evaluation and retrieval to stay reproducible.

---

## `frontend_ui`

Chat stability, persistence, and testing infrastructure.

### Core theme
**Thread identity, auth state, and persisted UI state must stay aligned** so chat remains stable across reloads, auth transitions, and streaming updates.

### Main topics

#### Chat page review fixes
- `packages/web/src/app/chat/page.tsx` was split into:
  - `EmptyState`
  - `MessageList`
  - `ChatInput`
  - `ResearchTrace`
- Layout centers on:
  - collapsible `ThreadSidebar`
  - main `ScrollArea`
  - conditional empty-state vs messages

#### Live UI testing without auth wall
- Two approved paths:
  - `/preview` dev-only component gallery
  - Playwright `design` project using saved WorkOS cookie + mocked backend
- Rule: do **not** add env-gated auth bypass in `proxy.ts`

#### Scroll stability
- Keep using `viewport.scrollTo` on the `ScrollArea` viewport rather than `scrollIntoView`
- Preserve sidebar visibility during message updates
- `overflow-clip` is not a replacement for `overflow-hidden`

#### Auth-bound transport reinitialization
- Chat identity expanded from `threadId` to `threadId:resourceId`
- `DefaultChatTransport` is memoized on thread/auth/token identity so auth changes force a fresh transport

#### Thread cache restoration and authenticated operations
- Cache per `threadId`
- `pendingRestore` and `useEffect` rehydrate messages after remounts
- Retry-on-401 behavior is centralized with `runWithFreshAuth(tokens, op)`

#### Message persistence, parsing, and citation behavior
- Structured Mastra thread messages are reconstructed into `UIMessage`
- `MastraMessageContentV2` is preserved on reload
- Citation styling stays quiet and semantic
- Citation resolution prefers exact labels, then dotted ancestors, then URL fallback

#### Message feedback pipeline
- Feedback spans repository, API routes, client helpers, UI actions, and chat page
- UI updates are optimistic with rollback on error

#### Sidebar fetch resilience
- Uses `AbortController`
- ignore 401s while Mastra is not ready
- recreate client when access token changes

#### Theme and proxy infrastructure
- Next.js 16 proxy migration uses `authkitProxy`
- theme persistence is cookie-first
- design system uses Document-of-Record styling with specific typefaces and themes

### Cross-cutting pattern
Runtime identity is the hidden coupling across auth, transport, caching, persistence, and message restoration.

---

## `packages`

Project-wide retrieval, crawler, pipeline, policy-corpus, and evaluation contracts.

### `crawler`
- Fetcher reliability fix for Node 26.
- Key change: private undici dispatcher inside `createFetcher()`.
- Preserves:
  - per-domain serialization
  - rate limiting
  - retry/backoff
  - file streaming
- Important rules:
  - do not rely on global dispatcher when `cheerio` is imported
  - use dispatcher-based requests with redirect interceptors
  - consume error bodies before retrying
- Outcome: forward-compatible with undici 7.

### Retrieval as a staged, intent-aware contract
A set of entries converge on one retrieval model:

- `intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md`
- `retrieval-quality-depends-on-decontamination-plus-staged-ranking.md`
- `retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md`
- `staged-retrieval-and-overscan-are-the-shared-answer-from-search-to-evaluation.md`
- `staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-.md`
- `staged-retrieval-is-the-project-s-shared-contract-from-search-to-evaluation.md`
- `staged-retrieval-is-the-project-s-shared-retrieval-contract.md`
- `staged-retrieval-is-the-project-wide-answer-to-ranking-routing-and-evaluation.md`
- `staged-retrieval-is-the-shared-answer-from-policy-search-to-evaluation.md`
- `staged-retrieval-not-global-top-k-is-the-project-s-retrieval-contract.md`

Shared retrieval sequence:
- query intent / candidate scoring
- vector overscan
- topical or type filtering
- dedupe by stable identity like `sectionId`
- group-specific ranking
- RRF or final rerank
- evaluation against grounded evidence

### `policy_corpus`
- Main structural overview for policy retrieval, reranking, coverage routing, section selection, and tests.
- Major subareas:
  - retrieval / reranking
  - coverage routing
  - document selection
  - coverage frame assembly
  - section candidate profiles
  - internal helper contracts
  - tests
  - rerank scoring
  - refactoring risk
- Dominant rule: **ordering is semantic**; routing and scoring stages must remain in sequence.

### `retrieval_quality`
- Canonical retrieval-quality flow:
  - `query intent -> candidate scoring -> vector overscan -> topical filtering -> group-specific ranking -> RRF merge`

### `pipeline`
- Covers the Python CLI package split and A/B evaluation gate corrections.
- Important facts:
  - `pipeline.cli` split preserves command suite and `python -m pipeline.cli`
  - `scripts/eval-ab.sh` gates embeddings, reranker, and verifier comparisons
  - embeddings comparisons use an isolated AB Neo4j container
  - `CANDIDATE_DIMS = 1024`
  - regression threshold is `0.05`
- Embedding outcome:
  - `voyage-4` matches quality and lowers cost, so it should be adopted
  - `voyage-4-large` is effectively a wash versus `voyage-law-2`

### Cross-cutting pattern
The packages layer treats retrieval as a staged contract, not a single top-k step. Overscan, filtering, dedupe, reranking, and evaluation are all load-bearing.

---

## `packages_pipeline`

Focused structural summary for retrieval fixes.

### Core flow
- `collectHybridHitMap`:
  1. merge enabled stage-1 backends into a section map
  2. apply fulltext recovery scoring
  3. optionally add change-notice and document-expansion hits
  4. rank/cap via `finalizeHybridHits`
- Shared merge key: `^sectionId$`

### Locked-in behavior
- Higher score wins per section; ties preserve first-merged hit.
- Unknown enabled backends are skipped silently.
- Fulltext-only hits are inserted at `midScore - 0.02 * index`.
- Without rerankers, final ranking is baseline sort descending and truncate to `topK`.
- Deterministic capping is preserved.

### Test structure
- 10 tests cover collection and finalization.
- Stage-1 backends are injected through a map; fulltext is mocked separately.

---

## `qa`

End-to-end Playwright test infrastructure and trust-pipeline coverage.

### Core scope
- Playwright config for mocked and smoke suites
- Mastra streaming and memory API mocks
- chat and thread-sidebar page objects
- Excludes non-Playwright backend implementation details

### Playwright E2E structure
- Mocked suite:
  - fast
  - 15s timeouts
- Smoke suite:
  - real integration
  - 120s timeouts
- Shared helpers:
  - `MastraStreamBuilder`
  - `mockMastraAPI`
  - `ChatPage`
- Depends on real `packages/web` dev server and `data-testid` selectors

### Trust and citation fidelity chain
The surrounding synthesis entries describe one end-to-end contract:

1. Retrieval surfaces evidence
2. Hallucination verifier rewrites or rejects unsupported output
3. Evaluation scores only grounded answers

### Hallucination verification
- Final-answer only
- Runs only when `finishReason` is `stop`
- No pending tool calls
- Uses stable machine-parsed markers:
  - `---EVIDENCE---`
  - `---VERIFIER---`
  - `---ANSWER---`
- Verification schema includes:
  - `supported`
  - `relevant`
  - `unsupportedClaims`
  - `relevanceIssues`
  - `correctedAnswer`

### Evaluation pipeline structure
- Level 3 answer scoring:
  - golden entry -> agent invocation -> Neo4j evidence fetch -> `judge_answer` -> aggregation
- Level 2 cross-reference resolution:
  - validates `REFERENCES_DOCUMENT`, bidirectional `AMENDS`, and section-level `REFERENCES`
- Shared rule: trust is enforced as a chain, not a single score.

---

## Overall drill-down map

- **Agent architecture and curation**
  - `agent_architecture/context.md`
  - `agent_architecture/deep_research_workflow/deep_research_workflow.md`
  - `agent_architecture/nc_medicaid_agent/nc_medicaid_navigator_agent.md`
- **Amendment detection**
  - `amendment_detection/context.md`
  - `amendment_detection/pipeline_detection/amendment_detection_pipeline.md`
- **Auth/runtime boundary fixes**
  - `auth_integration/context.md`
  - `auth_integration/workos_authkit_nextjs/callback_base_url_resolution.md`
- **Graph safety and retrieval**
  - `database_operations/context.md`
  - `database_operations/neo4j_hybrid_search/context.md`
  - `database_operations/neo4j_write_read_consistency/context.md`
- **Evaluation and QA**
  - `evaluation/context.md`
  - `qa/context.md`
  - `qa/hallucination_verifier/_index.md`
  - `qa/evaluation_pipeline/_index.md`
- **Retrieval and policy-corpus contracts**
  - `packages/policy_corpus/_index.md`
  - `packages/retrieval_quality/_index.md`
  - `packages/pipeline/_index.md`
- **Frontend runtime identity**
  - `frontend_ui/context.md`
  - `frontend_ui/chat_page_review_fixes/chat_page_review_fixes.md`

## Shared architectural conclusion

Across the repository, the same design discipline repeats:

- resolve identity and configuration at runtime
- preserve structured evidence through parsing and transport
- stage retrieval instead of relying on a single global top-k
- validate graph and answer outputs before trusting them
- document exact constants, file paths, and rules so behavior stays reproducible