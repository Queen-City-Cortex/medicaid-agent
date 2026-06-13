---
children_hash: 2a792ca9db98926ba3476088abf9151f9762ae1aa907a89ddbddf95e730b7217
compression_ratio: 0.5976707252514558
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, frontend_ui/_index.md, packages/_index.md, qa/_index.md]
covers_token_total: 9445
summary_level: d3
token_count: 5645
type: summary
---
# Structural Summary: Agent Architecture, Database, Evaluation, UI, and QA

## Domain-level picture
These entries describe the Medicaid Navigator’s end-to-end reliability stack: retrieval architecture, amendment detection, auth/runtime hardening, database safety, evaluation, frontend chat behavior, and QA enforcement. The strongest throughline is **trustworthiness through structured retrieval, schema-aware validation, and runtime-aware execution**.

## 1) Agent architecture and retrieval foundations
See **agent_architecture/_index.md** for the top-level architecture map.

- **`context/_index.md`** is the durable operational anchor for retrieval, parsing, and curation workflow patterns.
  - Preserves `hybrid policy search` as a core retrieval pattern.
  - Captures legacy fallback behavior in message parsing.
  - Defines the curation flow: `context input -> extract factual statements -> group by subject -> upsert curated knowledge`.
- **`amendment_pipeline_and_prompt/_index.md`** is the authority for amendment-graph interpretation and prompt guardrails.
  - Covers amendment pipeline behavior, traversal heuristics, system prompt rules, and preserved examples/facts.
- **`local_dev_setup/_index.md`** defines local startup and environment consolidation.
  - Root `.env` is the single source of truth.
  - `packages/agent/.env` and `packages/web/.env.local` are absolute symlinks to the root `.env`.
  - Circular symlinks were removed by recreating the real root `.env`.
- **`mastra_server_configuration/_index.md`** records server timeout tuning.
  - Timeout raised to **10 minutes** to support long-running multi-step research workflows and SSE-aware execution.
- **`navigate_tools/_index.md`** documents `getAmendments` behavior.
  - Uses `OPTIONAL MATCH`, filters null rows, maps metadata, selects authoritative documents, and applies amendment interpretation rules.
- **`neo4j_tool_output_validation/_index.md`** validates Neo4j tool outputs.
  - Focuses on numeric normalization, `Integer` conversion, Zod-compatible payloads, container-heading expansion, and structured context queries.

### Agent runtime cluster
See **agent_architecture/nc_medicaid_agent/_index.md** for the runtime hardening and deployment cluster.

- **`startup_and_web_ui_hardening.md`**: env validation, startup checks, Mastra config, route constraints, CLI behavior, and anti-hallucination prompt rules.
- **`cli_runner.md`**: CLI execution semantics.
  - Step iteration behavior
  - Memory payload requirements
  - `cli-${Date.now()}` thread behavior
  - `onIterationComplete` synthesis guardrail for `MAX_STEPS`
  - `closeDriver()` cleanup
- **`libsql_storage_fix_for_railway.md`**: Railway deployment fix.
  - Replaced DuckDB / `MastraCompositeStore` with `LibSQLStore`
  - Avoids Alpine/musl native binding crashes
  - Canonical files: `packages/agent/src/index.ts`, `packages/agent/package.json`
- **`ssa_and_cfr_reference_resolution_fixes.md`**: citation and ingestion fixes.
  - SSA-to-USC mappings, including `SSA 1944 -> USC 1396w-3a`
  - Parser robustness for italicized USC section headings
  - Full section text preserved by removing the 50K truncation cap
  - CFR matching for `C.F.R.` and `Part X` forms
  - Part-level-only supersession redirects
  - Re-ingestion flow: `ingest-ssa --refresh -> extract-refs -> embed`
- **`nc_medicaid_navigator_agent.md`**: agent-level prompt and metadata guidance.
  - `source_url` support for clickable citations
  - startup/model/storage/memory/server configuration
  - tool taxonomy
  - amendment verification
  - anti-hallucination rules
  - required response-format rules

### Retrieval pipeline behavior
See **agent_architecture/packages_pipeline/_index.md** and **agent_architecture/search_tooling/_index.md**.

- **`packages_pipeline/_index.md`** emphasizes backend retrieval mechanics and pipeline safety.
  - Neo4j vector retrieval requires **per-group overscan** because `queryNodes(k)` returns global top-k.
  - Hybrid merging dedupes and reranks by `sectionId`.
  - Crawler sync behavior is split into download and check phases to avoid duplicate work and premature deletion.
- **`crawler_sync_behavior/_index.md`**
  - Key flow: `SyncStats`, `SyncContext`, `applyResult`, `processDocuments`, `runDownloadPhase`, `runCheckPhase`
  - `skipIds` carries processed IDs between phases
  - 404s only trigger removal after thresholding; default threshold is **3 consecutive 404s**
  - HTML payloads are rejected for binary-only families
  - `better-sqlite3` 12 is required for Node 26
- **`retrieval_fixes/_index.md`**
  - Core files: `packages/policy-corpus/src/retrieval/backends/section-vector.ts`, `packages/policy-corpus/src/retrieval/collector.ts`
  - Pattern: `vectorScanK(profile.perGroupK)` overscan per type group, then filter by `document_type`
  - Merge hits by `sectionId`, include fulltext and expansion hits, rerank, then take final `topK`
  - Retrieval order: overscan first, filter later
- **`search_tooling/_index.md`**
  - Authoritative topic for hybrid policy search
  - Uses Voyage embeddings, per-type-group vector search, concept graph matching, Reciprocal Rank Fusion, and Neo4j indexes
  - Covers `searchSections` flow, rules, and facts

### Cross-entry relationships
- `context/_index.md` is the operational anchor across retrieval, parsing, and curation.
- `amendment_pipeline_and_prompt/_index.md` and `navigate_tools/_index.md` split amendment handling between prompt/pipeline guardrails and tool-level Neo4j behavior.
- `local_dev_setup/_index.md`, `mastra_server_configuration/_index.md`, and `nc_medicaid_agent/_index.md` together define runtime readiness.
- `packages_pipeline/_index.md` and `search_tooling/_index.md` both describe retrieval architecture, but at different layers:
  - backend mechanics vs user-facing hybrid search surface
- `neo4j_tool_output_validation/_index.md` supports the retrieval stack by enforcing output shape and numeric normalization.

---

## 2) Amendment detection
See **amendment_detection/_index.md** and its drill-down entry **pipeline_detection/_index.md**.

- Domain purpose: detect DHHS amendment relationships, extract surrounding context, and write `AMENDS` edges into Neo4j.
- Primary implementation: `packages/pipeline/src/pipeline/references/amendments.py`, especially `detect_amendments()`.
- Core flow:
  - scan documents for amendment-relevant sources
  - detect change notices and revised SPAs
  - extract MA/SPA references and sentence-level context
  - create batched `AMENDS` edges
  - update source documents to `status="amendment"`
- Important behaviors:
  - helper predicates: `_is_change_notice`, `_is_revised_spa`, `_is_signal_section`, `_is_sentence_boundary`
  - batching and graph writes rely on `GRAPH_BATCH_SIZE`, `get_session`, `queries`, `chunked`, and `Console`
  - sentence boundary logic was fixed so periods inside MA identifiers do not split sentences incorrectly
  - `_extract_context` preserves full sentences even with dotted MA numbers like `MA-2180.IV.I`
  - `change_description` entries are deduplicated per `(source, target)` before `MERGE_AMENDS_BATCH`
  - signal sections are preferred over fallback bodies
- Detection patterns:
  - titles like `CHANGE NOTICE FOR MANUAL NO. ...`
  - MA-series numbers: `((?:MA|DMA|DHB|DSS)-\d+)`
  - SPA identifiers: `SPA\s+(\d+[\s\-]+\d+)`

---

## 3) Database operations and Neo4j safety
See **database_operations/_index.md**.

- Domain focus: database deployment quirks, authentication incidents, and Neo4j reliability.
- Two major themes:
  - **Database auth and deployment quirks**
    - Environment-driven failures and password lifecycle behavior in deployed Neo4j instances
    - `NEO4J_AUTH` only initializes credentials on first volume setup; it does not update existing databases
    - Existing instances require live password changes through the bolt proxy using `ALTER CURRENT USER SET PASSWORD`
  - **Schema-aware Neo4j safety**
    - Data is normalized and filtered before validation, search, or scoring
    - Protects downstream consumers from malformed rows, null relationships, and inconsistent payloads
- Hybrid search design:
  - retrieval combines vector, chunk, concept, and keyword signals
  - depends on `section_embeddings`, `chunk_embeddings`, and `section_fulltext`
  - results are deduplicated by `section_id` and fused with Reciprocal Rank Fusion using `RRF_K = 60`
- Shared safety net:
  - numeric normalization before Zod validation
  - `OPTIONAL MATCH` results filtered before schema checks
  - guarded Cypher execution and relationship whitelisting
  - validated graph outputs used by QA and evaluation

---

## 4) Evaluation pipeline
See **evaluation/_index.md** and its drill-down entries:
- **`answer_quality/_index.md`**
- **`cross_reference_resolution/_index.md`**
- **`pipeline_overview/_index.md`**

### Shared structure
- Common flow: golden entries → agent invocation → Neo4j evidence retrieval → judge/scoring logic → per-entry metrics or cross-reference checks → aggregate updates.
- Main implementation:
  - `packages/pipeline/src/pipeline/eval/levels/answer.py`
  - `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`

### Answer quality evaluation
- Uses `_invoke_agent` with HTTP first and CLI fallback.
- HTTP path uses `HTTPX` and supports `OPENAI_API_KEY` and `AGENT_MODEL`.
- CLI path uses `subprocess`, times out after **180 seconds**, and fails on non-zero exit codes.
- Evidence is retrieved from Neo4j for primary and supporting sections before scoring.
- Scoring is delegated to `judge_answer`.
- Judge errors yield `None` scores and are excluded from aggregates.
- Agent errors yield zero scores and include the agent error in the explanation.
- `primary_hit` is true when overall score is at least 2, when available.

### Cross-reference resolution evaluation
- Validates golden entries against Neo4j relationships.
- Checks document-level edges first:
  - `REFERENCES_DOCUMENT`
  - `AMENDS`
- Falls back to section-level edges:
  - `HAS_SECTION`
  - `REFERENCES`
- Metrics track resolved vs missed cross-refs; precision/recall use `resolved_count / total_cross_refs`.
- Missing document IDs count as missed without graph lookup.
- Coverage improved from `0/5` to `2/5`, but `q-004`, `q-009`, and `q-020` still fail due to missing reference extraction coverage.

### Evaluation pipeline overview
- Confirms the shared pipeline shape across answer scoring and cross-reference checks.
- Reinforces the 180-second timeout and immediate CLI failure behavior.
- Notes that judge errors now use `None`, preventing aggregate contamination.

---

## 5) Frontend UI behavior
See **frontend_ui/_index.md**.

### Chat page structure and refinements
- The chat page was decomposed from `packages/web/src/app/chat/page.tsx` into:
  - `EmptyState`
  - `MessageList`
  - `ChatInput`
- `ResearchTrace` centralizes policy-tool trace/status rendering with reasoning entries.
- Layout:
  - flex container
  - collapsible `ThreadSidebar`
  - main `ScrollArea`
  - auth/loading handling at the top
- UI refinements:
  - softened sidebar styling
  - accessible thread buttons
  - confirmation-gated deletion
  - CSS `line-clamp` title truncation
  - Lucide icon replacement
  - auth loading skeleton
- Shared styling comes from `globals.css` with oklch palettes and scrollbar rules.

### Scroll behavior and viewport stability
- Scrolling uses viewport-targeted `scrollTo` on `data-slot="scroll-area-viewport"` instead of `scrollIntoView`.
- `min-h-0` was added to the main `ScrollArea` container so flex children can shrink correctly.
- Focus jumps are suppressed with `preventScroll: true`.
- `overflow-clip` does not replace `overflow-hidden` because it does not create a formatting context.
- The sidebar displacement bug was traced to `scrollIntoView` climbing to the layout root; the fix confines scrolling to the conversation viewport.

### Thread identity, transport, and cache restoration
- `useChat` identity expanded from `threadId` to `threadId:resourceId`.
- `resourceId` defaults to `anonymous` until auth resolves.
- `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`.
- The thread cache uses a `messageCache` map keyed by `threadId`.
- On thread selection, cached messages are restored via `pendingRestore` after the new `useChat` instance mounts.
- This avoids writing restored messages into a stale hook instance.

### Streaming, persistence, and message reconstruction
- `AISdkStreamBuilder` replaces `MastraStreamBuilder` for deterministic SSE test payloads.
- `mockMastraAPI` centralizes Mastra chat and memory endpoint routing.
- `ChatPage` uses `useChat`, `useAuth`, `useAccessToken`, `useMastraClient`, `useIsMobile`, `generateUUID`, and `convertThreadMessageToUIMessage`.
- The UI enforces a 10k-character input limit and reuses user text for reruns.
- Persisted messages prefer `MastraMessageContentV2` plus `convertV4PartsToV5`; legacy text falls back to `extractText`.
- Tool invocation states are normalized for `ResearchTrace`.
- `extractText` preserves paragraph spacing with `\n\n`.
- The message cache also protects against asynchronous `savePerStep` persistence races.

### Feedback, auth, and client coupling
- `FeedbackRepository` wraps `@libsql/client`, lazily creates the `feedback` table, and enforces `UNIQUE(message_id, resource_id)` with `up` / `down` validation.
- `packages/web/src/lib/feedback-client.ts` provides `submitFeedback`, `deleteFeedback`, and `getFeedbackByThread` with Bearer auth and `credentials: include`.
- The chat UI hydrates feedback into `feedbackMap` and uses optimistic updates with rollback.
- `registerApiRoute` paths must not begin with `/api/`, and `getResourceId` must resolve `user.userId` or `user.id`.
- Next.js 16 moved middleware responsibilities to `proxy.ts`; the proxy forwards `NextRequest` to `authkitProxy` with `middlewareAuth` enabled and exempts only `/auth/callback`.
- Static assets and metadata paths are excluded from the proxy matcher.

### Thread sidebar resilience
- Sidebar includes `+ New`, thread list, loading/error states, rename/delete flows, and a signed-in footer with sign-out.
- Thread fetches are gated by `useMastraReady` and `useMastraClient`, then loaded via `listMemoryThreads` with an `AbortController`.
- Threads are sorted by `updatedAt`.
- `401` from `listMemoryThreads` is non-fatal while `useMastraReady` is false; the sidebar retries once auth is ready.
- A new `mastraClient` is recreated when the access token changes.
- Fixed agent ID for memory thread calls: `nc-medicaid-navigator`.

### Key drill-down entries
- `chat_page_review_fixes`
- `chat_page_scroll_stability`
- `scroll_area_sidebar_stability`
- `chat_page_thread_cache`
- `chat_page_transport`
- `chat_streaming_error_handling`
- `message_persistence_parsing`
- `message_persistence_cache`
- `message_feedback`
- `proxy_handling`
- `thread_sidebar`

---

## 6) Policy corpus retrieval and decontamination
See **packages/_index.md**.

### Coverage selection and graph fixtures
- Coverage assembly is **positional rather than score-field driven**; `SectionCandidate.score` was removed.
- Exported stages:
  1. `scoreCoverageSections`
  2. `collectCoverageSectionGroups`
  3. `buildCoverageInitialSelection`
  4. `buildCoverageAnchors`
  5. `assembleCoverageSections`
- Flow: candidates → coverage scoring/grouping → initial selection → anchors → merge primary/supporting/avoid sections.
- Key heuristics:
  - HCWD income premium scoring with current-document bonus for policy number `MA-2180`
  - penalties for amendments, administrative forms, year-specific premiums, and HCWD process titles
  - grouping for general eligibility, coverage scope, and congregate PCS
  - telehealth prioritization and demotion rules
  - anchor-based reshaping for not-covered and yes/no coverage queries
  - supporting-selection rebalance when anchors are present
- Avoid sections include demoted telehealth tables/context, ambulance general exclusions, congregate workflow sections, and general-eligibility administrative or limitation sections.
- Collector uses a documented **5-stage merge pipeline**.
- The federal collector scans `federal regulation` and `federal statute` together, which can hide per-`docType` coverage gaps.
- Strict graph-fixture helpers enforce:
  - strict records on missing field access
  - `expectAllHandlersUsed()`
  - failure on extra scripted queries unless `allowExtraQueries` is set
  - `createCorpus` match-based handlers
  - `createCorpusWithRuns` ordered scripted runs
- Builder/matcher set includes:
  - `sectionHit`
  - `sectionRecord`
  - `documentRecord`
  - `amendmentRecord`
  - `containerChildrenRecord`
  - `contextEntryRecord`
  - `referenceRecord`
  - `queries.*` matchers for vector, fulltext, concept, document, amendment, and section hydration
- Current direction favors explicit, strict, inspectable coverage assembly over implicit scoring state.

### De-contamination and canonical retrieval constants
- HCWD limit-history terms were replaced with **HCWD income-rule terms**.
- The `01-14` change-notice bonus was removed from HCWD history retrieval.
- The hardcoded `5.4.3` prior-auth quantity-detection heuristic was removed.
- `WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS` remains legitimate HCBS domain knowledge.
- Retrieval flow:
  - query intent
  - candidate scoring
  - vector overscan
  - topical filtering
  - group-specific ranking
- Neo4j `queryNodes(k)` returns a global top-k, so per-group coverage requires overscanning before filtering.
- Canonical constants:
  - `VECTOR_OVERSCAN_FACTOR = 8`
  - `VECTOR_OVERSCAN_MAX = 200`
  - `MAX_CONTENT_CHARS = 6000`
  - `MAX_COMBINED_CHARS = 6000`
  - `FRAME_PRIMARY_LIMIT = 4`
  - `FRAME_SUPPORT_LIMIT = 4`
  - `FRAME_AVOID_LIMIT = 3`
  - `FRAME_DOCUMENT_LIMIT = 3`

---

## 7) QA, trust, and end-to-end enforcement
See **qa/_index.md**.

- Domain scope: Playwright E2E infrastructure, hallucination verification, and evaluation pipelines that keep retrieval, citations, and final answers aligned with Neo4j evidence.
- Owned by the **QA/Automation Team**.
- Excludes unit/integration tests outside Playwright and backend implementation details outside verifier/evaluation contracts.

### Structural pillars

#### End-to-end citation fidelity
Reference: `end-to-end-citation-fidelity-is-enforced-from-retrieval-to-evaluation.md`
- Citation fidelity is treated as an end-to-end contract across:
  - agent retrieval and amendment lookup
  - evaluation scoring against Neo4j section evidence
  - hallucination verification and answer rewriting
- The agent enforces tool-first policy lookup and citation duties.
- Evaluation fetches section text and cross-reference evidence.
- The verifier rejects or rewrites unsupported output.

#### Evaluation pipeline
Reference: `evaluation_pipeline/_index.md`
- Two coordinated layers:
  - Level 3 answer evaluation
  - Level 2 cross-reference evaluation
- Core flow:
  - question → agent invocation → evidence retrieval → judge scoring
  - entry → cross-reference iteration → document/section graph checks → metrics
- Important behaviors:
  - HTTP-first agent invocation with CLI fallback
  - Neo4j section text as primary evidence source
  - judge errors excluded from aggregation
  - cross-reference resolution supports `REFERENCES_DOCUMENT`, `AMENDS`, and section-level `REFERENCES` fallback
- Dataset context:
  - held-out paraphrase IDs `h-001..h-050`
  - schema IDs match `^(q|h)-\\d+$`
  - SSA ingestion uses explicit SSA↔USC mapping and must not infer membership from section numbering alone

#### Hallucination verification
Reference: `hallucination_verifier/_index.md`
- Split into:
  - `hallucination_verifier_processor.md`
  - `cli_verifier_flow_and_stdout_contract.md`
- Shared design:
  - verify only the final assistant response
  - assemble source text from `getSection`, `getDocument`, `getAmendments`, `lookupPolicy`, `followReferences`
  - prioritize cited sources, cap source text, and signal truncation
  - apply `correctedAnswer` immediately when unsupported or irrelevant
- CLI/runtime contract:
  - stdout markers: `---EVIDENCE---`, `---VERIFIER---`, `---ANSWER---`
  - exact snake_case JSON fields required for eval parsing
  - confidence is clamped and banded into high/medium/low
  - verifier toggles and model defaults are controlled by environment settings

#### Launch blockers and remediation
Reference: `launch_blockers/_index.md`
- Tracks release-blocking fixes and staged remediation.
- Main themes:
  - middleware/proxy alignment with Next.js 16
  - concept relationship validation and null handling
  - verifier hardening for source formatting, truncation, and failure sentinels
  - search test expansion for deduplication, topK, truncation, and embedding failures
- Remediation emphasizes trustworthiness, citation fidelity, hallucination prevention, and evaluation honesty.
- Staged P0–P3 work includes completed P0 remediation and later phases completed on 2026-06-12.
- Trust-layer UX upgrades include verification badges, cited/consulted split, clipboard footnotes, Markdown export, and print CSS.

#### Playwright E2E infrastructure
Reference: `playwright_e2e/_index.md`
- Covers Playwright-based end-to-end testing under `e2e/`.
- Architecture centers on:
  - shared Playwright config
  - reusable Mastra streaming and API-mocking helpers
  - `ChatPage` abstraction for chat and sidebar flow
- Test split:
  - mocked suites: fast, 15s timeouts, desktop Chrome
  - smoke suites: real agent integration, 120s timeouts
- Key helper responsibilities:
  - `MastraStreamBuilder` creates Mastra-compliant SSE streams ending in `[DONE]`
  - `mockMastraAPI(page, ...)` intercepts agent and memory endpoints before navigating to `/chat`
  - `ChatPage` centralizes selectors, message sending, reply waiting, trace lookup, and thread sidebar interactions
- Dependencies:
  - `npm run dev` from `../packages/web`
  - Mastra client SSE parsing
  - `data-testid` selectors in the chat UI

### Cross-entry relationships
- `evaluation_pipeline/_index.md` and `end-to-end-citation-fidelity-is-enforced-from-retrieval-to-evaluation.md` both treat Neo4j evidence and cross-reference integrity as part of answer trust.
- `hallucination_verifier/_index.md` complements evaluation by rewriting unsupported final answers rather than only scoring them.
- `launch_blockers/_index.md` shows the trust/citation hardening work that supports the same quality goals.
- `playwright_e2e/_index.md` provides the UI-level harness used to validate chat behavior, streaming, and message persistence.