# Product UX Review — NC Medicaid Navigator chat (2026-06-11)

Static walkthrough of the full chat experience (landing → empty state → send → streaming/tool trace → answer + citations → sources panel → feedback/version nav → thread sidebar), the parsing layer (`message-parts.ts`), and the mocked e2e specs. Target users: legal aid attorneys, case managers, beneficiaries. Companion to `2026-06-11-remediation-plan.md`.

## Prioritized UX improvements

**1. Surface the hallucination verifier as a first-class, plain-language trust badge — not a 10px hover-only dot. (Critical)**
Files: `SourcesPanel.tsx` (`ConfidenceDot`), `MessageList.tsx`, `message-parts.ts` (`extractVerificationState`).
Today the verifier outcome renders only as a 2.5-size colored dot inside the collapsed Sources trigger, with hover tooltip — and only if sources exist; if `extractMessageSources` returns empty, verification state is silently dropped. Tooltip copy leaks internals ("Rewrite was empty — falling back to the original answer"). Build a visible badge row directly under the final answer in `AssistantMessage` (independent of SourcesPanel): "✓ Verified against cited sources" (high), "⚠ Partially verified — 2 claims could not be matched to sources" (medium), prominent amber/red callout for low confidence. This is the core differentiator for legal-aid buyers; today the strongest trust signal is effectively invisible and a low-confidence answer looks identical to a verified one.

**2. Let users see the cited policy text without downloading a PDF: excerpts in the Sources panel + "cited" vs "consulted" split. (Critical)**
Files: `message-parts.ts` (`extractMessageSources`, `MessageSource`), `SourcesPanel.tsx`.
Every source row is a bare `target="_blank"` link to a DHHS PDF download — the user lands on page 1 of a long PDF with no idea where § 3.2.1 is. `getSection` outputs already contain section content and it's discarded. Build: (a) capture a ~300-char `snippet` in `addSectionSource`, render as an expandable quote per source row; (b) mark sources whose normalized URL appears in the answer's inline links (`buildSourceIndex` already computes this) as **Cited**, demote the rest under "Also consulted" — currently all `searchSections` hits inflate the list, so "12 sources" mostly means "12 search results."

**3. Add a Stop button and retry-on-error; stop disabling the textarea during runs. (High)**
Files: `ChatInput.tsx`, `chat/page.tsx`.
`useChat` exposes `stop` but it's never wired; during a multi-minute run the user's only options are wait or reload. The error block has no action — and the input was already cleared in `handleSend`, so "try again" means retyping. Build: Stop button while `isLoading`; "Try again" in the error block that re-sends/restores the last user message; remove `disabled={isLoading}` from the textarea.

**4. Make answers copyable/printable/shareable in formats lawyers actually use. (High)**
Files: `MessageActions.tsx`, `ThreadSidebar.tsx` (`handleExport`), print stylesheet in `globals.css`.
Copy yields raw markdown (literal `[Policy 8C § 3.2.1](https://…)` in emails); thread export is a JSON blob with `schemaVersion`; `h-screen` + ScrollArea means Print produces one clipped viewport. Build: copy → clean text + numbered "Sources:" list (reuse `extractMessageSources`); per-answer "Print / Save as PDF" view (question, answer, verification status, sources, date, disclaimer); Markdown thread export (JSON secondary). The deliverable is "something I can put in a case file."

**5. Collapse the post-completion tool trace into one "Research trail" below the answer. (High)**
Files: `MessageList.tsx` (`AssistantMessage`), `ToolStep.tsx`.
A 10-tool run leaves ten full-width cards plus interleaved progress prose stacked *above* the answer. Once `isStreaming` is false, wrap tool parts + pre-tool progress text in one collapsible ("Research trail — 9 steps, 12 sources") rendered *below* the answer; keep the expanded live view during streaming.

**6. Live progress narration during long runs. (Medium)**
Files: `MessageList.tsx`, `ToolStep.tsx` (`TOOL_DESCRIPTORS`).
"Starting research…" never changes. Build a sticky status line: current step label + input summary ("Searching policies: 'therapeutic leave'…"), step counter, elapsed time — all derivable from the last tool part (`summarizeToolInput`).

**7. Expand the empty state into real first-run guidance. (Medium)**
File: `EmptyState.tsx`.
Add: scope statement naming covered document families + "corpus current as of {date}"; a "what it can't do" note (no legal advice, no individual case lookups); persona-grouped example questions with jargon expanded (one current example says "HCWD" unexplained).

**8. Generation timestamps on answers. (Medium)**
Files: `MessageList.tsx`, `MessageActions.tsx`.
Policies change; a weeks-old thread looks identical to a fresh answer. Render "Generated {date}" (stored `createdAt` exists) and include it in copy/print output.

**9. Auto-open Sources when citations matched; render the unused `originTool` provenance. (Medium)**
Files: `SourcesPanel.tsx`, `MessageList.tsx`.
Panel defaults closed; `MessageSource.originTool` is computed and documented ("drives the small origin badge") but never rendered. Default `panelOpen` true when `sourceIndex.size > 0`; add per-row provenance badges.

**10. Mobile ergonomics: citation tap targets and Enter-to-send. (Medium)**
Files: `MessageList.tsx` (footnote button), `ChatInput.tsx`.
Footnote buttons are `text-[0.7em]` inside `<sup>` — far under the 24px tap-target minimum (an e2e test notes the near-zero bounding box). Enter always sends, so mobile users can't write multi-line questions. Give footnotes a ≥24×24 hit area; gate Enter-sends on `!useIsMobile()`.

**11. Preserve line breaks in user messages; warn at the input limit. (Low)**
Files: `MessageList.tsx` (user bubble), `ChatInput.tsx`.
Multi-line questions render collapsed (no `whitespace-pre-wrap`); the 10,000-char `maxLength` silently stops keystrokes and `handleSend` silently drops >10K. Attorneys paste long fact patterns — silent truncation is data loss.

**12. Soften "ended without answer" recovery; humanize VersionNav. (Low)**
Files: `MessageList.tsx` (`endedWithoutAnswer`), `VersionNav.tsx`.
Put a "Try again" button inside the amber notice invoking `onRerun`; replace bare `1 / 2` with "Answer 1 of 2" and note archived versions are session-only (cleared on thread switch).

## If you only do three things

1. **Make verification visible (1).** Plain-language verified/partial/low-confidence badge under every answer — the server already does the hard work; the UI hides it in a hover tooltip on a 10px dot.
2. **Show cited policy text in Sources (2).** Excerpts + cited-vs-consulted converts "links to PDFs" into actual verifiability — the purchase decision for a legal-aid customer.
3. **Human-usable output (4).** Copy-with-sources, print/PDF per answer, Markdown export. The first paying customer's workflow ends in a case file, not a chat window.
