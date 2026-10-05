# Chat request path: prompt, tools, input gates and runtime: all issues

The request path holds where it protects answer release: the server discards client-supplied history, the verifier keeps its own evidence and question, and gate blocks show only fixed text. The main risk is everything that depends on conversation context. Under the default observational-memory configuration the coverage boundary and scope gate see only the newest message, and retrieval, planning and verification of a follow-up all run on the bare last message, while tests and benchmarks are single-turn and cannot detect it. Separately, the identifier screen blocks ordinary Medicaid wording today and the interface hides the reason. Most impacts were shown with mock models or by running functions offline; none was observed in production. I would fix the identifier screen first, then supply stored history to the gates, then add two-turn tests before changing the prefetch.

## What is working

- The server reduces client input to the newest user message's text parts (`packages/agent/src/answer-release.ts:48-53`), so client-supplied history, tool evidence and non-text parts never reach the model.
- The verifier keeps tool evidence in request-local state (`packages/agent/src/processors/verifier/processor.ts:48-62`) and the route pins the question in request context (`packages/agent/src/chat-route.ts:49-50`), so verification survived the compaction and eviction reproduced in probes.
- Gate blocks carry fixed, human-written messages (`packages/agent/src/processors/message-length-guard.ts:5-8`, `scope-gate.ts:95-99`, `coverage-boundary.ts:30`), and the web renders only those; model-written reasons are never shown to users.
- Client disconnect is wired end to end: `packages/agent/src/chat-route.ts:114` passes the request signal to the agent stream, and `packages/agent/src/processors/verifier/verify.ts:97` combines it with the verifier deadline.
- One scope description feeds both the system prompt and the scope classifier instructions (`packages/agent/src/prompt.ts:38-42`, `packages/agent/src/processors/scope-gate.ts:25`), with a test, so the two layers cannot drift on what is in scope.
- The rate limiter decides and records in a single conditional INSERT (`packages/agent/src/rate-limit/repository.ts:64-108`), so a burst cannot exceed the window, and it fails closed in production.

## High severity

### CHAT-1 · Identifier screen rejects ordinary Medicaid questions and follow-ups, and the UI hides why

**high** · effort S · live failure, user experience, privacy, reliability

`packages/agent/src/chat-route.ts:33` runs `findSensitiveIdentifiers` over the whole request body, which the web client fills with the entire thread, although the server keeps only the newest user message. The member-identifier rule at `packages/agent/src/sensitive-data.ts:13` matches phrases such as "Medicaid non-emergency" and "beneficiary no longer", and the Social Security rule matches a ZIP+4. The 422 response uses a nested error shape that `packages/web/src/lib/parse-chat-error.ts:39` cannot read. Run offline against the real functions, six ordinary phrasings were flagged, and 19 of 2,702 stored benchmark answers would block their thread.

**Impact.** A beneficiary asking about non-emergency medical transportation sees a generic error whose "Try again" button fails identically and uses up the 30-per-hour allowance. Threads of about 13 turns hit the 2 MiB body cap.

**Fix.** Call `trustedChatInput` first in `chat-route.ts`, screen only that newest user text and delete `extractText`. Adopt the member-identifier pattern that requires a digit and allows a "number" or "is" filler; make the unlabelled Social Security branch hyphen-only. Send only the last user message from `use-chat-thread.ts`. Move every agent error to the nested envelope and parse that shape only. Add the negative phrase table to `tests/sensitive-data.test.ts` and a two-turn case to `tests/chat-memory-http.test.ts`.

*What is and is not established: Reproduced offline with the repository's own functions, not in the deployed product. The phone, ZIP+4 and e-mail trigger appeared in none of 2,702 stored answers.*

Where: `packages/agent/src/chat-route.ts:33`, `packages/agent/src/sensitive-data.ts:13`, `packages/web/src/lib/parse-chat-error.ts:39`, `packages/web/src/lib/use-chat-thread.ts:89`

### CHAT-2 · Coverage boundary and scope gate never see earlier turns under default observational memory

**high** · effort M · wrong-answer risk, test gap, documentation, reliability

With observational memory on, the code default, Mastra passes input processors only the newest message. `coverageConversationQuery` at `packages/agent/src/processors/coverage-boundary.ts:26` and the four-message window at `packages/agent/src/processors/scope-gate.ts:76` therefore never see history; unit tests hide this. In a probe using the real Mastra loop and a mock model, "And for February 2025?" after a Modified Adjusted Gross Income (MAGI) table question raised no limitation notice and gave the verifier no dated-source requirement. The scope gate also cuts the newest message to 300 characters. With memory off, the injection detector rescans every recalled message.

**Impact.** An attorney asking a dated follow-up can receive an answer drawn from the wrong period's income table, with the check that would withhold it inactive. Long messages are classified on their opening lines.

**Fix.** Read the last six to eight stored messages in `chat-route.ts` after the ownership check, set them on a server-owned request-context key, and have both processors combine them with `messages`. Narrow inheritance to date-only and language-only follow-ups. Pass the newest message to the classifier whole and set `lastMessageOnly: true` on both injection detectors. Add the two-turn regression test with observational memory on. The alternative, accepting latest-only and deleting the inheritance code and its documentation, leaves dated follow-ups unprotected.

*What is and is not established: Shown with a mock model; no wrong answer was observed. The deployed `OBSERVATIONAL_MEMORY_ENABLED` value was not checked. A second reviewer rated the scope-gate half medium.*

Where: `packages/agent/src/processors/coverage-boundary.ts:26`, `packages/agent/src/processors/scope-gate.ts:42`, `packages/agent/src/processors/scope-gate.ts:76`, `packages/agent/src/index.ts:160`

## Medium severity

### CHAT-3 · Follow-up turns are retrieved, planned and verified from the bare last message

**medium** · effort M · wrong-answer risk, test gap, cost, evaluation validity

`packages/agent/src/processors/answer-frame-prefetch.ts:14-23` forces a `resolveAnswerFrame` call on every turn with the latest message verbatim and copies that text into a system message. For "What about for children?" the router returns the general family with search terms "about" and "children". `packages/agent/src/processors/answer-frame-planning.ts:782` then injects "Use the structured frame as the answer outline" whenever a frame exists, even one without section text; section 2.2.1 is empty in 40 of 174 clinical policies on the older local graph. The verifier sees only the bare message, and no golden question or test covers a follow-up.

**Impact.** A user asking a follow-up may get an answer about a different programme that passes verification, or a withheld answer. A "thanks" costs an embedding, a hybrid search and a model round trip.

**Fix.** Make the step-0 message static and ask for a self-contained restatement when an earlier user turn exists. Build the checklist from the tool call's `query` argument. Inject the outline and "answer directly" lines only when a primary or supporting section has non-empty text. Give the verifier earlier user turns as context while keeping the raw question. Add unit tests for each, then two-turn evaluation cases. Reviews disagree on restating first turns and on skipping acknowledgements; decide both from that evaluation.

*What is and is not established: The wrong-programme outcome is inferred from routing output, not from a model run. Empty-section counts come from the older local graph.*

Where: `packages/agent/src/processors/answer-frame-prefetch.ts:14`, `packages/agent/src/processors/answer-frame-planning.ts:782`, `packages/agent/src/processors/answer-frame-planning.ts:821`, `packages/agent/src/chat-route.ts:49`

### CHAT-4 · Six-item checklist cap drops the under-21 EPSDT directive on adult-exclusion questions

**medium** · effort S · wrong-answer risk, test gap

`buildChecklist` at `packages/agent/src/processors/answer-frame-planning.ts:776` concatenates scope, route and family rules and cuts the list to six. The directive to read and cite the Early and Periodic Screening, Diagnostic and Treatment (EPSDT) section before concluding that a service is not covered is the last coverage rule, so it is cut when the frame has an avoid section, a coverage-scope notice, or the deterministic-evidence lane. The unit test at `packages/agent/tests/processors/answer-frame-planning.test.ts:924` passes only because its fixture uses a route the router does not produce.

**Impact.** A case manager asking whether a service is covered for adults may get a "No" that omits the exception for beneficiaries under 21.

**Fix.** Add a `pinned` flag to checklist rules; mark the EPSDT rule, the numeric-evidence rules and the coverage-scope items as pinned; and apply the limit only to unpinned items. Delete the five per-family slices, which the final slice makes redundant. Change the EPSDT test fixture to the router's real route with one avoid section.

*What is and is not established: Reproduced on the pure function with the router's real route. How often live coverage frames carry avoid sections is inferred from code; the section stays listed as supporting.*

Where: `packages/agent/src/processors/answer-frame-planning.ts:776`, `packages/agent/src/processors/answer-frame-planning.ts:292`, `packages/agent/tests/processors/answer-frame-planning.test.ts:924`, `packages/agent/tests/helpers/answer-frame-fixtures.ts:36`

### CHAT-5 · A failed frame lookup makes the planner reuse the previous turn's frame

**medium** · effort S · wrong-answer risk, reliability, test gap

`latestToolResult` at `packages/agent/src/processors/message-utils.ts:45` scans the whole message list, so when the current turn's `resolveAnswerFrame` call throws, `packages/agent/src/processors/answer-frame-planning.ts:824` builds the plan from the prior turn's result. In a probe covering both memory modes, a hearing-aid follow-up with the tool failing received a system instruction to cover the denture sections first. The verifier's `extractSources` loop at `packages/agent/src/processors/verifier/evidence.ts:393` does not restrict evidence to the current turn either.

**Impact.** During a Neo4j timeout, a follow-up question can be answered from the previous question's evidence under a system-level instruction to do so.

**Fix.** Make `latestToolResult` turn-scoped: find the last user message and scan only later messages for a result-state invocation of the named tool. Add a planner test in which the second turn's frame tool fails and assert that no plan from the first turn is injected. Do not move the capture to `processToolResult`; in the installed `@mastra/core` 1.58.0 it is dispatched only to output processors.

*What is and is not established: Reproduced in a mock-model probe with a forced tool failure. No live failure or wrong released answer was observed.*

Where: `packages/agent/src/processors/message-utils.ts:45`, `packages/agent/src/processors/answer-frame-planning.ts:824`, `packages/agent/src/processors/verifier/evidence.ts:393`

### CHAT-6 · Prompt, planner and verifier require citing template boilerplate as scope and exclusion evidence

**medium** · effort M · evaluation validity, wrong-answer risk, documentation

`packages/agent/src/prompt.ts:20-21`, `packages/agent/src/processors/verifier/verify.ts:66` and `packages/agent/src/processors/answer-frame-planning.ts:282-283` tell the model to cite section 2.1.x as a policy's scope and section 4.1 as its not-covered evidence. On the local graph, 175 of 177 section 2.1.1 texts are enrolment boilerplate and all 177 section 4.1 texts are the generic template. Ten of 55 golden questions have only those sections as primary evidence. In the September milestone no released negative answer cited 2.1.1 and eight cited section 1.0. A round-two study found that recorded frames never contain the pair.

**Impact.** An attorney reading a "not covered" answer sees a section 4.1 citation that does not name the service, and correct answers citing section 1.0 are scored against references that misattribute the scope.

**Fix.** Follow the round-two study and do not preserve the pair. Delete `prompt.ts:21`, and reword `prompt.ts:20`, `verify.ts:66` and the planner lines at 282-283 and 715 to require the section whose text supports the yes or no, or the description section when the policy does not address the service. Update `docs/development/gotchas.md:114`. Land this with the frame-selection change and the relabelled golden negatives as one versioned benchmark change, then re-baseline before the next qualification freeze.

*What is and is not established: Counts come from the older local July graph and the stored September run. No wrong released answer was shown, and the frame-fix prototypes were approximations.*

Where: `packages/agent/src/prompt.ts:20`, `packages/agent/src/processors/verifier/verify.ts:66`, `packages/agent/src/processors/answer-frame-planning.ts:282`, `docs/development/gotchas.md:114`

### CHAT-7 · Coverage-scope regexes refuse unrelated questions, and every undated MAGI question from 2027-01-01

**medium** · effort M · deadline 2026-12-31 · live failure, user experience, test gap, reliability

`resolveCoverageScope` in `packages/policy-corpus/src/scope/coverage.ts` matches unanchored substrings, and a match makes `packages/agent/src/processors/coverage-boundary.ts:29` abort with a fixed notice and no log line. Run with the current date, it refused "I make $2000 a month. What is the MAGI income limit for a family of 3?", reading 2000 as the year, and a home-health question that mentions COVID. `packages/policy-corpus/src/scope/policy.json:81` ends table support on 2026-12-31, and no test or reminder tracks that date. None of the 105 benchmark questions resolves to a coverage scope, so evaluations cannot detect either problem.

**Impact.** Beneficiaries who state their income, or mention COVID alongside home care, receive a refusal notice instead of research. From January 2027 the refusal covers every undated income-limit question.

**Fix.** Make one batched change, because any edit invalidates scope approvals. Strip money amounts and birth years before the year scan, require an income-limit phrase with word boundaries, require a test word in the COVID branch, and drop bare "before" and "after" from the no-date fallback. After the documented review, extend `supported_until` to 2027-03-31. Add the reviewers' sentences as negative cases in `tests/answer-scope.test.ts`, plus a real-clock test that fails 45 days before the bound. Log `coverage_boundary.blocked` without query text.

*What is and is not established: Reproduced by running the resolver directly, not through the deployed chat. The 2027 refusal is latent until the date passes; refusals fail closed, so no wrong answer results.*

Where: `packages/policy-corpus/src/scope/coverage.ts:17`, `packages/policy-corpus/src/scope/coverage.ts:64`, `packages/policy-corpus/src/scope/policy.json:81`, `packages/agent/src/processors/coverage-boundary.ts:29`

### CHAT-8 · Long research turns evict the question, frame and evidence from the generating model

**medium** · effort M · reliability, evaluation validity, test gap

Observational memory runs on library defaults at `packages/agent/src/chat-memory.ts:27`: at about 30,000 pending tokens it replaces the oldest messages of the turn, which are the user's question and the frame result, with an observer summary. The 128,000-token limiter at `packages/agent/src/index.ts:169` separately drops whole merged messages. The planner rebuilds its plan from the message list at every step, so the plan disappears too. Mock-model probes with forced observation and a lowered limit reproduced both. `docs/development/gotchas.md:153` records that only the verifier was hardened. Evaluation runs construct no memory and cannot detect this.

**Impact.** On a question that needs many section reads, the model continues from a summary instead of the retrieved policy text, which makes a withheld or thinner answer more likely.

**Fix.** Bound tool outputs first, using the lookup-tool caps described in the retrieval section. Then set `observation.messageTokens` above the largest bounded turn and an absolute retention floor in `chat-memory.ts`, and read the planner's question from `CHAT_VERIFICATION_QUESTION`. Add a case to `tests/chat-memory-http.test.ts` using its forced-observation knob, asserting that the step-2 input still holds the question, the plan marker and the raw tool results. Stop when it passes; skip custom trimmers and token budgets.

*What is and is not established: Reproduced only with forced-observation and lowered-limit settings and a mock model. The production trigger, a frame plus roughly eight to ten full section reads, is an estimate.*

Where: `packages/agent/src/chat-memory.ts:27`, `packages/agent/src/index.ts:169`, `packages/agent/src/processors/answer-frame-planning.ts:821`, `docs/development/gotchas.md:153`

### CHAT-9 · Web chat strips the model's reasoning items between tool steps; evaluation runs keep them

**medium** · effort S · evaluation validity, cost, test gap

The verifier's interim branch at `packages/agent/src/processors/verifier/processor.ts:65-70` removes `reasoning` parts along with interim text whenever a step ends in tool calls. The command-line path used by answer evaluations has no output processor (`packages/agent/src/index.ts:179`), so it replays reasoning references and the web path does not. An offline run against a stub fetch showed that the step-2 request differs between the two paths and that the verifier branch alone causes the difference. It appears only when the agent model emits reasoning items.

**Impact.** Evaluations that gate model choices and corpus releases would measure a request shape web users do not get, and web runs would re-derive their plan at each step at extra token cost.

**Fix.** Strip `reasoning` only in step segments that also contain a `text` part, and delete the progress-update line at `packages/agent/src/prompt.ts:114`. Add a stub-fetch regression test beside `tests/answer-release-mastra.test.ts`. Decide first whether OpenAI calls will set `store: false`, a separate privacy recommendation: with it the SDK sends no item reference, so the test must assert on inline reasoning content instead.

*What is and is not established: Latent: the finding says the deployed model is gpt-5.4 at effort none, which emits no reasoning items; that was not checked. The effect on answer quality was not measured.*

Where: `packages/agent/src/processors/verifier/processor.ts:65`, `packages/agent/src/index.ts:179`, `packages/agent/src/prompt.ts:114`

### CHAT-10 · A chat run has no deadline, and its step ceiling is 99

**medium** · effort S · cost, reliability, user experience

`server.timeout` at `packages/agent/src/index.ts:255` is applied through Hono's timeout middleware, which stops racing once the handler returns its streaming response; this was confirmed against the installed Hono. Nothing else bounds a run except client disconnect and `MAX_STEPS = 99` at `index.ts:181`, with a 128,000-token input limit per step. The value 99 came from a parity fix, not tuning; typical turns use about three requests. Comments in `packages/agent/src/neo4j.ts:12` and two other files claim a ten-minute bound that does not exist. An aborted stream ends without a withheld notice.

**Impact.** The owner's budget is exposed to a theoretical 12.7 million input tokens, about $32 at the repository's stated price, for one looping chat. A user whose run stalls sees a generic error.

**Fix.** Add a soft deadline in `createChatRoute` that forces synthesis through `onIterationComplete`, and a hard `AbortSignal.timeout` combined with the request signal, both environment-configurable and below Railway's five-minute idle cut. Make `gateAnswerStream` emit the withheld notice on abort, with a case in `tests/answer-release.test.ts`. Make the step ceiling an environment value, record steps per run, and set the default from the next planned benchmark; reviewers proposed 16 and 20 to 25 without measurement. Correct the four comments.

*What is and is not established: The worst case is theoretical; no runaway run was observed. Railway's limits were taken from its documentation and not tested.*

Where: `packages/agent/src/index.ts:255`, `packages/agent/src/index.ts:181`, `packages/agent/src/chat-route.ts:114`, `packages/agent/src/neo4j.ts:12`

### CHAT-11 · Scope and injection classifiers run without deadlines, and injection-detector failures go unreported

**medium** · effort S · reliability, cost, security

`classifyScopeWithOpenAI` at `packages/agent/src/processors/scope-gate.ts:51` is the first model call on every web turn and uses SDK defaults: no abort signal, two retries and default reasoning effort. It fails open only after those attempts finish. The verifier, by contrast, has a 30-second deadline, no retries and low effort. The `PromptInjectionDetector` at `packages/agent/src/index.ts:160` fails open with one unstructured `console.warn`, no structured log event and no Sentry report. No call or account has a spend ceiling beyond 30 messages per hour and 150 per day per user. Latency was not measured.

**Impact.** During an OpenAI slowdown every user waits before research starts. During a mini-model outage the operator gets no signal that injection screening is off.

**Fix.** Pass the request abort signal, a deadline of about 8 to 10 seconds and `maxRetries: 0` to the scope call. Build both detectors from one factory whose `onDetection` hook logs `prompt_injection.failed_open`, and document the fail-open policy. Treat low reasoning effort as a classifier change: bump the Jev `baselineConfiguration`, rerun the 200-conversation scope fixture and set the deadline from its latency. Add one global daily kill switch over `usage_events` in the rate-limit middleware.

*What is and is not established: No slowdown or outage was reproduced. A second reviewer rated the missing deadline low because both gates already fail open and there are no users yet.*

Where: `packages/agent/src/processors/scope-gate.ts:51`, `packages/agent/src/index.ts:160`, `packages/agent/src/deep-research/agents.ts:58`, `packages/agent/src/processors/verifier/verify.ts:97`

## Low severity

### CHAT-12 · `lookupPolicy` hands the model and verifier sibling policies and synthetic rows first

**low** · effort S · data quality, reliability

In all three saved 2026-09-22 gate runs, `lookupPolicy` for Policy 1A-2 returned 25 rows with 1A-2 tenth. Lookup blocks were about 25% of final-gate verifier evidence characters. The saved answers cited 1A-2 correctly.

**Impact.** The model could pick the wrong policy row, and the verifier reads avoidable evidence inside its fixed 30-second deadline.

**Fix.** Fix this through the combined exact-match lookup patch described in the retrieval section; change nothing in `packages/agent/src/processors/verifier/evidence.ts`. Add tool-path regression cases for `lookupPolicy('1A-2')`, which must return one row, and for '9'. Record the evidence-size measurement in issue #188 as input to the verifier-timeout diagnosis, and re-measure after the patch.

*What is and is not established: Corroborates lookup defects reported in the retrieval section; it is not a separate defect. Measured on stored September runs, and no saved answer was harmed.*

Where: `packages/agent/src/processors/verifier/evidence.ts:220`, `packages/policy-corpus/src/primitives/policy-lookup.ts:65`, `packages/pipeline/data/eval-results/milestones/2026-09-22-verified-release/final-gate-full.json`

### CHAT-13 · System prompt contradicts the tools and runtime and duplicates the citation block

**low** · effort S · needless complexity, reliability

`packages/agent/src/prompt.ts:5` tells the model to paste `citationLink`, a complete markdown link, as a URL. Line 114 requests progress updates the release gate discards, line 67 forbids the step-0 tool call, and the citation block is a drifted copy of `CITATION_GUIDANCE`.

**Impact.** The model has to guess which instruction wins, which adds run-to-run variance. Existing URL validation limits the citation risk.

**Fix.** Delete `citationLink` and tell the model to use the tool result's `url` unchanged. Replace the copied block with `CITATION_GUIDANCE` plus the effective-date bullet. Delete line 114, reword line 67 and update `tests/prompt.test.ts:33`. State the `getAmendments` rule once, with precedence over the frame hints. Confirm with a repeated answer evaluation on isolated observability storage.

*What is and is not established: The behavioural impact is inferred. `validateAnswerUrls` and the release gate already contain most of it.*

Where: `packages/agent/src/prompt.ts:5`, `packages/agent/src/prompt.ts:67`, `packages/agent/src/prompt.ts:114`, `packages/policy-corpus/src/document-metadata.ts:95`

### CHAT-14 · Pinned `@mastra/libsql` 1.14.0 leaves a thread-title race and deferred native connection cleanup

**low** · effort S · dependency, reliability

`packages/agent/src/chat-memory.ts:19` accepts core's read-modify-write `patchThread` fallback, so a rename during a running turn can revert. `@libsql/client` 0.17.4 releases each transaction's native connection, about 180 KB and two descriptors, only at a major garbage collection.

**Impact.** A user's thread rename can occasionally be undone. The memory effect is negligible because only clone, cancel and delete use transactions.

**Fix.** Upgrade `@mastra/libsql` within issues #145 and #149 to a release that depends on `@libsql/client` 0.18, tighten the guard to `store.supportsPartialThreadUpdate === true` in the same change, and update `tests/chat-memory-http.test.ts:220`. Re-run the transaction loop to confirm descriptors stay flat. Note in `docs/development/gotchas.md` that the presence of `patchThread` does not imply partial-update support.

*What is and is not established: Both were reproduced in scratch probes on the installed versions. The rename window is milliseconds, and no link to the parked production memory growth was established.*

Where: `packages/agent/src/chat-memory.ts:19`, `packages/agent/package.json:21`, `packages/agent/tests/chat-memory-http.test.ts:220`

### CHAT-15 · Deploys cut in-flight chat streams within five seconds

**low** · effort S · reliability, dependency

`@mastra/deployer` 1.45.0 handles SIGTERM by racing shutdown against five seconds and exiting, and `packages/agent/railway.json` sets no `drainingSeconds`, so Railway's default allows no drain. Every redeploy breaks active streams.

**Impact.** A user waiting for an answer during a deploy gets a connection error. With no users today this has no cost yet.

**Fix.** Fold this into the Mastra upgrade tracked in issue #145: once upgraded, set `server.drainTimeout` to 120 to 180 seconds in `packages/agent/src/index.ts` and `deploy.drainingSeconds` slightly higher in `railway.json`. Until then accept the behaviour and record it in `docs/development/gotchas.md`.

*What is and is not established: Read from the installed source and Railway documentation, not observed during a deploy. Confirm that `drainTimeout` exists in the upgraded version.*

Where: `packages/agent/src/index.ts:255`, `packages/agent/railway.json`
