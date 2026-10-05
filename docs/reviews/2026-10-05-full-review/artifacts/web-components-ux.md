# Working artifact from the web-components-ux reviewer

## A. What one assistant turn shows in each wire state

Rendered with the real `MessageList` in jsdom (`SCRATCHDIR/dom/matrix.probe.test.tsx`). "Live" shapes follow `gateAnswerStream`; "reloaded" shapes follow `releaseMessage`.

| # | Wire state | On screen | Note |
|---|---|---|---|
| 1 | submitted, no assistant message yet | spinner "Starting research..." | |
| 2 | streaming, tool running | tool card "Running"; narration "Reading section — Section: sec:doc:… · step 1" | raw internal id shown |
| 3 | streaming, tools done, model drafting | same card (Done) and the same narration | narration is stale; prose is gated, nothing says "writing" |
| 4 | streaming, verifying | card, stale narration, "Checking the answer against sources…" | two progress lines |
| 5 | ready, passed (live) | answer with footnotes; badge "Verified against cited sources"; Research trail; Sources with dot; actions | |
| 6 | ready, corrected (live, low telemetry) | as 5; badge "Corrected and verified…"; red dot | signals disagree |
| 7 | ready, passed (reloaded) | as 5 without the dot | dot is live-only |
| 8 | ready, withheld by verifier (live) | fixed sentence as prose; "Try again"; trail; Sources with red dot and "All checks passed without rewrite."; actions; no badge | |
| 9 | ready, withheld by gate (no release before finish) | as 8 without the dot | |
| 10 | ready, unverified history | "This previous answer was not verified before release…"; "Try again" | |
| 11 | ready after Stop in the tool loop | tool cards, one still "Running" with spinner; "finished without a final answer… transient API error"; Sources; actions | |
| 12 | ready after Stop or drop while verifying | tool cards; "Checking the answer against sources…"; same notice | stale status |
| 13 | error after a partial stream | tool cards; same notice (the page adds an error box with a second "Try again") | |
| 14 | blocked by an input guard | amber notice with the server's message | no actions |
| 15 | text with no release part | tool cards; "finished without a final answer" | text correctly hidden; copy misleading |

## B. Measured contrast (headless Chromium, computed styles, real markup, compiled CSS)

AA needs 4.5:1 for text and 3:1 for icons and focus indicators.

| Element | Size | Light | Dark |
|---|---|---|---|
| Answer body text | 16px | 9.31 | 12.97 |
| Citation link (ink) | 16px | 15.51 | 14.63 |
| External link (gold) | 16px | **4.00** | 9.03 |
| Footnote marker [n] | 8.64px | **2.91** | 6.10 |
| Verification badge label | 12px | **4.42** | 11.12 |
| "Generated …" timestamp | 10px | **2.63** | **2.93** |
| Message action icons (need 3) | icon | **2.18** | **2.40** |
| Sources count line | 11px | 6.02 | 5.88 |
| Sidebar "Threads" label | 11px | **3.49** | **4.29** |
| Sidebar inactive thread title | 13px | 5.51 | 6.42 |
| Sidebar thread date | 10px | **2.38** | **2.79** |
| Sidebar "…" icon (need 3) | icon | **2.70** | 3.24 |
| Account e-mail / Sign out | 11px | **3.01** | **3.77** |
| Masthead subtitle and corpus date | 10px | 6.67 | 5.76 |
| Composer placeholder | 15px | **3.19** | **3.57** |
| Composer helper text | 12px | 6.67 | 5.76 |
| Disclaimer "I understand" | 11px | **4.01** | 7.76 |
| User question bubble | 15px | 13.88 | 14.39 |

Calculated only (not sampled in the browser): button focus ring `ring-ring/50` 1.88 light / 3.07 dark; composer border against the card 1.40 / 1.37.

## C. Measured geometry (Chromium, 1280x800, fallback fonts)

| Control | Box |
|---|---|
| Thread "…" menu trigger | 18 x 18 |
| Citation footnote: button box / padded hit area | 14.1 x 0 / 30.1 x 16 |
| Message actions (copy, re-run, thumbs) | 26 x 26 |
| "Show policy text" summary | 622 x 16 |
| Sidebar toggle, theme toggle | 32 x 32 |
| Deep Research toggle | 135 x 26 |
| Ask | 60 x 32 |
| Composer footer on a 390x844 phone | 156 px tall |

Sidebar with 40 threads: ScrollArea root 2496 px tall inside an 800 px sidebar, viewport not scrollable, "Sign out" at y=2570. With `min-height: 0` on the root: scrollable, "Sign out" at y=760.

## D. Component inventory

| File | Lines | Does | Observations |
|---|---|---|---|
| MessageList.tsx | 544 | transcript, AssistantMessage, markdown, announcer | AssistantMessage is about 295 lines with roughly 20 values derived per render; inline markdown components; 12 props, five of them drilled to MessageActions; dead progress-text and cursor paths |
| ThreadSidebar.tsx | 449 | list fetch, rename, duplicate, export, delete, sign-out | data fetching, five mutations and the view in one component; legacy derived-title effect; ScrollArea without min-h-0 |
| chat/page.tsx | 344 | composition root | owns composer text state; inline error renderer; two retry paths |
| ToolStep.tsx | 335 | tool card, summaries | about 200 lines hand-mirror tool schemas with casts |
| SourcesPanel.tsx | 265 | sources list, confidence dot | tooltip text can contradict the release outcome |
| DeepResearchView.tsx | 192 | plan gate, phases, errors | index-based exclusion state never reset; no live region; no tests |
| MessageActions.tsx | 167 | copy, re-run, feedback | thumbs lack aria-pressed |
| ChatInput.tsx | 157 | composer | sound; Enter behaviour keyed on width |
| DeepResearchReport.tsx | 135 | report | second, stricter link renderer; no export |
| VerificationBadge.tsx | 109 | badge | describe() and the withheld branch are unreachable from the app |
| ui/* (7 files) | 682 | base-ui wrappers | scroll-area root needs a min-h-0 default when used as a flex child |

Duplicated across files: the prose class string (3 places), masthead markup (4 including the preview gallery), spinner markup (5), `AGENT_ID` (ThreadSidebar.tsx:34 and use-chat-thread.ts:13), `countLabel` (SourcesPanel.tsx:28 and ToolStep.tsx:46), two markdown link renderers with different safety rules.

## E. Probe index

All under SCRATCHDIR; nothing was written to the repository.

- `probe-lib.ts`, `probe-federal.ts`, `probe-ids.ts`: tsx scripts calling the repo's real citation, source, error-parsing and identifier functions.
- `dom/*.probe.test.tsx`: an isolated vitest + jsdom harness (own config; `node_modules` symlinked) rendering the real components: `components` (stale verifying, withheld, trust signals, citations, markdown, semantics, Deep Research), `remount`, `rerender`, `timing`, `regenerate`, `export`, `matrix`, `snapshot`.
- `sidebar-probe.mjs`, `layout-probe.mjs`, `mobile-probe.mjs`, `print-probe.mjs`, `contrast-browser.mjs`: headless Chromium (Playwright from `e2e/node_modules`) laying out the jsdom-rendered markup with the compiled stylesheet in `packages/web/.next/static/chunks`.
- `contrast.mjs`, `contrast-check.mjs`, `contrast-fix.mjs`: independent oklch-to-sRGB contrast arithmetic. `flex-probe.mjs`: static reproduction of the sidebar flex layout.
