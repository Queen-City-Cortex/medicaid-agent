I have enough verification. The key findings: the deep-research decline-then-done live item is actually **settled by the agent code** (it's a non-issue), and the deep-research race conditions are real but share one root cause. I've confirmed the theme race, the parse-message dead branches, and the normalizeCitationUrl exact-match. Writing the report now.

---

# NC Medicaid Navigator — QA Triage Report

Grouped by root cause for coherent fixes. 60 confirmed-bug entries collapse into **12 fix groups**. Severity reflects the worst bug in the group.

---

## FIX FIRST

There are **no HIGH-severity bugs**. The audit's max severity is `medium`. Nothing is a blocker, but four medium items are genuine user-facing data/UX problems and should lead the queue:

1. **G1 — Deep Research view/state never resets on thread switch or mode toggle** (medium, very reachable). Multiple medium+low items converge here; this is the single most user-visible cluster.
2. **G3 — Transient backend errors blank or fail to persist real conversations** (`use-chat-thread.ts`) — medium, silent data loss on reload.
3. **G2 — `MASTRA_URL`/CORS/auth env defaults silently fall back to localhost** — medium operational footgun, total outage if a deploy var is missing.
4. **G4 — Lost typed text on first-message send failure** — medium, plain user frustration.

---

## 1. Group G1 — Deep-research controller has no run-token guard, no reset-on-switch, and no abort (medium)

**Bugs:** `deep-research-mode-toggle`, `deep-research-mode-toggle#no-reset-on-switch`, `deep-research-mode-toggle-integration`, `deep-research-lifecycle-race#no-run-token`, `deep-research-start-plan#double-start-race`, `deep-research-approve#no-active-guard`, `deep-research-approve#finishResume-null-frozen` / `deep-research-approve`, `deep-research-reset-no-abort` (the `reset-no-abort` variant), `deep-research-subq-toggle`, `deep-research-plan-edit#excluded-not-reset`, `deep-research-researching` (#both), `deep-research-workflow-run`.

**Files:** `packages/web/src/lib/use-deep-research.ts:126-204`, `packages/web/src/components/DeepResearchView.tsx:30,112-155`, `packages/web/src/app/chat/page.tsx:59-62,91-92,219-220,271`.

**Combined user impact:** A user who runs deep research, then switches threads / toggles the mode / re-asks, sees: a stale prior report reappear; excluded sub-questions silently re-included or wrongly excluded against a new plan; a research run still executing invisibly after toggling off; rare stale-write flashes; and (`finishResume` `if (!run) return`, use-deep-research.ts:161) a permanent "Researching…" hang with no recovery if the run handle is lost.

**Single coherent fix** (one controller rewrite addresses all of them):
- Add a monotonic `runIdRef` captured locally in `start()`/`approve()`; before every `setState` in `start()` (use-deep-research.ts:139-150) and `finishResume()` (use-deep-research.ts:164-170) bail if `runIdRef.current !== localId`. Bump it in `reset()`.
- Give the controller an `AbortController`; `reset()` aborts the in-flight `startAsync`/`resumeAsync`.
- In `finishResume`, replace the silent `if (!run) return` (line 161) with `setStatus('error')` + a user message so Approve can't hang.
- Lift `excluded`/`kept` out of `DeepResearchView` (DeepResearchView.tsx:30) into the controller, reset on `plan` change, and render the "researching" progress list (DeepResearchView.tsx:144-151) from the *kept* set, not full `plan.subQuestions`.
- In `chat/page.tsx` `onThreadSwitch` (lines 59-62) call `deepResearch.reset()` and `setDeepMode(false)`; make `onToggleDeepResearch` (line 271) call `reset()` when flipping off.
- Add an `isBusy` guard at the top of `start()` and disable Approve once `status !== 'awaiting-approval'`.
- `deep-research-workflow-run`: persist `runId` in sessionStorage and rehydrate `runRef` on mount.

**Regression test idea:** Controller unit test with a mocked `MastraClient` whose `startAsync`/`resumeAsync` resolve on deferred promises. Assert: (a) `reset()` before resolution → late resolution makes no state change; (b) `start()` twice → only the second run's plan lands; (c) `finishResume` with nulled `runRef` → `status==='error'`, not frozen. Plus a Playwright `design` test: run deep research to done, switch threads, confirm idle.

---

## 2. Group G2 — Env-var defaults silently fall back to localhost / dev (medium)

**Bugs:** `mastra-client-auth`, `mastra-client-factory`, `chat-stream-endpoint` (CORS), `middleware-auth-gate` (live), `auth-callback-handler` (live).

**Files:** `use-chat-thread.ts:11`, `lib/mastra-client.ts:3`, `use-feedback.ts:6`, `use-corpus-status.ts:6` (four copies of `process.env.NEXT_PUBLIC_MASTRA_URL || 'http://localhost:4111'`); `packages/agent/src/index.ts:229-230` (CORS origin default).

**Combined user impact:** A deploy missing `NEXT_PUBLIC_MASTRA_URL` bakes localhost into the bundle → every backend call fails opaquely. A deploy missing `CORS_ORIGINS` blocks all credentialed fetches at preflight → chat fully non-functional. Both fail silently with no error pinpointing the misconfig.

**Single coherent fix:** Create one `packages/web/src/lib/mastra-url.ts` exporting `MASTRA_URL`, imported by all four web files (kills 3 duplicate definitions — fits the project's "ruthless about tech debt" stance). Throw at module load when `NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_MASTRA_URL`. On the agent, add `CORS_ORIGINS` to `validateEnv`/`REQUIRED_ENV` or log a loud warning when falling back in non-dev `NODE_ENV`.

**Regression test idea:** Unit test the new module: with `NODE_ENV=production` and the var unset, importing throws; with it set, exports the value. Grep-based lint to forbid re-introducing the inline default.

**Live items folded here:** `middleware-auth-gate` and `auth-callback-handler` are the same "is the deploy env right" question — see §13.

---

## 3. Group G3 — `use-chat-thread` swallows/over-reacts to backend errors (medium)

**Bugs:** `memory-thread-routes` (#both — `ensureThreadExists` empty catch, and `setMessages([])` on load failure), `feedback-reset-on-switch#late-mutation-reinsert`, `sidebar-thread-list-load` (late unguarded `fetchThreads`).

**Files:** `use-chat-thread.ts:148-159` (empty catch), `use-chat-thread.ts:180-183` (`setMessages([])`), `use-feedback.ts:67-114` (no `isActive` guard on mutations), `ThreadSidebar.tsx:160,183,199`.

**Combined user impact:** A genuine `createMemoryThread` failure (read-only volume, auth) is indistinguishable from benign "already exists" → conversation appears to work but is never persisted; gone on reload. A *transient* `listMessages` 5xx wipes the visible history to empty rather than showing an error. Out-of-order resolutions (feedback mutations, sidebar list refetches) leave stale in-memory state.

**Single coherent fix:** (a) In `ensureThreadExists`, inspect the error — only swallow a recognizable already-exists/conflict; log/surface the rest. (b) On `listMessages` failure, keep existing messages + show a retry banner instead of `setMessages([])`. (c) Mirror `loadFeedback`'s `isActive()` guard (use-feedback.ts:55) into `handleRate`/`handleComment` before their reconcile `setState`. (d) Pass the live `AbortController` signal (or `await`/bump `refreshKey`) into the mutation-path `fetchThreads()` calls.

**Regression test idea:** Hook tests with a mock client whose `listMessages` rejects → assert prior messages retained; whose `createMemoryThread` rejects with a non-conflict error → assert it surfaces. Switch-thread-mid-mutation test → assert no stale feedback entry.

---

## 4. Group G4 — Clear-before-await loses user input on send failure (medium)

**Bug:** `send-message` (the `setInput('')` before `await` variant).

**File:** `chat/page.tsx:107-116`.

**User impact:** First-message send failure (transient network) wipes the typed question from the composer with no restore. "Try again" regenerate exists but the raw text is gone.

**Fix:** Wrap the send in try/catch; on rejection `setInput(question)`. Or only clear after `sendMessage` resolves.

**Regression test:** Mock `sendMessage` to reject → assert composer value restored.

---

## 5. Group G5 — Date/number rendering has no NaN/range guard ("Invalid Date", "140%", "1 sub-questions") (low)

**Bugs:** `format-date` (sidebar), `corpus-status-freshness#invalid-date`, `empty-state-hero`, `corpus-status` (`.toISOString()` throws → 503), `extract-verification-state` (no 0..1 clamp), `deep-research-stats` (pluralization).

**Files:** `thread-helpers.ts:13-29`; `use-corpus-status.ts:38-40`; `EmptyState.tsx:43-49`; `packages/agent/src/corpus-status.ts:31`; `message-parts.ts:111-112`; `DeepResearchReport.tsx:104-106`.

**Combined user impact:** A malformed timestamp from Mastra/the pipeline renders the trust-eroding literal "Invalid Date" in the sidebar and the corpus-freshness line (directly violating the hook's own "never a wrong freshness claim" contract, use-corpus-status.ts:15-17), or 503s the entire corpus-status endpoint. An out-of-range verifier confidence renders ">100%". Cosmetic pluralization on counts of 1. All require backend/pipeline bad data, so low likelihood — but the freshness ones undermine the product's verifiability premise.

**Single coherent fix:** A shared `safeDate(s): Date | null` helper (`const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d`) used in `formatDate`, `useCorpusStatus` (reject bad `lastUpdated`), `EmptyState`, and the agent's `corpus-status.ts` (log the offending node id instead of throwing). Clamp confidence `Math.min(1, Math.max(0, confidence))` at message-parts.ts:111. Apply the existing `=== 1 ? '' : 's'` pattern to the other nouns.

**Regression test:** Unit-test `formatDate('garbage')` → `''`; `useCorpusStatus` with bad `lastUpdated` → state omits the date; agent `getCorpusStatus` with unparseable `last_indexed` → returns `null`, not a throw.

---

## 6. Group G6 — Persisted tool-invocation states collapse to `input-available` (low)

**Bugs:** `convert-thread-message-v2`, `convert-v4-parts-v5` (same line, same fix).

**File:** `parse-message.ts:23-25` — confirmed: `state: inv.state === 'result' ? 'output-available' : 'input-available'`, no `output-error` branch despite `message-parts.ts:10` documenting `errorText`.

**User impact:** On thread restore, a historically failed tool call renders as still "waiting" rather than errored. Cosmetic, restore-path only.

**Fix:** Map error/failed states to `state: 'output-error'` carrying `errorText`.

**Regression test:** Unit test `convertV4PartsToV5` with an `inv.state==='error'` part → asserts `output-error` + `errorText`.

---

## 7. Group G7 — Markdown citation regex truncates URLs with `)` and matches image embeds (low)

**Bugs:** `extract-cited-urls` (#both — paren truncation + image-embed match), `build-answer-clipboard-text` (same `[^)\s]+` pattern), `normalize-citation-url` (exact-string flag match).

**Files:** `message-parts.ts:482`, `:533`, `:196-197` (confirmed exact-equality, case-sensitive `?attachment`).

**Combined user impact:** A cited URL containing `)` is dropped from the cited set and broken in the clipboard export (cited count disagrees with export). A `?attachment` flag combined with another param won't dedupe → duplicate Sources rows. Image embeds (the app doesn't emit them) would miscount. Narrow preconditions; the bare `?attachment` form the code handles is what DHHS actually emits.

**Single coherent fix:** Keep `extractCitedUrls` and `buildAnswerClipboardText` sharing one pattern (they already do — preserve that invariant). For dedup, parse `searchParams` and delete known flag keys case-insensitively instead of full-string compare. Add a `(?<!!)` guard to exclude image embeds. Full paren handling is bounded by markdown's own `)` delimiter — document percent-encoding as the contract rather than over-engineering.

**Regression test:** Unit tests: URL with `)` consistently classified by both functions; `?attachment&x=1` dedupes against the clean URL; `![alt](http…)` not counted as cited.

---

## 8. Group G8 — Markdown export fidelity (low)

**Bugs:** `build-thread-markdown` (#both — unescaped user text, tool-only turns skipped), `thread-title-derivation` (surrogate-pair slice), `build-thread-display-titles` (#both — same-day & user-title collisions), `get-trailing-assistant-text` (`''` join — *live*).

**Files:** `thread-helpers.ts:137,148-154,160-161,57,89-104`; `message-parts.ts:60`.

**Combined user impact:** Exported case files can render user questions as unintended markdown formatting, drop a dangling `## Question` with no answer, show ambiguous duplicate sidebar titles, and (rarely) a broken glyph from slicing mid-emoji. All cosmetic/export-fidelity, content preserved.

**Fix:** Escape markdown metacharacters in user text/title before insertion; emit a "_No final answer_" placeholder for tool-only turns; slice titles by codepoint (`[...str].slice(0,60).join('')`); include user-set titles read-only in collision detection.

**Regression test:** Snapshot test `buildThreadMarkdown` with a question containing `# *_[]()` and a tool-only assistant turn.

---

## 9. Group G9 — Trust/verification UI shows green when nothing was verified; unvalidated hrefs; count drift (low)

**Bugs:** `deep-research-verification` (0/0 → green badge), `deep-research-sources` (#both — no protocol validation on `href`, `.length` vs `stats.*Count` drift), `verification-badge` (gated on `finalAnswerText`), `sources-panel-render-toggle` (default-collapsed when cited=0).

**Files:** `DeepResearchReport.tsx:12,25-26,60,72,91,104-106`; `MessageList.tsx:206,341,370`.

**Combined user impact:** In a verification-first legal/medical tool: a report with zero checkable citations shows a reassuring green "Citations verified: 0/0"; a `javascript:`/`data:` source link (agent-controlled, trusted, so low exploitability) would be directly clickable; summary/footer source counts can disagree; the verification badge can vanish while sources render; and consulted-but-not-cited answers start with the Sources panel collapsed.

**Fix:** Guard the badge: `if (checkedCitations === 0)` render neutral "No citations to verify". Validate `http(s)`-only on `DeepResearchReport` anchors (mirror react-markdown's `defaultUrlTransform`). Derive both source counts from the arrays. Gate `VerificationBadge` on `verification && (finalAnswerText || sources.length > 0)`. Default Sources panel open on `sources.length > 0`, not `citedCount > 0`.

**Regression test:** Component test of `DeepResearchReport` with `{checkedCitations:0,fabricatedCitations:0}` → no green badge; with a `javascript:` link → rendered as text.

---

## 10. Group G10 — Feedback feature gaps & limits (low)

**Bugs:** `feedback-comment#no-edit-or-up-comment-path` / `feedback-comment-input` (no edit, no maxLength), `feedback-submit` (#three — up+comment silently nulled, no `.max()` on comment, unbounded DB column), `feedback-delete` (clear uses messageId fallback → 404).

**Files:** `MessageActions.tsx:144-154`; `packages/agent/src/feedback/routes.ts:7-12`; `repository.ts:60-70,86`; `use-feedback.ts:69,83-95`.

**Combined user impact:** A user can't edit/remove a downvote note or comment on an upvote; the comment field is unbounded (could store multi-MB blobs — a real volume-growth vector even if authenticated-only); a fast rate-then-clear can fail with a 404 and re-show the thumb.

**Fix:** Show the comment box for any rating, prefilled with the existing comment (server already upserts). Add `maxLength` on the input + `.max(2000)` in `FeedbackBodySchema`. Disable/queue clear until the rating POST returns a real id. Decide and document the up+comment behavior (400 or accept).

**Regression test:** Schema test rejects >2000-char comment; hook test for rate-then-immediate-clear doesn't 404.

---

## 11. Group G11 — Unguarded `localStorage` / unhandled promise rejections (low)

**Bugs:** `theme-persistence` / `theme-set-action` / `theme-get-action` (no try/catch, mount race, duplicated cookie literal), `sidebar-toggle-desktop` (unguarded `setItem`), `sidebar-sign-out` (no `.catch`).

**Files:** `app/actions/theme.ts:32,38-41,49`; `ThemeProvider.tsx:58-64,76`; `use-sidebar-state.ts:35,51`; `ThreadSidebar.tsx:412`.

**Combined user impact:** Mostly console noise / strict-monitor trips. The one genuinely user-visible item is the **theme mount race** (`theme-persistence`, medium): `getThemeAction().then(...)` at ThemeProvider.tsx:58-64 unconditionally `setThemeState(saved)` with no guard — a user who picks a theme right at load can see it flip back when the async server read resolves on a slow network. The `setItem` throw only bites in storage-disabled Safari modes.

**Fix:** Add a `userPickedRef` guarding the mount `setThemeState`; add `.catch(()=>{})` to both action calls; wrap `updateUser` (theme.ts:38) and the two `localStorage.setItem` calls in try/catch; wrap `signOut()` in an async handler ignoring `NEXT_REDIRECT`. Export a shared `THEME_COOKIE` constant.

**Regression test:** ThemeProvider test: user `setTheme('dark')` before a deferred `getThemeAction` resolves with `'light'` → final state stays `dark`.

---

## 12. Group G12 — Pure dead code / cosmetic nits (low, mostly delete-on-sight)

**Bugs (these are the dubious ones — call out):**
- `send-message` (`input.length > 10_000` dead guard, page.tsx:106) — **not a bug, just unreachable defensive code**; the audit even says "redundant defensive check, not a malfunction." Either delete it or keep as defense-in-depth. Don't spend time.
- `new-thread` (superfluous `async`, use-chat-thread.ts:206) — trivial, drop the keyword.
- `healthz` (#two — `probeWritable` write-per-call, shadowed `storage` const, index.ts:79/287) — by-design probe + a lint smell; rename the local, leave the probe.
- `message-cache-restore` (#two — unbounded `messageCache`, verbose `console.log`) — cap the Map (LRU) and gate logs on `NODE_ENV`. The "thread-id prefix leak" is an 8-char prefix in the user's *own* console — **not a real data exposure; dubious framing.**
- `version-nav-pager`, `corpus-status` cache, `corpus-status` token-retry, `sources-footnote-highlight` (uncleared timeout), `sidebar-mobile-overlay` (backdrop persists), `sidebar-duplicate-thread` (no in-flight guard, hard to trigger), `sidebar-thread-title-display` (re-request on failure), `chat-status-announcer` (cancel announces "Answer ready"), `ended-without-answer` (empty clipboard "succeeds"), `chat-input-textarea` (programmatic injection clipped), `extract-text-legacy` (no `typeof` guard — unreachable), `deep-research-error` (raw `err.message` rendered — minor info-disclosure, worth scrubbing).

**Worth doing in this group:** `ended-without-answer` (empty Copy silently "succeeds" — emit the Sources block or disable Copy), `chat-status-announcer` (announce "Generation stopped" for stop()), `sources-footnote-highlight` (store + clear the timeout id), `deep-research-error` (map to a generic message, log raw). The rest are delete-or-defer.

---

## Needs-Live-Verification — ranked, with the exact observation that settles each

1. **`deep-research-decline#cancel-then-done` — ALREADY SETTLED IN CODE; this is a non-issue.** I read the workflow: `approvalStep.execute` on `approved:false` calls `bail({ status: 'cancelled' })` (`packages/agent/src/deep-research/workflow.ts:255-268`), so `finishResume`'s `res.result.status === 'cancelled'` branch (`use-deep-research.ts:166`) holds and the UI stays cancelled. **Recommend closing without a live test.**

2. **`auth-callback-handler` (medium)** — `getBaseURL()` evaluated at module load (`route.ts:20`). *Observation:* hit the WorkOS sign-in flow on the real Railway deploy and inspect the callback `Location` header — confirm it's the public domain, not `0.0.0.0`/internal. If wrong, make `baseURL` per-request.

3. **`deep-research-workflow-run` IDOR (medium)** — workflow registered with no per-user binding (`packages/agent/src/index.ts:204-207`). *Observation:* as user B (different session), call `resumeAsync` with a `runId` created by user A. If it resumes/observes A's run, add ownership checks. (Depends on Mastra's run-store scoping.)

4. **`format-date` hydration mismatch (medium)** — `toLocale*` is TZ-sensitive (`thread-helpers.ts:22-28`). *Observation:* load `/chat` with the browser TZ offset from UTC across a day boundary and watch for a React hydration warning. **First confirm whether `ThreadSidebar` SSRs at all** — the shell is heavily `'use client'`; if the thread rows are client-only, this cannot fire and it's a non-issue.

5. **`chat-stream-endpoint` client stream timeout (low)** — `DefaultChatTransport` has no AbortSignal (`use-chat-thread.ts:90`). *Observation:* drop the connection mid-stream against the running agent; confirm `useChat` flips to `error` (onError, line 111). If it hangs on the spinner, add a client inactivity timeout.

6. **`rerun-answer#no-streaming-guard` (low)** — `regenerate()` has no status check (`use-answer-versions.ts:56-77`). *Observation:* check whether the RotateCcw button (`MessageActions.tsx:108-115`) is reachable mid-stream in `MessageList` render gating. If reachable, add `if (isStreaming) return;`.

7. **`pinned-scroll` (low)** — follow effect early-returns when `!pinnedRef.current` (`use-pinned-scroll.ts:60-63`), ref not reset on switch. *Observation:* scroll up in thread A, click thread B; confirm B lands at the newest message vs the top. If wrong, reset `pinnedRef.current=true` on switch.

8. **`middleware-auth-gate` (low)** — `/preview` protected only by `process.env.NODE_ENV === 'production'` (`preview/page.tsx:21`). *Observation:* curl `/preview` on each deployed Railway env; expect 404. Optionally add a redundant gate in `proxy.ts`. (Gallery is fixtures only — low stakes.)

9. **`deep-research-toggle` mid-run (low)** — covered by the G1 fix; *observation* folds into G1's manual test.

10. **`extract-message-sources` memoization (low)** — `message-parts.ts:393` pure, caller-dependent. *Observation:* React-profile a long thread; only memoize in `MessageList` if a real cost shows.

11. **`get-trailing-assistant-text` `''`-join (low)** — `message-parts.ts:60`. *Observation:* find a live multi-paragraph answer that streams as multiple sibling text parts; if paragraphs run together in the export, join with `\n\n`. Normally a single contiguous part → no-op.

12. **`deep-research-report#schema-mirror-drift` (low)** — hand-maintained mirror (`use-deep-research.ts:6-9,42-57`). Not a runtime bug; an architectural risk. *Action* not observation: generate the client type from the agent zod schema (or share the schema package) so future additions fail compilation.

---

## Notes on dubious "confirmed" items
- **`deep-research-decline#cancel-then-done`** — listed as needs-verification but the code proves it's fine (see #1 above). Close it.
- **`send-message` length guard** and **`extract-text-legacy`** are unreachable defensive code, not malfunctions — the audit concedes this. Treat as cleanup, not bugs.
- **`message-cache-restore` "leaks thread-id prefixes"** — an 8-char UUID prefix in the user's own console is not a data exposure; the real issue there is just log noise + unbounded Map.
- **`extract-cited-urls` image-embed match** — the app never emits image markdown and the renderer sanitizes; effectively unreachable. Defensive only.

Relevant files: `/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/web/src/lib/use-deep-research.ts`, `/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/web/src/lib/use-chat-thread.ts`, `/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/web/src/lib/message-parts.ts`, `/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/web/src/lib/parse-message.ts`, `/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/web/src/lib/thread-helpers.ts`, `/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/web/src/app/chat/page.tsx`, `/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/web/src/components/DeepResearchView.tsx`, `/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/web/src/components/DeepResearchReport.tsx`, `/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/web/src/components/ThemeProvider.tsx`, `/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/agent/src/deep-research/workflow.ts`, `/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/agent/src/index.ts`, `/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/agent/src/feedback/routes.ts`, `/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/agent/src/corpus-status.ts`.