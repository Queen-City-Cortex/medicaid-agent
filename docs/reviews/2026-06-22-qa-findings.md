# QA Findings — NC Medicaid Navigator (2026-06-22)

Full-cycle QA pass against the **live** stack (Neo4j graph loaded, real agent on :4111, Next.js web on :3000, real WorkOS auth). Method: inventory → acceptance criteria/edge cases → automated suites + real-user browser testing → triage → fix. Companion artifacts: `2026-06-22-qa-inventory.md` (142-item test plan), screenshots under `e2e/design-shots/qa/`.

## Environment baseline (committed state)

| Gate | Result |
|---|---|
| typecheck:tests (turbo) | ✅ |
| lint (eslint + ruff + vulture) | ✅ |
| build (incl. Next.js prod build) | ✅ |
| unit: crawler / policy-corpus / agent / web | ✅ 206 / 239 / 215(+9 skipped) / 234 |
| pipeline pytest | ✅ 305 (+2 skipped) |
| Neo4j integration (`RUN_NEO4J_INTEGRATION=1`) | ✅ 9/9 against live graph |

All automated gates green on the committed tree. The 31-agent 2026-06-11 review's P0–P3 fixes are reflected.

---

## Confirmed bugs

### F-CITE-001 — Inline citation footnotes collapse all sections of one policy PDF to a single (wrong) source number  ·  severity: HIGH

**Where:** `packages/web/src/lib/message-parts.ts` — `buildSourceIndex` (L209) and `extractCitedUrls` (L490) key on normalized URL only; `addSectionSource` (L340) keys Sources-panel rows on `url|policy|sectionNumber`. The two granularities disagree.

**Repro (live):** Ask "Does NC Medicaid cover chiropractic services, and are there visit limits?" The answer cites Policy 1F § 3.2.1, § 4.1, § 4.2.1, § 5.6 (Visit Limits), and a Change Notice. All NC clinical-policy sections share one PDF download URL (`…/1f-chiropractic-services/download?attachment`).

**Observed:** Every inline footnote for those distinct sections renders as **[1]** and "Jump to source 1", while the Sources panel correctly lists them as separate rows (§ 3.2.1 = #2, § 4.1 = #3, § 5.6 = #5). Source #1 is § 2.2.1 (EPSDT). So the "[1]" next to a *visit-limits* claim scrolls/highlights the *EPSDT* row — the wrong section. Evidence: `e2e/design-shots/qa/chat-answer-chiropractic.png` + a11y snapshot (multiple "Jump to source 1" buttons on different sections).

**User impact:** The core verification affordance ("click the citation to read the exact cited section") misroutes on the most common NC Medicaid answer shape (multiple sections of one policy PDF). Also every citation visually reads "[1]", which is confusing. The Sources panel itself is section-accurate; only the inline-link→row linkage is broken.

**Fix approach:** Resolve inline citations to source rows at the same (policy, section) granularity as the rows, not by URL. The markdown `<a>` renderer in `MessageList.tsx` has the link label text (e.g. "Policy 1F § 5.6") — parse policy+section from it and match to the row, with URL as fallback for doc-level links. Update `buildSourceIndex`/clipboard to match. Regression test: a message citing two sections of the same PDF must produce footnotes [n] and [m] (n≠m) that map to the matching rows.

---

### F-AUTH-001 — Thread operations 401 after the access token expires (stale token baked into the memoized MastraClient)  ·  severity: MEDIUM-HIGH

**Where:** `packages/web/src/lib/use-mastra-client.ts` (L13-16) memoizes `createMastraClient(accessToken)` on the *value* of the WorkOS access token; `packages/web/src/lib/mastra-client.ts` bakes it into a static `Authorization` header. `ThreadSidebar.tsx` uses this client for list/clone/rename/delete; `useChatThread`'s `ensureThreadExists`/`loadThread` use it too. By contrast, the chat-send transport (`use-chat-thread.ts` L93-95) fetches a **fresh** token per request via `getAccessToken()`.

**Repro (live):** Log in, run a query, then idle ~5+ min (until the WorkOS access token expires). Click a thread's ⋯ → Duplicate. **Observed:** sidebar shows "Failed to duplicate thread"; console: `MastraClientError: HTTP error! status: 401 - {"error":"Invalid or expired token"}` on `POST /api/memory/threads/{id}/clone`. Background `GET /threads` also 401'd. After a page **reload** (fresh token), the identical Duplicate **succeeds** (verified — "(copy)" thread created), and Delete + the confirm modal also work — proving the endpoints are fine and the cause is the stale token.

**User impact:** A real user who leaves the tab open and returns finds Duplicate/Rename/Delete (and thread loads) silently failing with a generic error and no recovery path (the only "Retry" is on the list fetch, not the mutation). Sending a chat message still works (it refreshes the token), which masks the problem. `handleDuplicate/handleRename/handleDelete` have no refresh-and-retry; `fetchThreads` only special-cases 401 when `!ready`.

**Fix approach (coherent):** Make every memory/thread call use a fresh token like the chat transport does. Preferred: construct the MastraClient (or its `Authorization` header) from a per-request token getter rather than a render-time snapshot — e.g. pass `getAccessToken` down and have `createMastraClient` accept an async header provider, or wrap mutating calls to fetch a fresh token + retry once on 401. Regression test: simulate an expired-token 401 on the first clone/rename/delete call and assert the client refreshes the token and retries (succeeds) instead of surfacing "Failed to…".

### F-RESTORE-001 — Restored threads render with degraded fidelity (no inline footnotes, no verification badge, tool cards un-collapsed)  ·  severity: MEDIUM

**Where:** `packages/web/src/lib/parse-message.ts` (`convertThreadMessageToUIMessage` / V4→V5 part reconstruction) → consumed by `MessageList.tsx`.

**Repro (live):** Ask a question, get a full answer (Research trail collapsed, inline citation footnotes, verification badge, "9 cited · 1 consulted"). Reload / re-open that thread from the sidebar.

**Observed:** the same answer comes back **degraded** — 10 tool-step cards stacked **inline** (no "Research trail" collapse), **0 inline citation footnotes**, **no verification badge**, and a smaller "4 sources" (no Cited/Also-consulted split). Cause: on restore `getTrailingAssistantText(msg)` is empty (the final answer text isn't reconstructed *after* the last tool part), so `collapseTrail` and `finalAnswer` are both false → footnotes are gated off and the trail doesn't collapse; the verifier `data-verification-*` parts aren't reconstructed either. Independent of F-CITE-001 (old URL logic also rendered 0 footnotes here, because finalAnswer gating happens first).

**User impact:** Every returning user sees their past answers in the pre-redesign, un-verifiable layout — the trust signals (verification badge, clickable citations) that the product is built around are absent on reload. In-session answers are correct; only restored ones regress.

**Note — test blind spot:** the mocked e2e `feedback.spec.ts` uses a hand-authored V2 message whose final text *is* after the tool part, so it collapses correctly and the suite is green — i.e. the mock fixture does not reproduce the real persisted ordering. A faithful fixture (final answer not trailing; verification parts present) is needed to catch this in CI.

**Fix approach (handoff):** in `convertThreadMessageToUIMessage`, preserve original part ordering so the synthesized answer text is the trailing text part, and reconstruct the verifier `data-verification-*` parts (or persist/restore the verification summary) so `extractVerificationState` works on restore. Add an e2e fixture mirroring the real persisted shape.

## Confirmed test debt (single root cause)

### F-E2E-001 — Mocked Playwright e2e suite has rotted (4 stale tests) because the tier is excluded from CI  ·  severity: MEDIUM (test integrity)

Running `npx playwright test --project=mocked` (live WorkOS auth setup succeeded): **24 passed, 4 failed**. All 4 failures are *stale assertions* that never updated after the shipped P2 UX redesign — the UI is correct; the tests encode the old behavior. Root cause: the mocked tier is the documented "deferred" P2-infra item (not hermetic → excluded from CI → silently drifted).

| Test | Stale assumption | Shipped (correct) behavior |
|---|---|---|
| `empty-state.spec.ts:19` renders 3 example cards | expects 3, first contains "NC Medicaid" | `EmptyState` shows **6** persona-grouped cards; first is the 42 CFR Part 431 notice question |
| `tool-calls.spec.ts:7` research trace shows 2 tool-steps | expects `tool-step` ×2 visible after completion | `collapseTrail` (MessageList L193) collapses steps into a closed "Research trail" Collapsible → unmounted until expanded |
| `feedback.spec.ts:88` research trace on reload | expects "Searching policies" visible | same collapsed-trail behavior on restored threads |
| `tool-calls.spec.ts:111` footnote opens panel, source-item count 0 initially | expects panel starts collapsed | `panelOpen = override ?? citedCount>0` (L206) auto-opens when the answer cites a source (intended P2 item 9) |

**Fix approach:** Update the 4 tests to assert the shipped behavior (expand the Research trail before counting steps; expect 6 cards; expect auto-open panel). Then make the mocked tier hermetic (mock auth for the mocked project) so it can run in CI and stop rotting. Smoke `chat-roundtrip.spec.ts:40` shares the post-completion `tool-step` assumption and should be reviewed the same way.

---

## Notes / product observations (not UI defects)

- **N-OBS-001:** The featured *beneficiary* example question "Does NC Medicaid cover chiropractic services?" returns a **Low-confidence** answer (verifier: "6 unsupported claims"). The trust UI surfaces this correctly (prominent amber/red badge), but a featured first-run example reliably yielding low confidence is a first-impression/trust concern for the content/eval track (separate from the documented 2.82 eval baseline).

---

## Fixes implemented this pass (with regression tests)

| ID | Fix | Files | Test |
|---|---|---|---|
| **F-CITE-001** | 3-tier `buildCitationResolver`: (1) exact section **label** match, (2) deepest same-policy **ancestor** row (cited § 5.2.1 → retrieved § 5.2), (3) URL fallback — sections of one PDF no longer collapse to one footnote. **Verified live**: a real answer citing 7 sections of Policy 3G-1 went from all-[1] to 5 distinct, correct footnotes. | `message-parts.ts` (new `buildCitationResolver`), `MessageList.tsx`, `buildAnswerClipboardText` | `message-parts.test.ts` → `buildCitationResolver` (distinct-numbers + ancestor-fallback + URL-fallback cases) |
| **G2** | Centralized the 4 duplicate `MASTRA_URL` definitions into `lib/mastra-url.ts`; loud console error if a prod browser bundle is missing `NEXT_PUBLIC_MASTRA_URL` (warn, not throw — local prod build relies on the fallback). | `mastra-url.ts` (new), `mastra-client.ts`, `use-chat-thread.ts`, `use-feedback.ts`, `use-corpus-status.ts` | covered by existing suites (typecheck + build) |
| **G4** | Restore the user's typed question if a send fails (was cleared before the await). | `chat/page.tsx` `handleSend` | (manual; low-risk try/catch) |
| **G1 (slice)** | Reset Deep Research mode on thread switch and on toggle-off, so picking a past chat always returns to chat view. | `chat/page.tsx` (`onThreadSwitch`, `toggleDeepResearch`) | (deeper controller hardening deferred — see handoff) |
| **F-E2E-001** | Updated 4 stale mocked tests + 1 smoke selector to assert the shipped P2 behavior (6 persona cards; expand Research trail before counting steps; Sources panel auto-opens). | `e2e/tests/mocked/{empty-state,tool-calls,feedback}.spec.ts`, `e2e/tests/smoke/chat-roundtrip.spec.ts` | the e2e tests themselves |
| **F-AUTH-001** | New `runWithFreshAuth` primitive (fetch fresh token per op; force `refresh()` + retry once on 401) + stable `useMastraClientRunner` hook. **Full sweep:** every memory/thread op now goes through it — `ThreadSidebar` (list/derive-titles/delete/rename/duplicate/export), `useChatThread` (`loadThread`/`ensureThreadExists`), and `useDeepResearch` (start + **resume re-attaches by stored `runId`** with a fresh-token client, so a suspended run survives the token expiring during the plan-approval gate). `chat/page.tsx` drops the snapshot client entirely (`useMastraClient` → `useMastraClientRunner`). **Verified live**: duplicate succeeds end-to-end. | `mastra-client.ts`, `use-mastra-client.ts`, `ThreadSidebar.tsx`, `use-chat-thread.ts`, `use-deep-research.ts`, `chat/page.tsx` | `mastra-client.test.ts` (happy/401-retry/non-401/persistent-401) + `use-deep-research.test.ts` (runId re-attach on resume) + updated `ThreadSidebar`/`use-chat-thread`/`ChatPage` test mocks |

## Prioritized handoff — confirmed-but-not-fixed (full detail in `2026-06-22-qa-triage-synthesis.md`)

The verification pass confirmed **no high-severity** code bugs; the remaining mediums/lows are real but lower-frequency or larger/riskier than this pass's scope. Ranked:

1. ~~**F-AUTH-001 (med-high)**~~ — **FULLY FIXED** (see Fixes table). The entire web memory/thread surface now runs through `useMastraClientRunner` → `runWithFreshAuth`: `ThreadSidebar` (CRUD + list), `useChatThread` (load/create), and `useDeepResearch` (start + resume-by-`runId`). `chat/page.tsx` no longer holds a snapshot client. No remaining F-AUTH-001 follow-up.
2. **G1 deep-research controller hardening (med)** — beyond the mode reset shipped here: monotonic run-token guard against stale `setState`, an `AbortController` so `reset()` cancels in-flight runs, `finishResume` error (not silent freeze) when the run handle is lost, lift the `excluded` set into the controller, persist `runId` for reload recovery. (`use-deep-research.ts`, `DeepResearchView.tsx`)
3. **G3 error-handling (med)** — `ensureThreadExists` swallows *all* errors (a real persistence failure looks benign → conversation lost on reload); `loadThread` `setMessages([])` blanks visible history on a transient `listMessages` failure. Inspect/surface non-conflict errors; keep prior messages + show retry. (`use-chat-thread.ts`)
4. **G9 trust-UI guards (low, but trust-relevant)** — deep-research "Citations verified: 0/0" shows a green badge; validate `http(s)`-only on report anchors; default Sources panel open on `sources.length>0`. (`DeepResearchReport.tsx`, `MessageList.tsx`)
5. **G5/G6/G7/G8/G10/G11/G12 (low)** — date `NaN`/range guards, persisted tool `output-error` state, citation regex paren/flag edge cases, markdown-export escaping, feedback edit/maxLength, theme mount race + unhandled rejections, and cosmetic nits. See synthesis §5–§12.
6. **Needs-live (13)** — incl. `auth-callback` base-URL on the real Railway deploy, deep-research run IDOR across users, `format-date` hydration. Several need a deployed env or a second user; the deep-research "decline-then-done" item was **disproven** (handled in `workflow.ts`). See synthesis "Needs-Live-Verification".
