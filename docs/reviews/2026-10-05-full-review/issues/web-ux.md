# Web app, user experience and accessibility: all issues

The web client enforces the rule that matters most: it shows no answer prose without a server release, and markdown rendering is safe by default. The main risk is in the surfaces a legal-aid user relies on to check an answer. Footnotes often highlight a different section from the one cited (15.4% of citations when stored answers were replayed locally), a withheld answer is displayed like an ordinary one while a leftover dot can say checks passed, and the Markdown export drops links and sources and reads only the newest 40 stored messages. Turn state is inferred from message parts, so stopping, re-running or switching threads produces false failure notices or hidden turns. Accessibility groundwork exists, but focus, announcements and contrast have gaps. Evidence is code reading plus local probes; nothing was observed in the deployed app. Fix the citation resolver first, then the withheld display and the export; the sidebar scroll fix is one class name.

## What is working

- The client re-applies the release rule: `packages/web/src/components/MessageList.tsx:163-166` drops every text part unless the last release part is passed or corrected, pinned by the test "never renders unchecked draft text while verifying" in `packages/web/tests/components/MessageList.test.tsx:605`.
- `coalesceThreadMessages` (`packages/web/src/lib/parse-message.ts:111-173`) merges a turn that Mastra stored as several messages into one assistant message ordered tools, text, verification, with a fixture mirroring the real stored shape. The export should reuse it.
- Markdown rendering is safe by default: no raw-HTML plugin, react-markdown's default URL transform, and `rel="noopener noreferrer"` on every anchor (`packages/web/src/components/MessageList.tsx:96-98`); `packages/web/src/components/DeepResearchReport.tsx:63-75` adds an explicit http(s) guard with tests.
- Stale responses are handled consistently: `activeThreadRef` in `loadThread` (`packages/web/src/lib/use-chat-thread.ts:162`), the `isActive` check for feedback (`packages/web/src/lib/use-feedback.ts:54`), and an abort controller plus active flag in `packages/web/src/lib/use-corpus-status.ts`.
- Screen-reader status goes through one hidden live region (`packages/web/src/components/MessageList.tsx:473-475`) instead of `aria-live` on the streaming container, and the mobile drawer handles inert state, Escape and focus restore (`packages/web/src/lib/use-sidebar-state.ts:45-79`) with a behaviour test.
- When a citation's label equals a source row's label exactly, the resolver's first step maps it to that row even though all sections share one PDF URL (`packages/web/tests/lib/message-parts.test.ts:388`); keep that step in the rewrite.

## High severity

### WEB-1 · Citation footnotes fall back to the document URL and highlight the wrong section

**high** · effort M · wrong-answer risk, user experience, test gap, live failure

`buildCitationResolver` (`packages/web/src/lib/message-citations.ts:40-105`) matches a citation by exact label, then by an ancestor rule that requires an identical `Policy` string and strictly fewer dotted segments, then by URL, which returns the document's first section row. Federal labels, `Policy 1-H` against rows labelled `1H`, and subsections carried inside an `N.0` row all fall through. Replaying stored answers through the real functions, 1,901 of 12,359 citations (15.4%) in 525 of 1,547 answers resolved to a different section's row, including about half of federal citations. Answer text and links stay correct.

**Impact.** An attorney clicking a footnote is shown a sibling section's excerpt as the source, and a citation of a never-retrieved section still gets a footnote number. Copied and exported text carry the same numbers.

**Fix.** Replace the `Policy`-only parse with one rule scoped to rows sharing the link's normalised URL: match the token after `§` to a row's section number or its deepest ancestor, treating a row ending in `.0` as the parent of `N.x`. Otherwise use a document-level or sole row, else show no footnote number. Build the cited group from resolved rows. Rewrite the test pinning first-row fallback; add federal, suffixed-label, never-retrieved, `Policy 3L-1 § 5.6` and `Policy 1-H § 3.2.1` fixtures.

*What is and is not established: Incidence comes from replaying stored answers on the older local graph with rebuilt source panels, not production. Two round-one verifiers rated this high and medium; high kept given the measured rate.*

Where: `packages/web/src/lib/message-citations.ts:104`, `packages/web/src/lib/message-citations.ts:49`, `packages/web/src/lib/message-citations.ts:92`, `packages/web/src/lib/message-sources.ts:55`

## Medium severity

### WEB-2 · Withheld answers look like ordinary answers, and the Sources dot says checks passed

**medium** · effort M · user experience, accessibility, needless complexity, test gap

`packages/web/src/components/MessageList.tsx:166` renders a withheld answer as ordinary prose: one sentence covers four of the five withheld reasons, a bare retry button is the only marker, and the announcer says "Answer ready" (line 452). The live stream part carries verifier confidence telemetry (`packages/agent/src/processors/verifier/processor.ts:88-89`) that drives a dot on the Sources header. On a live, verifier-withheld answer with sources, its accessible name reads "All checks passed without rewrite"; on a corrected answer a red dot can sit under the green badge. Stored messages carry no telemetry, so the dot disappears after reload.

**Impact.** An attorney cannot tell a checker outage from a draft that failed grounding, which call for different next steps. A beneficiary gets no pointer to other help. Screen-reader users hear a success announcement.

**Fix.** Render a withheld answer as one alert notice headed "Answer withheld" holding the retry button, with separate copy for `unavailable`, the three grounding reasons and `unverified_history`; announce it once. Stop sending `confidence`, `severity` and `counts` in the stream part, and delete the Sources dot, `extractVerificationState` and the legacy rewrite and ok parts, so the release outcome is the only trust signal. Add `MessageList` tests per reason and an agent test pinning the streamed fields.

*What is and is not established: Established by code reading and component-level checks; no withheld answer was observed in the deployed app.*

Where: `packages/web/src/components/MessageList.tsx:166`, `packages/web/src/components/SourcesPanel.tsx:66`, `packages/web/src/lib/message-verification.ts:59`, `packages/agent/src/processors/verifier/processor.ts:88`

### WEB-3 · Markdown export drops citation links and the source list; print output is faint

**medium** · effort S · user experience, accessibility, test gap, live failure

`handleExport` (`packages/web/src/components/ThreadSidebar.tsx:216-223`) passes raw stored messages to `buildThreadMarkdown`, which converts them one at a time (`packages/web/src/lib/thread-helpers.ts:150`) instead of merging each turn as the screen does. Mastra stores a turn's tool calls and answer text in separate messages (per the repo's fixture), so the exported answer has no URLs, footnote numbers or Sources list; verifiers reproduced this. The export also omits the verification outcome and is untested. The print block (`packages/web/src/app/globals.css:233`) resets no colours: Chromium PDFs showed the light-theme question at about 2.6:1 contrast and dark-theme answers at about 3.3:1.

**Impact.** An attorney filing an exported thread gets citation labels with no links, no source list and no sign the answer was verified. Printed copies are legible but below the accessibility minimum.

**Fix.** Pass `coalesceThreadMessages` output to `buildThreadMarkdown`, reuse the screen's release check so a withheld turn exports under "Answer withheld" without a Sources block, add a verification and date line per answer, and keep the URL when a link matches no source. For print, wrap the dark variant and dark tokens in `@media not print` and give the question bubble print colours. Add export tests for split, withheld and unresolved-link turns and a print-media colour check.

*What is and is not established: Export loss reproduced locally against the repository's stored-message fixture, not a production thread. Print contrast was measured in Chromium only.*

Where: `packages/web/src/components/ThreadSidebar.tsx:220`, `packages/web/src/lib/thread-helpers.ts:150`, `packages/web/src/lib/message-citations.ts:165`, `packages/web/src/app/globals.css:233`

### WEB-4 · Thread restore and export load only the newest 40 stored messages

**medium** · effort M · reliability, user experience, test gap, live failure

The web calls `listMessages()` with no parameters to restore a thread (`packages/web/src/lib/use-chat-thread.ts:158`), export it (`packages/web/src/components/ThreadSidebar.tsx:216`) and derive a title (line 129), and reads only `messages`. The installed Mastra server defaults to a page of 40 and returns the newest 40; `hasMore` is ignored and no second page is requested. One turn stores several messages: in the reviewer's local snapshot 26 turns produced 99 messages, which puts the cut near the eleventh turn. The end-to-end mock hard-codes `hasMore: false`, so no test exercises the default.

**Impact.** A case manager reopening a long thread sees only its tail with no indicator; the first visible answer can lose its question or its sources, and the exported case-file copy silently omits the same turns.

**Fix.** Add a `listAllThreadMessages` helper that requests pages of 100 in ascending `createdAt` order until `hasMore` is false, de-duplicates by message id and lets a page error propagate; use it in `loadThread` and `handleExport`. For titles, request only the ten oldest messages. Add a unit test with two or more pages and a mid-loop rejection, and make `e2e/helpers/mock-routes.ts` honour `page`, `perPage` and `orderBy` instead of returning `hasMore: false`.

*What is and is not established: Page default read from the installed Mastra code. The messages-per-turn ratio comes from one local snapshot and was not re-counted; no long thread was opened in the deployed app.*

Where: `packages/web/src/lib/use-chat-thread.ts:158`, `packages/web/src/components/ThreadSidebar.tsx:216`, `packages/web/src/components/ThreadSidebar.tsx:129`, `e2e/helpers/mock-routes.ts:114`

### WEB-5 · Re-running an earlier answer hides every later turn while the server appends

**medium** · effort M · user experience, needless complexity, test gap, live failure

The re-run icon under every assistant message and both "Try again" buttons call `regenerate()` (`packages/web/src/lib/use-answer-versions.ts:76`), and the installed AI SDK truncates the client transcript at that message. The transport drops the SDK's regenerate marker (`packages/web/src/lib/use-chat-thread.ts:89-95`), so the server cannot tell a re-run from a new question, and `trustedChatInput` appends the question again under a new id. The reviewer's probe on a three-turn transcript left only the first question on screen.

**Impact.** One click on the small icon under an early answer removes every later question and answer from view, with no warning, until the page is reloaded. A matching re-run may be misread as independent confirmation.

**Fix.** Make `handleRerun` in `packages/web/src/app/chat/page.tsx` resend the question text with `sendMessage`, which matches what the server stores, and relabel the control "Ask again". Delete `packages/web/src/lib/use-answer-versions.ts`, `packages/web/src/components/VersionNav.tsx`, their tests and the version props in `packages/web/src/components/MessageList.tsx`, and route the page-level error retry through the same path. Do not build server-side replacement now. Add a test: re-running under the first of two answers sends the first question and keeps all four messages.

*What is and is not established: Client truncation reproduced in a local probe. The order after reload, with the repeated question at the end, is inferred from the append path and was not observed.*

Where: `packages/web/src/components/MessageList.tsx:427`, `packages/web/src/lib/use-answer-versions.ts:76`, `packages/web/src/lib/use-chat-thread.ts:89`, `packages/agent/src/answer-release.ts:49`

### WEB-6 · Switching threads mid-answer orphans the run and shows a false failure on return

**medium** · effort M · reliability, user experience, cost, test gap

`useChat` is keyed by thread id (`packages/web/src/lib/use-chat-thread.ts:100`), and `@ai-sdk/react` replaces its `Chat` on an id change without stopping the old one. `handleSelectThread` (line 180) never calls `stop()` and the sidebar stays clickable, so the run finishes on the server unobserved. Observational memory stores steps mid-run, so returning loads a partial turn that `packages/web/src/components/MessageList.tsx:199-200` reports as finished without an answer and offers "Try again", which starts a second run. The cached restore branch also skips the feedback reload.

**Impact.** A user who opens another thread while waiting cannot stop or watch the first run, is told on return that it failed, and is offered a duplicate run. Ratings can disappear after switching back.

**Fix.** Keep one `Chat` per thread in a ref-held map and pass it to `useChat`, with `onFinish` and `onError` set on the `Chat` constructor; delete `messageCache`, `pendingRestore` and the restore effect; load feedback on every select; evict idle entries beyond a small cap. For stored turns with tools but no answer, show a neutral notice without a retry offer. Rewrite `packages/web/tests/lib/use-chat-thread.test.tsx:155` to assert that a streaming thread stays streaming after switching away and back.

*What is and is not established: Established by code reading; not reproduced in a browser. Billing and rate-limit effects of the orphaned and duplicate runs were not verified.*

Where: `packages/web/src/lib/use-chat-thread.ts:184`, `packages/web/src/lib/use-chat-thread.ts:100`, `packages/web/src/lib/use-chat-thread.ts:189`, `packages/web/src/components/MessageList.tsx:199`

### WEB-7 · Stopped or dropped answers keep showing progress and blame an API error

**medium** · effort S · user experience, test gap, live failure

`packages/web/src/components/MessageList.tsx:327` shows "Checking the answer against sources…" whenever the last release part is `verifying`, with no streaming check, and `packages/web/src/components/ToolStep.tsx:29-31` derives its spinner from the tool part alone. After Stop the AI SDK keeps the partial message and sets status `ready`, so a turn stopped during verification stays on "Checking…" and one stopped during the tool loop keeps spinning. If the message has a tool part, the notice at line 361 adds that a transient API error interrupted the answer. A dropped connection also shows two different retry buttons.

**Impact.** A user who presses Stop during verification is told the answer is still being checked and, if tools ran, that an API error interrupted it. Nothing says they stopped it.

**Fix.** Render the verifying line only while streaming, and pass `isLive` to `ToolStep` so an unfinished tool shows "Interrupted" with no spinner. Extend the ended-early notice to turns that ended while verifying, with neutral copy and a "You stopped this answer" variant driven by a ref of aborted message ids filled from `onFinish`. Suppress the in-message retry while the page-level error box is showing. Add tests for stopped-in-tools, stopped-while-verifying and error states.

*What is and is not established: Established by reading the components and the installed AI SDK; not observed in a running app.*

Where: `packages/web/src/components/MessageList.tsx:327`, `packages/web/src/components/MessageList.tsx:199`, `packages/web/src/components/MessageList.tsx:361`, `packages/web/src/components/ToolStep.tsx:29`

### WEB-8 · Feedback on a live answer can detach after reload because message ids differ

**medium** · effort S · data quality, reliability, test gap

The live message takes its id from the stream's start chunk, but after reload `packages/web/src/lib/parse-message.ts:166` anchors the turn on the stored message that holds the answer text. When observational memory seals a message mid-turn, Mastra stores the turn as two assistant messages and the two ids differ. A verifier reproduced the split with real Mastra objects and mock models at 30,000 characters of tool results, but not at 20,000, on installed and latest packages. Feedback is keyed by message id (`packages/web/src/components/MessageList.tsx:410`).

**Impact.** A rating given right after an answer streams disappears on reload, and rating again inserts a second row. Feedback joins land on the tool-call message, and the production readiness smoke test's feedback check can fail.

**Fix.** Add a stream-only `messageId` (the id of the message that receives the released text) to the final verification part written in `packages/agent/src/processors/verifier/processor.ts`, outside the signed outcome, declared in a stream-only schema. In the web, key feedback on that field when present and on `msg.id` otherwise; leave the live message id unchanged. Extend `packages/agent/tests/chat-memory-http.test.ts` with a tool result large enough to force the split, and unit-test the fallback.

*What is and is not established: Reproduced with mock models only, above roughly 30,000 characters of tool results. How often production turns reach that size was not measured.*

Where: `packages/web/src/lib/parse-message.ts:166`, `packages/web/src/components/MessageList.tsx:410`, `packages/web/src/lib/use-feedback.ts:57`, `packages/agent/src/processors/verifier/processor.ts:88`

### WEB-9 · Sidebar thread list cannot scroll once full and pushes Sign out off-screen

**medium** · effort S · user experience, privacy, test gap, live failure

The thread list at `packages/web/src/components/ThreadSidebar.tsx:270` is a `ScrollArea` with only `flex-1`. Its root is not a scroll container, so it grows to its content height instead of scrolling, and the footer with Sign out is pushed out of the sidebar. The reviewer's headless Chromium probe of the real markup at 1280x800 with 40 threads showed 12 threads in view, no scroll range and Sign out at y=2570; a verifier reproduced the mechanism on a minimal page. Commit 2cdb3df fixed the same defect in the transcript only.

**Impact.** A regular user whose list outgrows the sidebar (12 to 25 threads in the reviewer's measurements) cannot reach older threads by mouse or touch or see Sign out, a concern on shared computers.

**Fix.** Change the class at `packages/web/src/components/ThreadSidebar.tsx:270` to `flex-1 min-h-0`. Add a case to `e2e/tests/mocked/scroll-stability.spec.ts` that mocks about 40 threads and asserts that the sidebar viewport's `scrollHeight` exceeds its `clientHeight` and that the Sign out button's bounding box lies inside the window.

*What is and is not established: Reproduced in headless Chromium with mocked threads, not in the deployed app; it appears only once an account has more threads than fit.*

Where: `packages/web/src/components/ThreadSidebar.tsx:270`, `packages/web/src/components/ui/scroll-area.tsx:16`, `packages/web/src/app/chat/page.tsx:197`, `packages/web/src/components/ThreadSidebar.tsx:76`

### WEB-10 · Keyboard and screen-reader users lose focus on footnotes and miss errors and research phases

**medium** · effort M · accessibility, user experience, test gap, live failure

The markdown link renderer at `packages/web/src/components/MessageList.tsx:76` is an inline function, so every re-render replaces each citation link; a verifier's probe showed Enter on a footnote drops focus to `<body>`. Transcript turns are plain `div` elements with no speaker label or landmark. The transport error box (`packages/web/src/app/chat/page.tsx:305`) has no alert role, and `DeepResearchView` announces no phase, including the plan-approval step. On phones the only "Close sidebar" control sits inside the inert region and the backdrop is an unlabelled `div`; Escape still closes the drawer.

**Impact.** A keyboard user who activates a footnote loses their place. A screen-reader user cannot tell who said what, hears no errors or research prompts, and, on a phone, finds no labelled close control.

**Fix.** Move the link renderer to module scope, passing the resolver through context, and focus the source row's link when a footnote is activated. Render turns as an ordered list with visually hidden speaker headings inside `main`; do not use `role="log"`. Add `role="alert"` to the transport error box and one status element for research phases. Give the mobile drawer a labelled close button and dialog role. Test that a focused footnote survives a re-render.

*What is and is not established: Focus loss was reproduced in a probe; the other items come from reading the markup. No real screen reader was used.*

Where: `packages/web/src/components/MessageList.tsx:76`, `packages/web/src/app/chat/page.tsx:305`, `packages/web/src/app/chat/page.tsx:220`, `packages/web/src/components/DeepResearchView.tsx:101`

### WEB-11 · Accent text, thinned labels and focus rings fall below accessibility contrast minimums

**medium** · effort S · accessibility, user experience, test gap

The light-theme `--accent` (`packages/web/src/app/globals.css:76`) is used as text, and many labels are thinned with opacity modifiers such as `text-muted-foreground/60`. Measured from computed styles in headless Chromium and reproduced by an independent calculation, light-theme ratios are 4.00:1 for external links, 2.91:1 for footnote markers at 8.64px, 2.18:1 for action icons, 2.38:1 for thread dates, 3.32:1 for the composer placeholder and 1.88:1 for the focus ring. The Web Content Accessibility Guidelines level AA require 4.5:1 for text and 3:1 for icons and rings. Full-opacity muted text passes at about 6.2:1.

**Impact.** Low-vision users, and anyone on a dim screen or in daylight, struggle to read citation markers, thread dates, the signed-in e-mail and Sign out. The keyboard focus ring is hard to see in light theme.

**Fix.** Replace opacity-thinned text classes with full-opacity `text-muted-foreground`, darken the light-theme `--accent` (with `--ring`, `--sidebar-primary`, `--sidebar-ring` and `--chart-1`) to a value computed against every surface it sits on, use `text-emerald-800` and `text-amber-800` on badges, and make focus rings full opacity. Add a Vitest test that parses the colour tokens in `packages/web/src/app/globals.css` for both themes and asserts a fixed list of pairs at 4.5:1, and 3:1 for the ring.

Where: `packages/web/src/app/globals.css:76`, `packages/web/src/components/MessageList.tsx:121`, `packages/web/src/components/MessageActions.tsx:23`, `packages/web/src/components/ThreadSidebar.tsx:347`

### WEB-12 · A 60-second status poll from any open chat tab keeps the agent awake

**medium** · effort S · cost

`useCorpusStatus` (`packages/web/src/lib/use-corpus-status.ts:47`) fetches the agent's `/corpus-status` route every 60 seconds from each open `/chat` tab, with no visibility or activity gate. The agent has `sleepApplication` enabled (`packages/agent/railway.json:19`), and Railway's documentation says a service sleeps only after sending no outbound traffic for at least five minutes; each response counts. About every fifth or sixth poll also misses the five-minute status cache and opens a Neo4j session. The September sleep check ran with no tab open.

**Impact.** The owner's budget: one chat tab left open overnight would keep the 4 GiB agent service awake, undoing the September sleep work. A verifier's estimate is roughly $4 to $40 a month.

**Fix.** Delete the interval and add no timer or visibility trigger. Give `useCorpusStatus` a `refreshKey` argument and refetch when it changes; in `packages/web/src/app/chat/page.tsx`, pass a key that changes when a chat answer or a deep-research run completes. Update the hook's docstring to say the status is fetched on mount and after each completed answer.

*What is and is not established: The effect on sleep and on the bill is inferred from Railway's documented rule; it was not observed on the service or an invoice.*

Where: `packages/web/src/lib/use-corpus-status.ts:47`, `packages/web/src/app/chat/page.tsx:36`, `packages/agent/railway.json:19`, `packages/agent/src/corpus-status.ts:8`

## Low severity

### WEB-13 · Released answers show a green verified badge but no not-a-case-decision caution

**low** · effort S · user experience, accessibility, evaluation validity

Beside a released answer the only fixed text is a green 12px line, "Verified against cited sources" (`packages/web/src/components/VerificationBadge.tsx:80-82`). The not-legal-advice notice is dismissed permanently per browser, and the composer line mentions neither case decisions nor deadlines.

**Impact.** A beneficiary deciding whether to call, file or wait sees a green tick and no reminder that the county office decides their case and their notice sets the deadline.

**Fix.** Add one fixed caution line to the released-answer branch of the badge, in `text-foreground` at `text-sm`, for example "General policy, not a decision on your case; deadlines are on your notice." Share that one string with the composer line, print, clipboard and export. Pin it in the existing badge test. Keep the personal-case rule at `packages/agent/src/prompt.ts:22-23` and include the four personal-case questions in the next evaluation run. The owner decides whether to reword "Verified".

*What is and is not established: How a beneficiary reads the badge is a judgement, not a measurement. The prompt does tell the model to caution on personal cases, but no saved evaluation covers it.*

Where: `packages/web/src/components/VerificationBadge.tsx:80`, `packages/web/src/components/DisclaimerNotice.tsx:47`, `packages/web/src/components/ChatInput.tsx:131`, `packages/agent/src/prompt.ts:22`

### WEB-14 · Block notices read at college level and the prompt never requests plain language

**low** · effort S · user experience, accessibility

The response format in `packages/agent/src/prompt.ts:113-119` has no plain-language rule. A heuristic Flesch-Kincaid script scored the five fixed block notices at grade 12 to 14, and the first beneficiary example in `packages/web/src/components/EmptyState.tsx:31` still uses the unexplained program name HCWD.

**Impact.** A beneficiary who is blocked is told so in the hardest sentences in the product, which also affects readers with cognitive disabilities or limited English.

**Fix.** Rewrite the five block notices (`packages/agent/src/processors/scope-gate.ts:98`; `packages/policy-corpus/src/scope/coverage.ts:59`, 60, 69, 84) and the identifier rejection (`packages/agent/src/chat-route.ts:37`) in short sentences saying what happened and what to do next. Expand or replace the HCWD example. Add one prompt rule: for first-person or everyday questions, open with two or three short cited sentences and expand acronyms; before shipping, run the four beneficiary-voiced golden cases through the verifier to confirm the opener is still released.

*What is and is not established: Grades come from a heuristic script with about one grade of error. Answer figures (median 12.5 over 548 saved answers) are from professional-register questions; beneficiary-voiced answers were not measured.*

Where: `packages/agent/src/prompt.ts:116`, `packages/policy-corpus/src/scope/coverage.ts:69`, `packages/agent/src/processors/scope-gate.ts:98`, `packages/web/src/components/EmptyState.tsx:31`

### WEB-15 · Six groups from the June quality-assurance handoff remain open and untracked

**low** · effort M · documentation, reliability, user experience

Six groups handed off by the June 2026 quality-assurance pass remain open in code, tracked only in dated review documents: thread-load error handling, date guards, restored tool states, citation parsing, export escaping and theme races. None affects answer correctness.

**Impact.** A network failure while opening a thread shows an empty conversation with no error or retry. After reload a failed tool call shows as still waiting, and a malformed timestamp prints "Invalid Date".

**Fix.** Open one issue listing the six groups. Fix thread loading first: keep clearing the pane on failure, but set a per-thread error state that shows a load-failed message with Retry, and swallow only an already-exists response on thread creation. Add a date guard, map persisted tool error states to an error state, and guard the theme read. Close the citation-regex and export-escaping groups as won't-fix if preferred, and decide the unassessed cosmetic group.

*What is and is not established: Read from the code and the June review documents; the individual failures were not reproduced in this review.*

Where: `packages/web/src/lib/use-chat-thread.ts:176`, `packages/web/src/lib/use-chat-thread.ts:150`, `packages/web/src/lib/parse-message.ts:25`, `docs/reviews/2026-06-22-qa-findings.md:102`

### WEB-16 · Every keystroke in the composer re-renders and re-parses the whole transcript

**low** · effort S · user experience

Composer state lives in `ChatPage` (`packages/web/src/app/chat/page.tsx:45`), which renders the unmemoised `MessageList`, so each keystroke and tool event re-parses every answer. The reviewer's jsdom probe measured 16.2 ms per keystroke at five turns, 128.3 ms at fifty.

**Impact.** Typing a follow-up in a long thread may lag, more so on the older phones and Chromebooks that beneficiaries and case managers use. Typical sessions are a few turns.

**Fix.** Wrap `MessageList` in `React.memo`; its props are already stable across keystrokes, and the probe showed markdown renders per keystroke falling from 20 to 0. Then memoise `AssistantMessage` with stable props: pass one feedback entry instead of the map and make `handleRerun` independent of `messages`. Leave the input state where it is. Add the render-count probe as a test: with several answers on screen, typing triggers no markdown renders.

*What is and is not established: Timings come from a jsdom probe that verification did not re-run; no browser profile was taken.*

Where: `packages/web/src/app/chat/page.tsx:45`, `packages/web/src/components/MessageList.tsx:439`, `packages/web/src/components/MessageList.tsx:174`, `packages/web/src/lib/use-chat-thread.ts:99`
