# Privacy, compliance and product readiness: all issues

The trust boundary is sound: identity comes from the verified token, logs carry no user text, trace storage is off in production, and a complete account-deletion routine and a daily retention job exist. The main risk is that the product's privacy statements and controls do not match what the code does. The privacy page and runbook describe retention, memory and processors as they stood on July 10; retention, Sentry defaults, OpenAI response storage and backup leftovers each keep user text outside the controls the page describes. The identifier screen also rejects ordinary questions that quote a notice while letting spoken-form identifiers through. Nothing here was observed in production, and there are no users yet. I would first fix the identifier screen and the retention gap in `app-database.ts`, then the Sentry and OpenAI storage settings, then rewrite the privacy page and runbook in one pass before legal review.

## What is working

- Identity is bound on the server: `packages/agent/src/auth-middleware.ts:59-71` ties ownership to the verified WorkOS token and `packages/agent/src/chat-route.ts:57-60` rejects threads owned by another user.
- No user identifier is sent to any model or embedding vendor, and the scope gate sends only four messages of 300 characters each (`packages/agent/src/processors/scope-gate.ts:34-35`).
- Working memory is disabled with a stated reason (`packages/agent/src/chat-memory.ts:28-29`) and observational memory is thread-scoped by the installed default, so nothing crosses conversations; a user-initiated thread delete clears that thread's summary.
- `deleteUserData` (`packages/agent/src/storage/app-database.ts:249-291`) covers threads, messages, observational memory, research data and workflow snapshots; it needs only a caller.
- Logging carries event names and bounded fields without user text (`packages/agent/src/logger.ts:52-61`), Mastra trace storage is off in production (`packages/agent/src/runtime-config.ts:95-103`), and Sentry will not start without a declared environment (`packages/agent/src/sentry.ts:19-34`).
- The web app has no analytics, advertising scripts or session replay and sets only session and theme cookies (`packages/web/src/app/layout.tsx`, `packages/web/src/instrumentation-client.ts`); on-screen disclaimers appear on the landing page, empty state and composer.

## Medium severity

### PRIV-1 · Identifier screen rejects quoted notices and ordinary wording while missing spoken-form identifiers

**medium** · effort S · live failure, user experience, privacy, test gap

`packages/agent/src/sensitive-data.ts:12` rejects any message containing a phone number, so a question quoting the legal-aid number that state law requires on notices returns a 422 error; 89 of 317 notice-like files in the local parsed corpus are rejected. The member-ID rule at line 13 matches ordinary wording such as "beneficiary no longer" and "Medicaid no cubre"; 15 of 2,434 unique stored evaluation answers trip it, and a tripped answer in the posted history blocks the follow-up. "My Medicaid ID is 945123456K" and "My date of birth is 03/04/1960" pass.

**Impact.** A beneficiary or attorney who types what a denial letter says is refused without learning that the phone number was the cause, while identifiers given in a sentence reach storage and model vendors.

**Fix.** Screen only the newest user message in `packages/agent/src/chat-route.ts` and delete `extractText`. Redact phone numbers and e-mail addresses with a marker instead of rejecting; keep rejection for Social Security numbers, birth dates and member IDs. Tighten the member-ID pattern: no letter directly after the label, an optional "number" or "is" filler, and at least one digit in the value; allow the same filler for birth dates. Add Spanish, stored-phrase and blank-notice negatives to `packages/agent/tests/sensitive-data.test.ts`.

*What is and is not established: Measured by running the real screening function over the local parsed corpus and stored April-to-July evaluation answers; no live request was made, and the benchmark has no contact-detail question.*

Where: `packages/agent/src/sensitive-data.ts:12`, `packages/agent/src/sensitive-data.ts:23`, `packages/agent/src/chat-route.ts:33`, `packages/agent/tests/sensitive-data.test.ts`

### PRIV-2 · Conversation retention leaves each expired thread's AI summary, which a reused thread id inherits

**medium** · effort S · privacy, security, test gap

`runRetention` in `packages/agent/src/storage/app-database.ts:195-247` deletes threads idle for 90 days with their messages but never touches `mastra_observational_memory`, so the model-written summary of each expired conversation stays in the database and backups indefinitely. The storage adapter looks a summary up by thread id alone, and the chat route checks ownership only when a thread row exists. In a local reproduction with the production route and memory configuration, a second user who posted with the expired thread id received the first user's summary in their prompt. No test executes the thread deletes.

**Impact.** A user whose conversation expired still has a summary of it stored without limit, and another account that supplies the old thread id would have that summary fed to its model.

**Fix.** Add a statement to `runRetention`, before the thread delete and guarded by a table check, that deletes observational-memory rows whose `threadId` belongs to an expired thread. Add an age-guarded sweep after the thread delete for rows already orphaned. Keep raw SQL; do not route retention through `Memory.deleteThread`. Rebuild the test in `packages/agent/tests/storage/app-database.test.ts` on a real `LibSQLStore` schema, seeding one expired and one live thread and asserting only the first loses its rows.

*What is and is not established: Reproduced on a local LibSQL file, not in production. Cross-user exposure requires the second user to supply the old thread id, which is client-chosen and normally a random UUID.*

Where: `packages/agent/src/storage/app-database.ts:218`, `packages/agent/src/storage/app-database.ts:282`, `packages/agent/src/chat-memory.ts:27`, `packages/agent/tests/storage/app-database.test.ts:42`

### PRIV-3 · A refused question's first 60 characters are already stored as the thread title

**medium** · effort M · privacy, security

`packages/web/src/app/chat/page.tsx:138-141` creates the memory thread from the browser with the first 60 characters of the question as its title, then posts the question to `/chat`, the only place the identifier screen runs. The create call goes to Mastra's built-in `POST /api/memory/threads`, which `packages/agent/src/execution-gateway.ts:31` allows without screening. A question refused with a 422 error therefore leaves its opening text stored as a thread title and listed in the sidebar. Rate-limited or guard-blocked first messages leave an empty titled thread the same way.

**Impact.** A user who starts a chat with a client's name and Social Security number is told to remove it, yet that text stays in the database and backups until deletion or the 90-day purge.

**Fix.** Pass the thread to `handleChatStream` in `packages/agent/src/chat-route.ts` as an object carrying the id and a title cut from the screened question, so Mastra creates it after the screen. Delete `ensureThreadExists` from `packages/web/src/lib/use-chat-thread.ts` and the first-message branch in the chat page, and restrict the gateway rule to GET. Add a case to `packages/agent/tests/chat-memory-http.test.ts`: a first message containing a Social Security number returns 422 and leaves no thread row.

*What is and is not established: Established by reading the call order, not reproduced. Exposure is limited to 60 characters within the user's own account.*

Where: `packages/web/src/app/chat/page.tsx:139`, `packages/web/src/lib/use-chat-thread.ts:143`, `packages/agent/src/execution-gateway.ts:31`, `packages/agent/src/chat-route.ts:33`

### PRIV-4 · Sentry defaults send request bodies and thread titles to Sentry

**medium** · effort S · privacy, security, documentation

`packages/agent/src/sentry.ts:35-42` initialises Sentry with SDK defaults and a 0.1 trace sample rate. On the installed SDK (10.75.3) the HTTP integration attaches up to 10 kB of the request body, plus authorization and cookie headers, to every captured error and to one in ten requests. `RUNBOOK.md:37` and `:43` say the rate is 0 and errors only. Separately, the browser SDK in `packages/web/src/instrumentation-client.ts:25` records breadcrumbs containing the thread-rename input's `aria-label`, which holds the thread title.

**Impact.** Questions, re-sent thread history, feedback comments and research questions would sit in Sentry outside thread deletion and the 90-day purge, readable by anyone with dashboard access.

**Fix.** Add `Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' })` and `Sentry.requestDataIntegration({ include: { data: false, cookies: false, headers: false } })` in `packages/agent/src/sentry.ts`; do not use the `dataCollection` option, which turns unspecified fields on. Keep the 0.1 rate and correct the runbook and the header comment. In the web client add a `beforeBreadcrumb` that strips `aria-label`, `title`, `alt` and `name` values from `ui.` breadcrumbs. Test both with sentinel values and a stub transport.

*What is and is not established: Applies only if the Sentry variables are set on the agent service, which was not confirmed on Railway. SDK behaviour was read from source and probed locally; breadcrumbs travel only with a later error.*

Where: `packages/agent/src/sentry.ts:35`, `packages/web/src/instrumentation-client.ts:25`, `packages/web/src/components/ThreadSidebar.tsx:321`, `RUNBOOK.md:37`

### PRIV-5 · Every OpenAI call leaves prompts stored at OpenAI under the vendor default

**medium** · effort M · privacy, security

No OpenAI call sets `store: false`. The main model (`packages/agent/src/model.ts:41`), scope gate, verifier, two prompt-injection detectors (`packages/agent/src/index.ts:161`, `packages/agent/src/deep-research/agents.ts:59`) and observational memory (`packages/agent/src/chat-memory.ts:27`) all use the Responses API with storage left at the vendor default, under which each request becomes a stored response retrievable with the project key for at least 30 days. Deleting a thread in the app does not remove those copies.

**Impact.** A legal-aid customer asking whether AI vendors retain prompts must be told yes, by the application's own default, and thread deletion does not reach those copies.

**Fix.** Export one OpenAI factory from `packages/agent/src/model.ts` that applies `store: false` through default-settings middleware, and use it at every call site including the Mastra-owned detectors and observational memory. Add a fake-fetch test asserting `store` is false, run the agent build, and try one multi-step conversation on a thread created before the change. Decide first how this coexists with the separately proposed reasoning carry-over fix, whose test expects an item reference that storage-off requests no longer send.

*What is and is not established: Whether the OpenAI organisation already has Zero Data Retention cannot be checked from the code; the 30-day figure is the vendor's documented default, not an observation.*

Where: `packages/agent/src/model.ts:41`, `packages/agent/src/processors/verifier/verify.ts:99`, `packages/agent/src/index.ts:161`, `packages/agent/src/chat-memory.ts:27`

### PRIV-6 · Privacy page and runbook say conversations persist until deleted; the server purges them

**medium** · effort S · privacy, documentation, user experience, test gap

`packages/web/src/app/privacy/page.tsx:80` and `RUNBOOK.md:79` say conversations are kept until the user deletes them. Since July 23 `runRetention` runs at every boot and daily and deletes threads idle for 90 days, research runs at 90 days and feedback at 180 days. Three of the four retention variables in `packages/agent/src/runtime-config.ts:161` are documented nowhere. The page also describes memory across conversations, which the default configuration does not have, and states no period for feedback, usage rows (400 days), research runs or backups (30 days).

**Impact.** An attorney returning to a matter after a quarter finds the thread gone without notice, and a customer's retention questionnaire answered from the runbook states the opposite of what the system does.

**Fix.** Decide whether conversations expire after 90 idle days or persist until deleted; 90 days suits a store that can hold client details. If it stays, export the periods as constants from `packages/contracts`, remove the environment overrides, import the constants in the privacy page, and rewrite section 5 and `RUNBOOK.md:78-85` with every period and the per-conversation memory scope. If not, delete the thread-purge statements. Add a `runRetention` test with one old and one recent thread.

*What is and is not established: No override was found in the repository, but production variables were not inspected. The page currently renders with a draft banner, and there are no users yet.*

Where: `packages/web/src/app/privacy/page.tsx:80`, `RUNBOOK.md:79`, `packages/agent/src/runtime-config.ts:161`, `packages/agent/src/index.ts:91`

### PRIV-7 · Documented account-deletion procedure leaves user data; the complete routine has no caller

**medium** · effort S · privacy, documentation, test gap

The account-deletion procedure in `RUNBOOK.md:86-98` deletes the WorkOS user and runs four hand-written DELETE statements. It leaves observational-memory rows, thread state, research runs, checkpoints, budgets and workflow snapshots, and an operator cannot delete another user's threads through the memory API because the resource-binding middleware blocks it, so message text can remain too. `deleteUserData` in `packages/agent/src/storage/app-database.ts:249-290` removes all of these but is called only from tests, none of which checks observational memory or messages against the real Mastra schema.

**Impact.** A user who asks for deletion is told it is done while message text, conversation summaries and research reports remain in the database and each later backup, against the privacy page's promise.

**Fix.** Give `deleteUserData` one operator entry point and replace the runbook SQL with "delete the user in WorkOS, then run this command". Choose between a script that calls `deleteUserData` inside the container and one that prints the same statements as SQL for `sqlite3` over `railway ssh`; the second needs no new runtime in the image. Correct `docs/operations/answer-release-and-recovery.md:27`, state the 30-day backup lag on the privacy page, and test the routine against the real Mastra schema.

*What is and is not established: No deletion request has been received. Leftover research rows age out after about 90 days; observational-memory rows do not.*

Where: `RUNBOOK.md:86`, `packages/agent/src/storage/app-database.ts:249`, `packages/agent/src/auth-middleware.ts:48`, `docs/operations/answer-release-and-recovery.md:27`

### PRIV-8 · Failed backups leave full plaintext database copies on the agent volume indefinitely

**medium** · effort S · privacy, reliability, security

`scripts/ops/backup-mastra.sh:39-74` writes a full snapshot to `/data/mastra-backup-<date>.db` on the agent volume and removes it only as the last step. A failed download, integrity check or upload exits first, and later runs remove only their own date's file. Laptop logs show 4 of 46 past runs (about 9%) ended this way. Each leftover is a complete plaintext copy of conversations, feedback and the answer-release signing key that thread deletion, the 90-day purge and account deletion never reach.

**Impact.** A user who deleted a thread still has it in a leftover snapshot with no expiry, and the operator loses volume space equal to the whole database per failed run.

**Fix.** Sweep all `/data/mastra-backup-*.db` files inside the single quoted remote command before each snapshot. Register an exit hook right after the snapshot succeeds that removes the remote file and the local temporary directory and marks the run failed if removal fails; confirm removal with a sentinel, then drop the inline cleanup. Ship this with the fix for the currently failing backup job, because leftovers resume once snapshots succeed.

*What is and is not established: Leftover files are inferred from laptop logs and the script, not seen on the production volume. Today's data is test conversations, and the job currently fails before the snapshot step.*

Where: `scripts/ops/backup-mastra.sh:56`, `scripts/ops/backup-mastra.sh:73`, `scripts/ops/lib.sh:13`, `packages/agent/docker-entrypoint.sh:4`

### PRIV-9 · Exported answers lack case-file provenance; Deep Research reports cannot be exported or reopened

**medium** · effort M · user experience, data quality

`buildThreadMarkdown` in `packages/web/src/lib/thread-helpers.ts:145` records only the export date. It omits each answer's generation time, the verifier outcome and the effective and last-revised dates of cited documents, all of which are already stored or returned by tools. The corpus release id and model ids are not saved per chat answer. A Deep Research report has no copy or export action and no list route; its run id lives only in `sessionStorage`, so it is unreachable after the tab closes although the server keeps it for 90 days.

**Impact.** An attorney filing an exported thread cannot show when the answer was produced, whether verification passed, or which policy revision it cites, and loses a Deep Research report on closing the tab.

**Fix.** Print the per-answer generation time, verification status and source snippet in `buildThreadMarkdown`. Add `effectiveDate` and `lastRevised` to the web source types and show them in the Sources panel and export. Stamp the corpus release id as plain message metadata without changing the answer-release signature. Add one `GET /research/runs` route scoped to the user to restore the latest report, and a copy action. Leave the retrieved date out until the loader populates it.

*What is and is not established: A product gap found by reading the code; no customer has asked for it. The retrieved date was null for every document in the local graph, with production unchecked.*

Where: `packages/web/src/lib/thread-helpers.ts:145`, `packages/web/src/lib/message-sources.ts:26`, `packages/agent/src/tools/read.ts:24`

### PRIV-10 · Feedback is stored but never read, and comments skip the identifier screen

**medium** · effort M · privacy, evaluation validity, user experience

A thumbs-down and its comment are stored as ids plus text in the `feedback` table with no copy of the question or answer. Nothing reads them: there is no operator route, script, log line or alert, and `RUNBOOK.md:76` forbids opening the store for content review. Every upsert in `packages/agent/src/feedback/repository.ts:87-106` deletes feedback whose thread no longer exists, and retention removes the rest after 180 days. Comments of up to 2,000 characters skip the identifier screen applied to chat and research questions.

**Impact.** A case manager who reports a wrong answer is never heard, the evaluation set never grows from real failures, and a comment naming a client is stored unscreened.

**Fix.** Run `findSensitiveIdentifiers` on the comment in `packages/agent/src/feedback/routes.ts` and return the same 422 error. Log a text-free `feedback.negative` event after each thumbs-down. Add `packages/agent/scripts/feedback-review.ts` that prints negative ratings joined to surviving messages as a review queue for manual promotion into the golden dataset. State on the privacy page and under the comment box that rated exchanges may be reviewed, and amend the runbook sentence accordingly. Keep the current deletion behaviour.

*What is and is not established: Established by reading the code and searching for readers; no feedback from real users exists yet.*

Where: `packages/agent/src/feedback/repository.ts:91`, `packages/agent/src/feedback/routes.ts:42`, `packages/agent/src/storage/app-database.ts:203`, `RUNBOOK.md:76`

## Low severity

### PRIV-11 · Privacy page overstates vendor limits: unpinned regions, Voyage training licence, unlisted processors

**low** · effort S · privacy, documentation

`packages/web/src/app/privacy/page.tsx:73-74` says providers only process data for the service and all are US-hosted. No code pins a processing region, Voyage's terms license embedded queries for training unless the account opts out, and Exa and TypeSafe are unlisted.

**Impact.** A legal-aid customer relying on the page has no technical guarantee behind it, and questions embedded before a Voyage opt-out stay licensed to the vendor permanently.

**Fix.** Confirm the Voyage training opt-out before any real traffic, because it is not retroactive. Reword line 74 to "US-based providers", list Exa and TypeSafe as conditional processors, and record opt-out and region settings in `docs/operations/subprocessors.md`. Add a production startup check in `packages/agent/src/runtime-config.ts` that `OPENAI_BASE_URL` and `ANTHROPIC_BASE_URL` are unset or the vendors' own hosts.

*What is and is not established: Voyage opt-out status and vendor account region settings cannot be checked from the repository. Exa and TypeSafe receive text only when their environment variables are set.*

Where: `packages/web/src/app/privacy/page.tsx:73`, `packages/agent/src/policy-corpus.ts:42`, `packages/agent/src/tools/web-search.ts:42`, `packages/agent/src/jev/scope.ts:17`

### PRIV-12 · Printed and copied answers carry no disclaimer; professional eligibility requests are unevaluated

**low** · effort S · user experience, test gap, evaluation validity

Printed conversations and copied answers carry no disclaimer: the notice and composer footer are `print:hidden`, and `buildAnswerClipboardText` emits only the answer and sources. No golden case has a professional supplying client facts and asking for an eligibility outcome.

**Impact.** An answer printed for a client or pasted into an email loses the statement that it is not legal advice or an eligibility determination.

**Fix.** Add one print-only line in the chat column and append the same sentence to `buildAnswerClipboardText`; add "not legal advice" to the export header and composer line, covered by the existing unit tests. Add two or three attorney or case-manager fact-pattern cases to the golden dataset, and confirm the 55-question run required by issue #188 includes cases q-051 to q-054.

*What is and is not established: The missing disclaimer was read from the code. Whether the deployed model declines a professional's eligibility request is unmeasured.*

Where: `packages/web/src/components/DisclaimerNotice.tsx:27`, `packages/web/src/components/ChatInput.tsx:47`, `packages/web/src/lib/message-citations.ts:174`, `packages/web/src/lib/thread-helpers.ts:145`

### PRIV-13 · No organisation model: any account is authorised and every setting is deployment-wide

**low** · effort L · user experience, privacy

`packages/agent/src/index.ts:257` authorises any WorkOS account, sign-up is open, and rate limits, retention and memory are deployment-wide environment variables. No organisation id is recorded on usage, feedback or research rows.

**Impact.** A first legal-aid customer asking for staff-only sign-in, per-organisation usage, export or retention gets a manual operation on a shared database each time.

**Fix.** Decide the sign-up policy; for a closed pilot, disable sign-up in the WorkOS dashboard and use invitations. Record `user.organizationId` from the token claim in a nullable column on `usage_events`, `feedback` and `research_runs` now, and defer roles, per-organisation limits and administration until a paying organisation exists.

*What is and is not established: A known, deliberately deferred gap; it matters only once an organisation signs up.*

Where: `packages/agent/src/index.ts:257`, `packages/agent/src/auth-middleware.ts:48`, `RUNBOOK.md:102`
