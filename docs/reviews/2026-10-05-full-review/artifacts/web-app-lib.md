# Working artifact from the web-app-lib reviewer

## A. Route-protection matrix (web origin)

| Path | Through proxy.ts | Unauthenticated result | Notes |
|---|---|---|---|
| `/` | yes | 200 | public; `withAuth()` only labels the call to action |
| `/terms`, `/privacy` | yes | 200 | public; draft banner while `LEGAL_REVIEW_PENDING = true` (lib/legal.ts:4) |
| `/auth/callback` | yes | 200 / redirect | `handleAuth({ returnPathname: '/chat', baseURL })` |
| `/preview` | yes | 404 in production builds; gallery in dev | allow-listed; the gate is the `NODE_ENV` check in the page |
| `/chat` | yes | redirect to WorkOS | whole page is a client component; no page-level server check |
| any other path (`/foo`, `/next.svg`) | yes | redirect to WorkOS, not 404 | |
| `/_next/static/*`, `/_next/image/*`, `/favicon.ico`, `/sitemap.xml`, `/robots.txt` | no | served or 404 | no robots or sitemap file exists |
| Server actions (theme, AuthKit auth/token) | yes (POST to the current path) | follows the page's rule | dispatched one at a time by Next |

## B. Browser to agent calls (cross-origin, Bearer token)

| Call | Code | credentials | Error surface |
|---|---|---|---|
| POST `/chat` | `DefaultChatTransport` (use-chat-thread.ts:82-97) | include | `parseChatError`: flat `{error, message}` only |
| `/api/memory/threads*` | `MastraClient` via `runWithFreshAuth` | default | sidebar text; one refresh + retry on a "401" substring |
| `/feedback` | fetch (feedback-client.ts) | include | optimistic revert, silent |
| GET `/corpus-status` | fetch every 60 s | include | silent |
| `/research/runs*` | fetch, poll every 1.5 s | default | message shown; any failure is terminal |

## C. What the chat UI shows per release state

| State | Parts in the message | Rendered |
|---|---|---|
| tools running | tool parts | step cards and "label · step N" narration |
| drafting (text gated server-side) | unchanged | the last tool's narration keeps spinning |
| verifying | status `verifying` | "Checking the answer against sources…" plus the stale narration |
| passed | status `passed` + text | answer, green "Verified against cited sources", collapsed trail, Sources with telemetry dot |
| corrected | status `corrected` + text | answer, green "Corrected and verified…"; dot can be amber or red with "Verifier rewrote the answer." |
| withheld by verifier | status `withheld` + fixed text | fixed notice and "Try again"; no badge; dot text "low (0%)… All checks passed without rewrite." |
| withheld by gate (no release) | status `withheld`, reason `unavailable` | fixed notice and "Try again"; no dot |
| blocked by input guard | `data-tripwire` | amber blocked message |
| transport or stream error | none | "Sorry, there was an error…" and "Try again" (regenerate) |
| stopped, or tools without text | tool parts only | "The agent finished without a final answer… transient API error" and "Try again" |

## D. Live stream versus restored thread

| Aspect | Live | Restored |
|---|---|---|
| Inline footnotes, trail collapse, release badge | yes | yes (F-RESTORE-001 fixed in-app) |
| Sources confidence dot | yes, from telemetry fields | absent |
| Message id | stream `start` id (first response message) | id of the answer-bearing persisted message (inferred to differ) |
| Blocked (tripwire) notice | yes | dropped |
| Re-run versions | client-only pager | Q, A1, Q, A2 |
| Feedback thumbs | optimistic | reloaded on the database path only, not on cached restore |
| History depth | everything streamed this session | newest 40 persisted messages |
| "Generated" timestamp | no | yes |
| Markdown export | n/a | per-message conversion; citations stripped |

## E. Measurement ledger

Source: a local SQLite snapshot of the agent database (17 threads, July to September 2026), read immutably; only counts, sizes, part types and public corpus metadata were extracted. It may not represent production usage.

| Measure | Value |
|---|---|
| Persisted messages | 99 (26 user, 73 assistant); 3.8 per user turn; up to 10 for one turn |
| Messages in the only 10-turn thread | 32 (default page is 40) |
| Next `/chat` request body after restoring that thread | 1,545,207 bytes (cap 2,097,152) |
| Next request body for single-turn threads | 98 KB to 356 KB |
| Assistant messages that are tool-only | 36 |
| Text-bearing assistant messages with no tool part | 12 of 31 |
| Turns whose answer message is the last persisted assistant message | 20 of 23 |
| Inline citations in stored answers | 382: 138 "Policy X § n", 114 "Policy X …", 85 "42 CFR …", 8 "SSA …", 37 other |
| Stored answers that would trip the identifier screen as history | 0 of 38 (tool invocations: 0 of 276; golden reference answers: 0 of 55) |
| Stored searchSections item keys | sectionId, title, policyNumber, documentType, contentSnippet, score (no url) |
| Stored federal section shape | policyNumber `42-CFR-441`, sectionNumber `441.56`, url `https://www.ecfr.gov/current/title-42/part-441` |

Throwaway scripts are in the scratch directory: `history-screen-probe.ts`, `body-size-probe.ts`, `export-probe.ts`, `citation-probe.ts`, `error-and-verification-probe.ts`, `sentry-breadcrumb-probe.mjs`, and the counting helpers.
