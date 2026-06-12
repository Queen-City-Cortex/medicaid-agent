# Full-Codebase Review — Remediation Plan (2026-06-11)

## Context

A 31-agent line-by-line review covered every tracked source file (433 file assignments across crawler, pipeline, policy-corpus, agent, web, e2e, and infra), with adversarial verification where token budget allowed. Raw results:

- `2026-06-11-findings-index.txt` — one-line index of all 443 findings (25 verified-confirmed, 223 unverified at medium+, 195 low)
- `2026-06-11-findings-high-critical.txt` — full descriptions of the 2 critical and 40 high findings

Several headline findings were independently discovered by 2–3 reviewers (cross-agreement noted below). Direction set by Jeff: **fixes first, refactors staged separately; meaningful UX upgrade within the current design language.**

The big picture: the product's core promise is *trustworthy, citable answers about NC Medicaid policy*. The most serious findings are exactly the ones that break that promise — wrong statute text stored under the wrong law numbers, citations the verifier can't actually validate, an eval harness that crashes or inflates its own scores, and a chat UI that hides tool failures. Below, phases are ordered by how directly they protect answer trustworthiness.

---

## P0 — Answer integrity & security (fix before any real user touches this)

> **STATUS: ✅ Completed 2026-06-11** (commits c7f2b5b…74170f2). Remaining operational steps: re-ingest the federal slice (`ingest-ssa`, `extract-refs`, `embed`) and re-baseline the eval. The held-out eval slice (item 6) is designed but not yet built.

### 1. Federal-law ingestion is materially wrong (CRITICAL cluster)
`packages/pipeline/src/pipeline/federal/` — refs `pipeline-refs-federal:0–5`:
- **ssa_client.py:79** — `SSA_TO_USC` mapping shifted by one for SSA 1944–1947 and wrong for 1901: statute text stored under the wrong SSA section numbers (e.g. "Section 1945 health homes" returns PDMP text). *Critical.*
- **ssa_parser.py:59** — heading regex can't match `<i>l</i>`/`<i>o</i>` italics from uscode.house.gov: SSA 1913, 1916, 1916A, 2112 silently absent.
- **ssa_parser.py:75** — base-number fallback aliases unmapped USC sections onto parent SSA numbers → duplicate IDs overwrite each other in Neo4j.
- **ssa_parser.py:88** — 50K-char truncation drops 65–94% of the most-cited statutes (SSA 1902, 1905, 1915, 1917, 1919, 1927).
- **references/extractor.py:40** — regex misses `C.F.R.` (dotted, ~10K corpus occurrences) and `CFR Part N`: most federal citations never extracted.
- **references/resolver.py:143** — supersession remap fabricates section numbers across parts (45 CFR 75.326 → 2 CFR 200.326 "Bonding requirements").

**Fix:** correct the mapping table from the actual USC codification; parse headings after stripping inner tags; remove the base-number fallback (log unmapped sections instead); chunk instead of truncate (or raise limit with structure-aware splitting); extend the citation regex; restrict supersession remaps to verified section-level tables. **Then re-ingest CFR/SSA and re-run the eval.**

### 2. IDOR — cross-user thread access (CRITICAL, found by 2 reviewers)
`packages/agent/src/index.ts:229` (`xc-security:0`, `agent-core:2`): `authorizeUser()` returns `true` for any WorkOS user and `memory: {thread, resource}` is entirely client-supplied. Any authenticated user can read/write/delete any other user's threads, messages, and working memory by passing another `resourceId`. The feedback routes have the same trust model.

**Fix:** server-side middleware that derives `resourceId` from the authenticated WorkOS identity and overwrites/validates the request body on `/chat`, all memory routes, and feedback routes. Reject mismatches with 403. Add an integration test proving user A cannot read user B's thread.

### 3. Web answers run under a different (worse) regime than evals (found by 2 reviewers)
`packages/agent/src/index.ts:236` (`agent-core:1`, `xc-architecture:0`): the CLI/eval path runs `maxSteps: 99` with forced final-answer synthesis; the production `chatRoute` has neither — web users get Mastra's default 5-step limit and can receive truncated research with no synthesis. **Eval scores do not describe the product users see.**

**Fix:** pass `maxSteps` + `onIterationComplete` in `chatRoute.defaultOptions`; factor shared agent-call options into one module so CLI and web cannot drift.

### 4. Hallucination verifier breaks what it verifies
`packages/agent/src/processors/hallucination-verifier.ts` (`agent-processors:0,1`, independently `agent-tests-processors:0`, expanded by the RAG review):
- **:873** — the rewrite path replaces every text part of *every* assistant message (including prior turns and interim progress updates) with the corrected current answer.
- **:29-40, :149** — `citationLink`/`url`/`lastRevised`/`federalRegisterCite` are stripped from verifier evidence, so the verifier's own "use the real citationLink" instruction is unsatisfiable, fabricated URLs are undetectable, and revision-date claims look unsupported.
- **:444-449** — "cited-first" budget ordering keys on raw section IDs the prompt forbids in answers, so it never fires; truncation can drop exactly the sources the answer cites → false "unsupported" rewrites.
- **No per-citation check anywhere** (verifier :513-517, `judge.py:32`, `citation.py:70-71`): all layers accept a claim supported *anywhere* in evidence with *any* link attached — a factually right answer citing the wrong section passes everything. For attorneys quoting the cited § in appeals, this is the core harm model.

**Fix:** rewrite only the final text part; include all four citation fields in evidence; match "cited" sources on citationLink/`Policy N § X` strings; add per-(claim, citation) span verification against the specific cited section. Add multi-message rewrite tests (current suite masks this — `agent-tests-processors:1,2`).

### 4b. Planning processor injects pre-baked conclusions (CRITICAL — RAG review)
`packages/agent/src/processors/answer-frame-planning.ts:387-397`: keyword-matched checklists inject conclusions into a system message ("answer yes first from §X: …") without ever checking the section text says that. A novel question hitting the keywords where the true answer is "no" gets a system-prompt instruction asserting the wrong conclusion before the model reads anything.

**Fix:** never inject conclusions — restrict plan messages to ordering/avoid hints; yes/no must come from the model's reading of section text. This overlaps with the golden-dataset de-contamination work in P1 item 8.

### 5. The model is told to use fields the tools strip
- `packages/agent/src/tools/answer-frame.ts:13` (`agent-tools:0`, `xc-architecture:17`): Zod schema silently strips `lastRevised`/`federalRegisterCite` — the exact fields the system prompt instructs the model to cite for temporal questions.
- `packages/agent/src/tools/lookup.ts:9` (`agent-tools:1`): description teaches `"42 CFR 440"` but federal policy numbers are stored as `42-CFR-440` — the documented example can never match. Normalize input (strip/replace separators) and fix the description.

### 6. Eval harness reliability & honesty (your regression safety net)
`packages/pipeline/src/pipeline/eval/` (`pipeline-eval:0–2`, RAG review findings 2 & 11):
- **results.py:27** — rollup sums `None` recall/mrr → `save_result` crashes, losing entire runs.
- **reports.py:110** — report crashes on judge-error rows (all-`None` scores).
- **results.py:21** — zero-citation answers silently dropped from citation aggregates, inflating recall/primary-hit-rate.
- **answer.py:511-520** — agent infra failures scored as `hallucination: 0` ("major hallucination"), polluting trends; judge sees the golden answer while scoring hallucination (leniency bias); unified evidence makes the hallucination metric circular ("consistent with whatever was fetched").
- **Golden-dataset contamination** (RAG finding 2): retrieval heuristics and planning checklists hard-code the golden set's topics nearly one-to-one (a verifier comment even references q-006), so the 2.45 baseline measures memorized routing, not generalization.

**Fix:** treat `None` per-metric; include zero-citation answers as 0-recall rows; report judge errors as a distinct count; score agent errors as `None` + separate availability metric; hide the golden answer for the hallucination dimension; and **build a held-out/paraphrased question slice the heuristics were never tuned on — re-baseline on it before trusting any eval delta.** Backfill tests for each.

### 7. Feedback API: delete is broken end-to-end (found by 2 reviewers)
- `packages/agent/src/feedback/routes.ts:68` (`agent-core:0`, `agent-tests-rest:0`): `c.json(null, 204)` throws in Hono → DELETE always 500s. Use `c.body(null, 204)`.
- `packages/web/src/app/chat/page.tsx:364` (`web-app-lib:1`): `handleComment` discards the rotated feedback id (repository rotates id on upsert), so clear-after-comment deletes a stale id. Either stop rotating ids in `repository.ts` (preferred — stable id per (message,user)) or capture the returned id.
- Route tests use stub contexts that masked the 204 crash (`agent-core:6`, `agent-tests-rest:1`) — switch to real Hono `app.request()` tests.

**P0 verification:** `npm test` + `pytest`; re-ingest federal sources; `eval --level retrieval` and `--level answer` vs the 2026-04-17 baseline; manual IDOR probe with two WorkOS users; curl DELETE /feedback.

---

## P1 — Retrieval quality & corpus integrity

> **STATUS: ✅ Completed 2026-06-12** (commits 66babff…3bda5c1), including both P1 UX batches. Exceptions: supersession downranking in retrieval scoring (7b, partial — needs graph support for superseded status; deferred to the verifier/amendments track) and backend parallelization (item 9 latency note, deferred).

### 7b. Supersession is structurally unenforced (RAG review findings 6–7)
The product's signature risk — citing superseded policy — has no structural defense:
- `policy-corpus/src/primitives/amendments.ts:28` — null `effective_date` sorts first under `DESC`, so an undated change notice becomes `authoritativeDocument` (the prompt tells the agent to adopt it).
- No retrieval backend filters or downranks by document status/effective date; superseded sections compete equally everywhere.
- The verifier's `latest_revision_only` check fires only on the deterministic amendment lane, and only if the superseding notice is already in sources.

**Fix:** guard null dates in the authoritative-document query (and keep the base document authoritative, flagging superseded sections); carry `status`/`variantDate` into retrieval scoring; make the verifier flag any answer citing a document with no `getAmendments` evidence in sources.

### 7c. Frame prefetch/planning machinery (RAG review findings 9–10)
- `answer-frame-prefetch.ts:7-27` — `resolveAnswerFrame` force-runs on every turn including conversational follow-ups ("can you say that more simply?"), producing junk frames that the planner then converts into directive plans steering the answer off-course. Gate on question-likeness; skip injection when frame confidence is low.
- `answer-frame-planning.ts` re-implements intent detectors that already exist in policy-corpus and has drifted from them (e.g. two different `isYesNoCoverage*` regexes). Delete the duplicates; pass `QueryAnalysis.flags` through the frame result; shrink checklists to route-level guidance.

### 8. Query-intent substring landmines (systematic misrouting)
`packages/policy-corpus/src/internal/query-intent.ts` + `search.ts` (`pc-internal:0,1,2,5,6,7,10,11`):
- `queryMentionsPolicyNumber` raw containment: any query containing "9" boosts Policy 9 (:456, *high*).
- `extractSearchTerms` duplicates every token → garbage "X X" phrases on every query (:88, *high*).
- `detectAnswerQuestionType` priority: "most recent X" → amendment; "federal prior authorization" → prior-auth (:386, *high*); plus `'pa '` matching `'spa '`, `'cover'` matching "estate recovery", "minor home modifications" typed pediatric, premium/cost-sharing forced onto the numeric-only lane.

**Fix as one unit:** introduce a single tokenized matcher (word-boundary, normalized) used by all predicates; re-run eval after. This is also where the **golden-dataset overfit** lives (`pc-internal:12`, `xc-architecture:4`: hardcoded section numbers, literal answer sentences for HCWD, magic boosts) — remove the hardcoded answers, accept the eval delta honestly, and fix retrieval generically.

### 9. Retrieval backend defects
`packages/policy-corpus/src/retrieval/` (`pc-retrieval:0,1,2,3,6`):
- section-vector runs identical global ANN per type group, post-filtered — no per-group coverage, 5–8× wasted queries (*high*). Use per-group filtered vector queries (or one query + per-type quotas).
- fulltext hits floored below every backend's weakest hit — fulltext can never contribute (:170).
- policy-scoped vector half provably contributes nothing; concept backend `LIMIT 2` without `ORDER BY` is nondeterministic.
- All backends execute sequentially on one session (~27–42 round trips/search) — parallelize with a session pool.

### 10. Frame-resolution defects
- `frame/rebalance/federal-authority.ts:110` (*high*, 2 reviewers): `parseFloat` CFR range check conflates 441.5xx (Subpart K) with 441.50–62 (EPSDT) — compare as structured (part, section) tuples.
- `frame/context/finalize.ts:79` (*high*): avoid-hydration gets a fresh seen-set — same section ships as both primary and avoid.
- `primitives/concepts.ts:20` (confirmed): `findConceptSections` never matches aliases — documented lookups return empty.
- `primitives/amendments.ts:28` (confirmed): null-dated amendment sorts first (`DESC` nulls-first in Cypher) and becomes `authoritativeDocument`.

### 11. Corpus freshness/integrity (crawler + loader)
- `crawler/src/index.ts:191` (*high*): crawl re-fetches everything it just downloaded in the same run.
- `crawler/src/db/registry.ts:171` (*high*): `error`/transient-404 docs stranded forever with no retry path; 404 detection by substring (:177).
- `crawler/src/crawl/downloader.ts:31` (*high*): HTML error pages pass the magic-byte gate and are stored as `.pdf` (file-type can't detect text formats) — poisoning the corpus with soft-404s. Sniff leading bytes for HTML and reject.
- `pipeline/graph/corpus_writer.py:177` (*high*): every document load wipes embeddings/chunks for all its sections even when unchanged — defeats incremental embedding, forces full re-embeds (cost + hours). Only clear sections whose content hash changed.
- `embeddings/voyage_client.py:23` (confirmed): no retry/backoff — rate-limited batches (128 items) silently dropped; exit non-zero when `errors > 0`.
- `concepts/linker.py:17` (confirmed): "HHS" → Home Health Services across the CFR corpus; "PACE" matches the word "pace". Tighten alias matching (case-sensitive acronyms, word boundaries, per-alias minimum length).

**P1 verification:** unit suites + eval retrieval/answer levels vs baseline after each cluster; one full `run-all` on a copy of the graph to verify incremental embedding behavior.

---

## P1 — UX defect fixes (web)

All in `packages/web` — these are bugs, not redesign:

- **ScrollToBottom is dead in production** (`web-components:0`, found by 3 reviewers): effect runs before parent populates `viewportRef`, never re-runs. Restructure: have ChatPage own the viewport ref via callback ref / context, or render the button inside the ScrollArea with its own ref.
- **Scrolljacking** (`xc-ux-guidelines:1`, 3 reviewers): auto-scroll fires on every stream chunk. Track "user is at bottom" and only auto-scroll when pinned; ScrollToBottom (fixed above) covers the rest.
- **Tool failures render as eternal "Pending"** (`web-components:2` / `ToolStep.tsx:236`): handle `output-error` state, show the error.
- **Thread-switch race** (`web-app-lib:0`, *high*): stale `loadThread` response overwrites the newly selected thread. Guard with a request token / check `threadId` before `setMessages`.
- **Stream error banner has no retry** (`xc-ux-guidelines:7`): keep the failed question, offer "Try again".
- **Input disabled while streaming + no Stop control** (`xc-ux-guidelines:6`, `web-components:5`): keep textarea enabled for composing, add a Stop button (`useChat().stop`), restore focus after send.
- **Silent thread-action failures** (`web-components:13`): surface delete/rename/duplicate/export errors (toast or inline).
- **"+ New" eagerly creates empty server threads** (`xc-ux-guidelines:4`): create lazily on first message (handleSend already does this — drop `ensureThreadExists` from `handleNewThread`).
- **IME composition** (`xc-ux-guidelines:14`): check `e.nativeEvent.isComposing` before Enter-to-send.
- **Theme FOUC** (`web-app-lib:5`, `web-components:3`): inline a blocking theme script in `layout.tsx` (read cookie/localStorage pre-hydration) instead of post-hydration server action.
- **Accessibility batch** (`xc-ux-guidelines:9–12,17,18`; `web-components:10,11`): focus-trap the mobile sidebar (it sets `inert` on itself but background stays tabbable), fix `aria-live` spam on the streaming container (announce status transitions, not every chunk), add `prefers-reduced-motion` handling, fix nested-interactive in SourcesPanel trigger, selected-state semantics in ThemeToggle, AA contrast for sidebar error text, `color-scheme` for dark mode.
- **Sidebar N+1** (`xc-ux-guidelines:23`): title derivation fires `listMessages` per untitled thread (up to 50 on load) — server should store titles (it does — set at creation from first question); only fetch lazily for legacy untitled threads, or batch.
- `MessageActions` clipboard rejection handling + timer overlap (`web-components:9`); `getTrailingAssistantText` joins parts with `''` so copied answers concatenate without separators (`web-tests:5`).

---

## P2 — UX product upgrade (meaningful, within current design language)

> **STATUS: ✅ Completed 2026-06-12** (commits 75006c5, b30f50b — trust layer + presentation). Deferred: per-answer generation timestamps (no reliable createdAt on live messages yet) and "corpus current as of {date}" in the empty state (no corpus-date source plumbed to the client — inventing one would be a false trust signal).

From the product-UX review (full text: `2026-06-11-product-ux-review.md`). Per project memory, invoke the `frontend-design` skill when implementing.

**Top three (the purchase-decision items):**
1. **Make verification visible** *(critical)* — the verifier outcome currently renders as a 10px hover-only dot inside the collapsed Sources trigger, and is silently dropped when no sources parse; tooltip copy leaks internals ("Rewrite was empty…"). Build a plain-language badge row under every answer in `MessageList.tsx`: "✓ Verified against cited sources" / "⚠ Partially verified — N claims could not be matched" / prominent low-confidence callout. (`SourcesPanel.tsx` ConfidenceDot, `message-parts.ts` extractVerificationState.)
2. **Show cited policy text** *(critical)* — every source row is a bare `target="_blank"` PDF-download link; `getSection` content is discarded. Capture a ~300-char snippet per source in `addSectionSource`, render as expandable quote; split **Cited** (normalized URL appears in answer links — `buildSourceIndex` already computes this) from "Also consulted" (currently all search hits inflate the count).
3. **Human-usable output** *(high)* — Copy currently yields raw markdown; thread export is a JSON blob; printing clips to one viewport (`h-screen` + ScrollArea). Build copy-with-sources (clean text + numbered source list), a per-answer print/PDF view (question, answer, verification status, sources, date, disclaimer), Markdown thread export.

**Rest, prioritized:**
4. Stop button + retry-on-error + keep textarea enabled (overlaps P1 defect list; `useChat().stop` is unwired).
5. Collapse the post-completion tool trace into one "Research trail — N steps, M sources" collapsible *below* the answer (currently ten cards stack above it); keep live expanded view while streaming. (`MessageList.tsx`, `ToolStep.tsx`)
6. Live progress narration during runs: current step label + input summary + elapsed time (data already exists in `summarizeToolInput`/`TOOL_DESCRIPTORS`).
7. EmptyState → real first-run guidance: corpus scope + "current as of {date}", "what it can't do" (no legal advice), persona-grouped examples with jargon expanded (one example currently says "HCWD" unexplained).
8. Generation timestamps on answers ("Generated {date}") — answers age as policy changes; include in copy/print output.
9. Auto-open SourcesPanel when citations matched; render the computed-but-unused `originTool` provenance badge per source.
10. Mobile: ≥24px tap targets for citation footnotes (currently `text-[0.7em]` in `<sup>`); gate Enter-to-send on `!useIsMobile()`.
11. `whitespace-pre-wrap` on user bubbles (multi-line questions render collapsed); character counter near the 10K input limit (currently silently truncates pasted fact patterns).
12. "Try again" button inside the ended-without-answer notice; VersionNav "Answer 1 of 2" labeling + session-only caveat.

---

## P2 — CI, deploy, hygiene

> **STATUS: ✅ Completed 2026-06-12** (commit 90e9bd2). Deferred: e2e mocked tier in CI (auth.setup.ts needs live WorkOS credentials — make the mocked tier hermetic first).

- **CI gaps** (`agent-tests-rest:2`/`xc-deps-config:0`, 2 reviewers): Neo4j service provisioned but `RUN_NEO4J_INTEGRATION=1` never set and `test:integration` never run — set it and run them; add the e2e mocked suite as a CI job (`xc-deps-config:1`) — requires making auth.setup hermetic (`e2e-infra:5`, mock auth for the mocked tier); pipeline pytest runs twice (`xc-deps-config:2`); add lint coverage for agent/crawler/policy-corpus (`e2e-infra:23`).
- **Smoke suite cannot run** (`e2e-infra:0,1`, *high*): reachability probe hits auth-protected `/api/agents` (always skips), and asserts a removed `research-trace` testid. Probe `/healthz`, fix selectors.
- **Type-check tests** (`pc-core:11`, `xc-deps-config:19`): tests excluded from every tsconfig — multiple committed type errors already exist (e.g. `parseDigestsPage` missing arg working via `< undefined`). Add `tsc --noEmit` over tests per package.
- **Phantom deps** (`xc-deps-config:3,4,5`, *high*): agent imports `ai`/`@mastra/loggers` undeclared; web imports `ai` undeclared; e2e imports `dotenv` undeclared. Declare them.
- **Docs drift** (`e2e-infra:2`, *high*): RUNBOOK/.env.example/README claim Claude Haiku default; actual default is `gpt-5.4` (and `validateEnv` accepts Anthropic-only config that then crashes — `agent-core:3`). **Decide the intended default model**, align code + docs, and make `validateEnv` match reality (verifier and observational memory are hard-wired to OpenAI models — `agent-processors:4`).
- **Deploy safety** (`e2e-infra:9,10`): `deploy-data.sh` `set -e` makes its own error guard unreachable, and it wipes the production graph (`load --reset`) with no confirmation and ~30min degraded window. Add confirmation flag + staged swap (load into a scratch DB/label, then switch).
- **Docker** (`xc-deps-config:8,9`): no `.dockerignore` (host `node_modules`/`.next` shipped into build context), containers run as root. Prompt-caching beta header in `index.ts:65` is obsolete; minute-resolution timestamp at the top of the system prompt defeats provider prompt caching (`agent-core:4`) — move date below the static prompt or reduce granularity to day.
- **Repo hygiene:** tracked `.brv/` state dirs churn in git (`e2e-infra:12`); root `AGENTS.md` tracked-but-ignored; `turbo.json` missing `.next` outputs and env keys (`xc-deps-config:6`); `docker-compose` external volume breaks fresh clones (`e2e-infra:8`); root `dev` script starts agent before Neo4j is healthy (`e2e-infra:7`); no `engines` field (`xc-deps-config:15`); unused deps (`mime-types`, `pydantic`); committed-but-unused `uv.lock`.

---

## P3 — Staged refactors (separate efforts, after the above)

1. **Decompose `internal/shared.ts`** (1,681 lines, interface ≈ implementation; 2 reviewers) into ~7 focused modules; while in there, kill the recompute-per-hit rerank flags (`pc-internal:4`).
2. **Consolidate the frame layer** — one concern across 24 files / 6 dirs with pass-through layers (`xc-architecture:3`, `pc-frame-coverage:7`); fold the 14-file coverage subtree into 2–3 deep modules with boundary tests; delete inert scoring plumbing (`pc-frame-rest:3` — selection is purely positional today).
3. **Unify the retrieval backend abstraction** — 3 of 10 backends bypass it; `change_notice_header` config is dead (`xc-architecture:7`, `pc-retrieval:5`).
4. **Split ChatPage** (491-line god component: transport, cache/restore, versions, feedback CRUD, sidebar a11y, scroll — `web-app-lib:6`) into hooks; then unit-test the risky logic (currently coverage excludes `src/app` — `web-app-lib:7`).
5. **Split `policy-corpus.test.ts`** (6,651 lines, ~300 hand-rolled Cypher-text-coupled handlers) around a graph-fixture builder (`pc-tests-main:4,5`).
6. **Deduplicate the CLI verifier flow** (130 inline lines re-implementing the output processor — `xc-architecture:9`); delete dead `server.ts`, dead exports (`getCorpusCoverage`, frame resolvers on PolicyCorpus, ui/badge, ui/card, `mastraClient` compat export).
7. **Test-quality debt** from the confirmed cluster: tautological/assertion-free tests across crawler/pipeline/pc; `downloadDocument`, robots/discovery/CLI, `_assign_hierarchy`, SSA ingestion (zero coverage where the most bugs were), tool Zod schemas (stubbed to identity — `agent-tools:8`).

---

## Execution order

| Phase | Scope | Gate |
|---|---|---|
| P0 | Items 1–7 | eval ≥ baseline; IDOR test red→green; pytest+unit green |
| P1-retrieval | Items 8–11 | eval retrieval+answer vs baseline; full `run-all` on graph copy |
| P1-UX | Defect list | e2e mocked suite green (now in CI); manual Playwright pass |
| P2-UX | Product upgrade | persona walkthrough; screenshots |
| P2-infra | CI/deploy/hygiene | CI green incl. integration+e2e; clean fresh-clone `npm run dev` |
| P3 | Refactors, one at a time | eval + full suite after each |

Notes:
- The verification pass was cut short by a session token limit: 25 findings are skeptic-verified, the rest (including all criticals/highs) are single-reviewer findings with quoted code evidence, several independently duplicated. Each fix should start by confirming the finding against the code (most cite exact lines).
- Memory note: per project memory, UI/UX implementation work should invoke the `frontend-design` skill.
