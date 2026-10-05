# Working artifact from the privacy-compliance-product reviewer

## A. Data-flow map (what leaves the agent, under which setting, retained where)

Verified in code and installed packages unless marked (unverified). "User text" = the question a user types, plus whatever the client re-sends as history.

| # | Destination | Trigger / setting | What is sent | Identifiers sent | Retention at destination | Code |
|---|---|---|---|---|---|---|
| 1 | OpenAI Responses API - main agent | every chat turn; `AGENT_MODEL` default `gpt-5.6-terra` | system prompt, newest user question, guarded thread history / observer summaries, tool results (policy text) | none (no `user` / `safetyIdentifier` set anywhere) | `store` unset -> OpenAI default: Response objects kept "at least 30 days" (application state) + abuse logs up to 30 days; not used for training | `packages/agent/src/model.ts:41`, `index.ts:218` |
| 2 | OpenAI Responses - scope gate | every chat turn and research plan unless `SCOPE_GATE_ENABLED=false` | last 4 user/assistant messages, 300 chars each | none | as #1 | `processors/scope-gate.ts:34-56` |
| 3 | OpenAI Responses - prompt-injection detector (Mastra model router `openai/gpt-5-mini` -> `createOpenAI(...).responses()`) | every chat turn and research plan | user message text | none; `User-Agent: mastra/1.58.0` | as #1 | `index.ts:160-165`, `deep-research/agents.ts:58-63`; `@mastra/core/dist/models-dev-D8SVLexu.js:11531-11535` |
| 4 | OpenAI Responses - hallucination verifier | every answer (cannot be disabled in production); up to two passes | `## QUESTION`, `## ANSWER` (draft), `## SOURCE DOCUMENTS` | none | as #1 | `processors/verifier/verify.ts:93-117` |
| 5 | OpenAI Responses - observational memory observer/reflector (`openai/gpt-5.4-mini`) | when a thread crosses the observation token threshold; `OBSERVATIONAL_MEMORY_ENABLED` default true | conversation transcript of that thread | none | as #1 | `chat-memory.ts:27` |
| 6 | OpenAI Responses - deep research planner / workers / report writer | Deep Research runs | research question, sub-questions, findings, retrieved text | none | as #1 | `deep-research/agents.ts:42,76,100` |
| 7 | Anthropic Messages API | only if `AGENT_MODEL` / `DEEP_RESEARCH_MODEL` is `claude-*` | same as #1 / #6 | none | (unverified - vendor terms not checked) | `model.ts:43` |
| 8 | Voyage AI embeddings | every retrieval; the prefetch forces `resolveAnswerFrame` "with the latest user question verbatim" | verbatim user question and model-written search queries (`input_type: 'query'`) | none | Voyage ToS (updated 2026-05-27): perpetual licence incl. model training unless the account opted out (needs a payment method); after opt-out "immediately deleted ... after it is processed". Account opt-out state is not recorded in the repo | `policy-corpus.ts:33-47`, `processors/answer-frame-prefetch.ts:21-23` |
| 9 | Exa search | Deep Research workers, only when `EXA_API_KEY` is set (not in local `.env` names) | model-written web queries derived from the user's question | none | zero data retention is an Enterprise per-team option (Exa docs); default retention (unverified) | `tools/web-search.ts:42-45` |
| 10 | TypeSafe (Jev) | only when `SCOPE_GATE_PROVIDER=jev` (default `openai`) | the same 4x300-char conversation window as #2 | none | (unverified; secondary sources only) | `jev/scope.ts:17`, `policy-corpus/src/jev/client.ts:56` |
| 11 | Sentry - agent service | every `captureException` and 10% of requests (`tracesSampleRate` default 0.1) when `SENTRY_DSN` + `SENTRY_ENVIRONMENT` are set (mandatory for `PUBLIC_PRODUCTION`) | **up to 10 kB of the POST body** (chat messages, feedback comment, research question), URL, stack trace; request headers including `authorization: Bearer ...` and cookies are sent on the wire | bearer token (JWT carrying the WorkOS user id) on the wire; no client IP | Sentry plan retention (privacy page says 90 days; unverified). Sentry's default server-side scrubber redacts values whose key contains `auth` / `token` / `password`, so the header is probably redacted on ingest (project setting unverified); free text in the body is not scrubbed | `sentry.ts:35-43`; probes `sentry-probe.mjs`, `sentry-probe-stream.mjs` |
| 12 | Sentry - web server and browser | Next.js server + browser, 10% traces | errors, breadcrumbs (URLs, console), no Session Replay configured; server request data not probed | (unverified) | as #11 | `packages/web/src/instrumentation.ts`, `instrumentation-client.ts` |
| 13 | WorkOS | sign-in, token refresh, JWKS | name, email, sign-in metadata | account identity | WorkOS account | `packages/web/src/proxy.ts`, `auth-middleware.ts` |
| 14 | Railway - volume `/data/mastra.db` | always | threads, messages (incl. tool outputs), observer summaries, feedback comments, usage rows, rate-limit rows, research runs / checkpoints / workflow snapshots, answer-release signing key | WorkOS user id on every row | threads: until user deletes or 90 days idle; feedback 180 d; usage 400 d; rate-limit 25 h; research 90 d; observer summaries: no expiry (finding 4) | `storage/app-database.ts:195-247`, `runtime-config.ts:160-165` |
| 15 | Railway - stdout logs | always | event names + fields: `userId` on `chat.usage` and `rate_limit.blocked`; classifier free-text `reason` on `scope_gate.blocked`; web-search `query` on warn/error | WorkOS user id | Railway log retention (7 d Hobby / 30 d Pro per Railway's forum; unverified for this account) | `chat-route.ts:95-101`, `scope-gate.ts:93`, `tools/web-search.ts:38,56` |
| 16 | Railway bucket `agent/mastra/` via ops laptop | daily launchd job | **plaintext** `VACUUM INTO` snapshot of the whole chat store, downloaded to the laptop then uploaded | everything in #14 | 30 days of dated copies | `scripts/ops/backup-mastra.sh:40,70,76` |
| 17 | Neo4j (Railway private network) | every retrieval | query text as Cypher parameters | none | not persisted by the app | `packages/agent/src/neo4j.ts` |
| 18 | healthchecks.io | ops jobs | start/ok/fail pings; on failure the last 8 kB of the ops log | none | n/a (no user content expected) | `scripts/ops/lib.sh:36-43` |
| 19 | OpenAI / Anthropic / Voyage health probes | `/dependencyz`, cached | literal `"ok"` / probe text | none | n/a | `health.ts:56-70,98-110` |
| 20 | Pipeline (offline): Voyage, Anthropic judge, OpenAI/Anthropic AI review, TypeSafe | corpus builds and evals only | corpus text and golden questions; no user text | none | n/a | `packages/pipeline/src/pipeline/**` |

Not present (good): no analytics or advertising scripts, fonts self-hosted, only the WorkOS session cookie and a `theme` cookie, no Session Replay, Mastra trace store off in production.

## B. Privacy page / terms statement ledger

| Statement (file:line) | Actual behaviour | Verdict |
|---|---|---|
| "Conversations are kept until you delete them." (`privacy/page.tsx:80`) | Threads idle 90 days are deleted at boot and daily (`runtime-config.ts:161`, `app-database.ts:241`, `index.ts:91-92`); variable undocumented outside the code | False |
| "Deleting a thread from the sidebar deletes its stored messages." (`:80-81`) | True for messages and the thread's observer record (`@mastra/memory` 1.26.1 `deleteThread` -> `clearObservationalMemory`). Copies persist: 30-day plaintext backups, OpenAI stored responses (30 d), Sentry events, `usage_events.thread_id` (metadata, 400 d) | True but incomplete |
| "Assistant memory ... across your own conversations ... your role or the programs you ask about" (`:33-35`) | Working memory is disabled (`chat-memory.ts:29`); observational memory defaults to thread scope (`@mastra/memory` `this.scope = config.scope ?? "thread"`). Nothing is carried across conversations. `RUNBOOK.md:25,84` repeat the stale claim | Stale (over-discloses) |
| "Feedback. Ratings and comments" (`:38`) with no retention stated | 180 days, or sooner when the thread is deleted/expired; never read by anyone (finding 8) | Incomplete |
| "Usage and error records. Request counts ... and error reports via Sentry" (`:41-42`) | Usage rows carry user id, thread id, model, tokens, cost for 400 days. Sentry also receives request bodies and 10% traces (finding 2) | Understated |
| "Rate-limit records are pruned automatically after roughly a day." (`:84`) | 25 hours | True |
| Subprocessor list (`:66-70`) | Omits Exa (when `EXA_API_KEY` set) and TypeSafe (when `SCOPE_GATE_PROVIDER=jev`) | Incomplete |
| "These providers process data to provide their service to us" (`:73`) | Voyage's default terms also grant a training licence unless opted out; opt-out not evidenced in repo | Unverified / likely inaccurate |
| "All inference providers we use are US-hosted." (`:74`) | No region pinning or data-residency setting in code; vendor-side assertion only | Unverifiable from repo |
| "Account deletion ... contact us" (`:90-91`) | Manual; the runbook SQL leaves messages, observer rows and research data; `deleteUserData` has no caller (finding 4) | Process gap |
| "Backups are restricted to operational use." (`:98-99`) | Daily plaintext copy via a laptop to a bucket, 30 days (finding 5) | Incomplete |
| "not a HIPAA business associate ... should not submit protected health information" (`:104-106`) | Consistent with the design; the only technical control is a regex screen that misses names/addresses/diagnoses (finding 1) | Position stated; control weak |
| Terms: "delete your conversations at any time" (`terms/page.tsx:116`) | True for chat threads; Deep Research runs have no delete or list route (`deep-research/routes.ts:131-136`) | Partly false |
| Both pages: "Last updated July 10, 2026" (`lib/legal.ts:7`) | Retention (2026-07-23, `dbdf823`), the identifier screen (2026-07-24, `3add794`) and the memory change (2026-09-22, `7012c5c`) all landed afterwards | Stale |

## C. HIPAA and adjacent regimes - reasoning and assumptions (not legal advice)

Assumptions: the operator is Queen City Cortex LLC, a software vendor; no BAA with any vendor is recorded in the repo; customers are legal-aid organisations first.

1. Covered entity: no. The operator is not a health plan, clearinghouse or provider conducting standard transactions (45 CFR 160.103).
2. Business associate: status follows function, not paperwork. A vendor that maintains PHI on behalf of a covered entity is a business associate whether or not a BAA exists; a "do not submit PHI" clause allocates contractual blame but does not change that.
   - Legal-aid organisations are generally not covered entities. Client health information they hold as the client's lawyer is confidential under Rule 1.6, but it is not PHI held for a covered entity, so the product is not their business associate. Exception to check per customer: medical-legal partnerships, where the legal-aid partner may itself be a business associate of a hospital.
   - Case managers employed by prepaid health plans, LME/MCOs, care-management agencies or providers are covered-entity workforce. If one pastes member details, the covered entity has disclosed PHI to a vendor without a BAA, and the vendor is storing it (SQLite, backups, OpenAI stored responses, Sentry). The landing page and prompt market to "case managers", so this is the segment that creates HIPAA exposure.
   - County DSS workers: federal Medicaid safeguarding rules (42 CFR 431 Subpart F) and state public-assistance confidentiality law apply to them rather than HIPAA (state citation not verified here).
   - Beneficiaries describing their own situation: not PHI under HIPAA; FTC Act s.5 / N.C.G.S. 75-1.1 apply to the accuracy of the privacy statements, which is why the ledger in section B matters.
3. Practical posture today: "not a HIPAA service" is defensible for legal-aid customers only if the confidentiality story is true in fact: prompts not retained by vendors beyond necessity, no content in error tooling, deletion that deletes, encrypted backups. Findings 2, 4, 5, 6 and 7 are the gap between the statement and the fact.
4. To sell to covered-entity case managers later: BAA + zero data retention with OpenAI (OpenAI's data-controls page discusses BAA coverage in terms of ZDR-enabled projects), BAAs with the host (Railway advertises a BAA add-on), error tooling and auth vendors, Voyage opt-out or replacement, and an org-level tenant model. None of that is needed for the first legal-aid customer.
5. Regardless of HIPAA: SSNs and similar identifiers of NC residents in the chat store bring the NC Identity Theft Protection Act breach-notification duty into play (N.C.G.S. 75-65; citation from memory, not re-verified); the repo has no incident-response or breach-notification runbook.

## D. What a legal-aid security questionnaire will ask that the repo cannot answer today

Framed by NC State Bar 2024 Formal Ethics Opinion 1 (lawyer must vet a third-party AI vendor's handling, retention, destruction on termination, and any proprietary claim over submitted information).

1. Subprocessor register with purpose, data categories, region, retention and contract status (DPA/BAA) for OpenAI, Voyage, WorkOS, Railway, Sentry, and conditionally Anthropic, Exa, TypeSafe. No such document exists; the privacy page list is incomplete.
2. "Do your AI vendors retain or train on our prompts?" Today: OpenAI retains 30 days by the app's own default; Voyage may train unless an unrecorded opt-out was made.
3. Retention schedule per data class including backups and vendor copies, and a deletion SLA with confirmation. The code has numbers; the policy text contradicts them; backups add 30 days.
4. Return and destruction of data on termination or change of ownership (FEO 1 lists this explicitly). No bulk export, no org-level delete, no clause in the terms.
5. Encryption at rest and key management for the volume, bucket and backups. The chat backup is plaintext; platform-level encryption is not documented in the repo.
6. Who can access production data, from which devices, with what MFA; access logging. A single founder's laptop runs backups and holds bucket credentials; no access log or policy is documented.
7. Incident response and breach notification commitments, with a contact. None documented.
8. Tenant model: organisation accounts, roles, SSO enforcement, admin visibility, per-org settings. None (finding 10).
9. Audit trail of answers relied upon: timestamp, sources, versions, verification result, export. Partial (finding 9).
10. Independent assurance: SOC 2, penetration test, vulnerability management. None documented.
11. Availability and recovery: RPO/RTO for the chat store, restore drill evidence for the chat store specifically.
12. Legal status: terms and privacy pages are drafts pending attorney review (`lib/legal.ts:4`); the source-site terms analysis also says attorney review is required before commercial launch (`docs/legal/terms-of-use-analysis.md:4`); liability cap is $100 (`terms/page.tsx:110`).
13. AI governance: model and corpus version behind each answer, evaluation evidence for accuracy and for declining individual determinations, human-review policy for user content (the runbook says "never for content review", which also blocks the feedback loop).

## E. Probe receipts (all offline, scratch directory only)

- `retention-probe.mts` - real `@mastra/libsql` 1.14.0 schema + repo `AppDatabase`.
  - A (thread idle 120 days, default policy): before `threads 1, messages 1, observational_memory 1, feedback 1, usage 1, research_runs 1, workflow_snapshot 1`; after `threads 0, messages 0, observational_memory 1, feedback 0, usage 1, research_runs 0, workflow_snapshot 0`. Surviving row: `lookupKey "thread:t-old"`, `activeObservations "OBSERVATION_SENTINEL: user is a case manager asking about client X"`.
  - B (`deleteUserData`): every table 0.
  - C (RUNBOOK.md:94-97 SQL): `messages 1` (content `USER_TEXT_SENTINEL`), `observational_memory 1`, `workflow_snapshot 1`, `research_runs 1` remain.
- `sensitive-probe.mts`, `sensitive-probe2.mts` - repo `findSensitiveIdentifiers`.
  - Flagged `member_id`: "Does Medicaid non-emergency medical transportation cover trips to dialysis?", "What must the notice say when Medicaid notifies a beneficiary of a reduction in services?", "What are the member notification requirements when a health plan terminates a provider?", "What happens when a beneficiary no longer meets the nursing facility level of care?", "How does NC Medicaid identify the authoritative version of a clinical coverage policy?", "Where does the Medicaid ID number appear on an approval notice?".
  - Flagged `ssn`: "...Raleigh, NC 27699-2501?"; flagged `phone`: "Is 888-245-0179 still the NC Medicaid Contact Center number...".
  - Not flagged: "My client Maria Gonzalez, 67, of 412 Elm St Durham, has stage 4 renal failure and $3,100 in a Wells Fargo account. Is she eligible for MAABD?".
  - Second-turn body shaped like `use-chat-thread.ts:89-96` with a prior answer containing a phone number: `["phone"]`.
  - Saved real answers: 4 of 500 (10 full runs, 2026-07-09/10) contain a trigger, all `member_id` ("beneficiary no longer", "Medicaid identifies", "Medicaid notifies"); 0 of 55 golden questions.
- `chat-error-probe.mts` - repo `parseChatError` on the 422 body: `{"kind":"generic"}`.
- `sentry-probe.mjs` - `@sentry/node` 10.75.3, same option set as `sentry.ts`, stub transport (nothing sent), Hono node server: both the error event and the transaction carried `request.data` with the question text, `request.headers.authorization = "Bearer TOKEN_SENTINEL"` and the cookie. `sentry-probe-stream.mjs` repeats it with the exception captured mid-stream after the handler returned a streaming Response (the shape of `chat-route.ts:127-131`): same result. `sentry-probe-fixed.mjs` with `httpIntegration({ maxIncomingRequestBodySize: 'none' })` plus header-stripping `beforeSend` / `beforeSendTransaction`: none present.
- `regex-fix-probe.mjs` - candidate `ssn` / `member_id` patterns: all 7 true cases hit, all 10 false-positive cases clean.
- Live checks 2026-10-04: `https://queencitycortex.com/crawler-info` returns 404; OpenAI data-controls page; Voyage terms of service; NC.gov terms; NC State Bar 2024 FEO 1.

Scratch directory: <review scratch directory, not kept>/privacy-compliance-product
