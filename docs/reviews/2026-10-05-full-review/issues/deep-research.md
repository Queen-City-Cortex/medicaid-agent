# Deep research: all issues

Deep research fails closed: run state changes are single guarded database statements, every route is scoped to the signed-in user, and no unverified draft leaves the server. What has not been shown is that a run can finish at default settings. Reflection prompts over 10,000 characters trip a chat-input guard, the report is verified under the chat verifier's 30-second deadline, one withheld worker finding ends the run, and an interrupted synthesis cannot recover. Every test replaces the three agents with stubs, and the only recorded live run used one sub-question with reflection off. Each failure also spends one of two daily starts, and closing the tab at the approval card locks the user out for up to 90 days. I would fix the reflection guard, the lockout and the start-counting rule first, then record one live run at default limits before touching report verification, and simplify the duplicated durability layers last.

## What is working

- Run state changes are single compare-and-set statements (`create` at `packages/agent/src/deep-research/repository.ts:113-137`, `acquire` at `:186-199`), and every write by executing code is fenced on lease owner and expiry, so cancelled or superseded work cannot publish.
- Unverified drafts stay private at the route: a report is exposed only for a completed run whose verification is not withheld (`packages/agent/src/deep-research/repository.ts:79`), `complete()` refuses an unverified report (`:297`), and error text is whitelisted before storage (`:320`).
- Ownership is enforced on every route from the token-bound user (`packages/agent/src/deep-research/routes.ts:34`), reads and cancel filter on `resource_id` (`packages/agent/src/deep-research/repository.ts:153`, `:249`), and a run that is missing or not owned returns the same 404.
- The approved plan is committed in the same statement as the execution claim (`packages/agent/src/deep-research/service.ts:253-266`), and verifier outages are kept out of the checkpoint cache so they are never replayed as verdicts (`packages/agent/src/deep-research/workflow.ts:198-199`).
- `checkpointed()` (`packages/agent/src/deep-research/checkpoints.ts:34-48`) gives memoised, corpus-checked steps in 15 lines, and the recovery suite runs the real Mastra workflow against file-backed SQLite (`packages/agent/tests/deep-research/recovery.test.ts`).
- The report view renders only http and https links as anchors (`packages/web/src/components/DeepResearchReport.tsx:63-75`) and shows a neutral note, not a pass, when no citations were checked (`:12-24`).

## High severity

### RSRCH-1 · Reflection prompts over 10,000 characters trip the planner's chat-input guard and fail the run

**high** · effort S · reliability, test gap

The reflection step reuses `deepResearchPlannerAgent` (`packages/agent/src/deep-research/workflow.ts:369`), which carries `MessageLengthGuard`, the scope gate and the prompt-injection detector (`packages/agent/src/deep-research/agents.ts:55-58`). When the prompt, which is the brief plus every finding, exceeds 10,000 characters, the guard returns a tripwire, the model is never called, and `ReflectionSchema.parse` throws a non-retryable error. Reflection runs by default whenever a plan has fewer than six sub-questions. A reviewer's simulation from chat answer lengths put 41% of four-finding prompts and 71% of five-finding prompts over the limit.

**Impact.** A user loses a multi-minute run after all worker spend, sees only 'Research could not be completed', and has used one of two daily research starts.

**Fix.** Pass `inputProcessors: []` on the reflection `generate` call; `docs/development/gotchas.md:33` already rules out classifying internal reflection prompts. On a tripwire or parse failure, log `deep_research.reflection_skipped` and proceed to synthesis instead of throwing. Remove `MessageLengthGuard` from the planner; the start route already enforces the cap. Add a test driving the real planner `Agent` with a mock model and a findings prompt over 10,000 characters. Ship the pruned-plan reflection fix with this, because reflection will then run more often.

*What is and is not established: The failure was reproduced offline with the real agent and guard. The 41% and 71% rates come from a simulation that was not reproduced; no live run was observed.*

Where: `packages/agent/src/deep-research/workflow.ts:369`, `packages/agent/src/deep-research/workflow.ts:375`, `packages/agent/src/deep-research/agents.ts:55`, `packages/agent/src/processors/message-length-guard.ts:21`

### RSRCH-2 · Abandoned plans lock users out of deep research for up to 90 days

**high** · effort M · reliability, user experience, live failure

A run in `awaiting_approval` blocks new starts but has no lease or expiry (`packages/agent/src/deep-research/repository.ts:269`), and the 409 on a second start carries no run id. The web client keeps the id only in per-tab `sessionStorage`, and 'Try again' after any error forgets it without cancelling (`packages/web/src/lib/use-deep-research.ts:286`). Closing the tab at the plan card, clicking 'Try again' after a failed poll, or typing a new question over the plan strands the run until retention deletes it, 90 days after the plan was produced. A reviewer probe saw starts rejected 89 days later.

**Impact.** An attorney who closes the tab at the approval card is told 'Only one active research run is allowed per user' with nothing to cancel, until the owner edits the database.

**Fix.** Cancel `awaiting_approval` runs after about 24 hours in the existing 60-second sweep. Let the server identify the active run; the owner must choose between returning its id in the 409 body, which needs no new route, and adding `GET /research/runs/current`, which also lets the page show the run on load and removes the `sessionStorage` copy. Send the cancel from `reset()` when status is `error`, and tolerate a few failed polls. Add hook tests for tab reopen and adopting the run after a 409.

*What is and is not established: The server behaviour was reproduced by a reviewer probe. The client paths were established by reading the hook, not by running it in a browser.*

Where: `packages/agent/src/deep-research/repository.ts:269`, `packages/agent/src/deep-research/service.ts:266`, `packages/agent/src/deep-research/routes.ts:63`, `packages/web/src/lib/use-deep-research.ts:286`

## Medium severity

### RSRCH-3 · The final report is verified under chat limits and may not fit in 30 seconds

**medium** · effort M · release gate, reliability, cost

`verifyStep` (`packages/agent/src/deep-research/workflow.ts:474`) sends the report and all workers' sources through the chat `verifyAnswer` call: a 30-second deadline per pass, a correction that must re-emit the whole report, and a 120,000-character evidence cap. A timeout is not checkpointed, so both recoveries repeat the same call. The one live run, with one sub-question, spent 26.6 seconds on its first pass for a 2,359-character report; the writer is asked for 1,500 to 4,000 words. The 22 September gate run corrected or withheld 15 of 50 chat answers.

**Impact.** If a full-length report needs a correction, the user would lose finished research at the last step, several minutes after it was written, and the owner pays for every worker call.

**Fix.** Leave the 30-second deadline, the two-pass ceiling and the retry count alone, as issue #188 requires. Record one live run at default limits with per-pass latency and outcome, and log a local deadline abort separately from a provider outage. Shrink the report call's input: build verifier evidence from the verified findings plus role-tagged web snippets, keep deterministic checks on raw sources, and test that `coverageEvidenceIssue` still fires. If a full-length report still cannot pass, the owner must choose between shorter reports and reopening issue #188.

*What is and is not established: Predicted from code and one 26.6-second pass on a short report; no full-length report has been verified. Rated medium, not high: it fails closed and rests on extrapolation.*

Where: `packages/agent/src/deep-research/workflow.ts:474`, `packages/agent/src/processors/verifier/verify.ts:97`, `packages/agent/src/processors/verifier/config.ts:6`, `packages/agent/src/deep-research/agents.ts:105`

### RSRCH-4 · Reflection can research sub-questions the user removed from the plan

**medium** · effort S · cost, user experience, reliability, test gap

The research step sets the reflection follow-up budget to `maxSubQuestions` minus the approved count (`packages/agent/src/deep-research/workflow.ts:362`), so pruning a six-question plan to two frees four follow-ups. The reflection prompt compares findings against the planner's original brief, written for the full plan, and nothing tells it which questions were removed. Follow-ups are de-duplicated only against the approved list and researched without a second approval. The public plan never includes follow-ups, so 'Investigating N sub-questions' understates the work on any run where reflection adds questions.

**Impact.** A user who narrows a plan can be charged time and up to four worker runs on topics they declined, each one another chance for a withheld finding to end the run.

**Fix.** Pass the proposed count or the removed questions from the approval step through `ApprovalStepOut`, and skip the reflection loop when the user removed any question, so approval is binding. Add reflection follow-ups to the public plan or progress count so the displayed number is accurate. Add a case to `packages/agent/tests/deep-research/recovery.test.ts` with a plan pruned at approval and a reflection mock that returns the removed questions, asserting they are not researched.

*What is and is not established: The mechanism was confirmed in code and with mocked agents. That a real model re-proposes removed topics was not observed. Follow-up findings are still verified, so no unverified text is released.*

Where: `packages/agent/src/deep-research/workflow.ts:362`, `packages/agent/src/deep-research/workflow.ts:365`, `packages/agent/src/deep-research/workflow.ts:379`, `packages/agent/src/deep-research/checkpoints.ts:31`

### RSRCH-5 · Edited sub-questions on plan approval skip the identifier screen applied to the question

**medium** · effort S · security, privacy

The start route rejects client identifiers and out-of-coverage questions (`packages/agent/src/deep-research/routes.ts:40`), but the decision route only schema-checks `editedSubQuestions` (`routes.ts:87`). The text is stored as the approved plan (`packages/agent/src/deep-research/service.ts:254`), returned in the public plan and interpolated into worker prompts; the worker agent has no input processors. A reviewer probe saw a Social Security number and a Medicaid id rejected at start with 422 and accepted in a decision with 202. The web client only removes the planner's own sub-questions.

**Impact.** A beneficiary's identifiers can reach the model provider, checkpoints kept up to 90 days and, where web search is configured, a third-party search query.

**Fix.** Make approval prune-only on the server: replace `editedSubQuestions` with kept indexes resolved against the stored plan in `ResearchService.decide`, or return 400 when any edited sub-question is not in the stored plan. Do not build free-text screening for an edit feature nothing uses. Change `packages/agent/tests/deep-research/recovery.test.ts:150-164` to approve a pruned subset, and add a test that a non-member sub-question is rejected. The same change gives the workflow the removed questions it needs for the reflection fix.

*What is and is not established: Reaching this needs a hand-crafted request from an authenticated user, and exposure is limited to that caller's own run.*

Where: `packages/agent/src/deep-research/routes.ts:87`, `packages/agent/src/deep-research/service.ts:254`, `packages/agent/src/deep-research/workflow.ts:167`, `packages/contracts/src/schemas.ts:113`

### RSRCH-6 · One withheld worker finding fails the whole run, and transient errors share two recoveries

**medium** · effort M · reliability, cost

The research step rethrows any worker error that is retryable, a verification withhold, or matches `budget|lease|corpus|checkpoint` (`packages/agent/src/deep-research/workflow.ts:351` and `:401`) before the more-than-half threshold applies. A grounding withhold on one finding is therefore terminal, and the banner promising that 'the report preserves the successful findings' is nearly unreachable. Transient errors in workers, reflection, synthesis and report verification all draw on the same two run-level recoveries. The 22 September gate run withheld 2 of 50 chat answers; applied to six workers that suggests about 22% of runs lost to one withhold.

**Impact.** A user gets 'Answer grounding failed; report withheld' with no partial report and a spent daily start, although the other findings were already verified and saved.

**Fix.** Treat a grounding withhold on one worker (not a verifier outage) as a reported worker failure, keeping the more-than-half threshold and the final report gate, and name the unverified sub-questions as gaps in the synthesis prompt. Delete the worker-level `publishResearchVerification` call. Set `maxRetries: 2` on the planner, worker and writer agents, not the verifier, so rate limits stop consuming recoveries. Add a test where one of two workers is withheld and the run completes.

*What is and is not established: The 22% figure extrapolates the chat withhold rate from one gate run to six workers; it was not measured on research runs.*

Where: `packages/agent/src/deep-research/workflow.ts:351`, `packages/agent/src/deep-research/workflow.ts:401`, `packages/agent/src/deep-research/repository.ts:417`, `packages/web/src/components/DeepResearchReport.tsx:53`

### RSRCH-7 · Declined, cancelled and failed runs each consume one of two daily starts

**medium** · effort S · user experience, reliability

The limit of two research starts per rolling 24 hours counts every `research_runs` row by creation time, whatever its outcome (`packages/agent/src/deep-research/repository.ts:121-124`). A plan declined at the approval card, a run the web client cancels or strands, a planner failure and a system failure each count; `packages/agent/tests/deep-research/repository.test.ts:45-54` pins this with two created-then-cancelled runs. The third attempt returns 429 `research_daily_quota`, which the web shows under 'The research report could not be released' with a 'Try again' link that cannot succeed.

**Impact.** A user who cancels two plans, or hits two of the failures described in this section, has no deep research for 24 hours and has received no report.

**Fix.** Split the limit inside the `create()` statement: keep two per 24 hours for runs with `approval_json IS NOT NULL`, and add a planning cap of about six created runs per 24 hours so planner calls stay bounded. Return distinct error codes. In the web client, show the quota as a notice saying when the user can try again. Update the repository test to cover both limits, and state what consumes a start in `docs/operations/answer-release-and-recovery.md`.

*What is and is not established: The counting rule is pinned by an existing test. That declined and failed runs were not meant to count is inferred from the recovery guide, not stated anywhere.*

Where: `packages/agent/src/deep-research/repository.ts:121`, `packages/agent/src/deep-research/routes.ts:64`, `packages/agent/tests/deep-research/repository.test.ts:45`, `packages/web/src/components/DeepResearchView.tsx:176`

### RSRCH-8 · Leaving Deep Research cancels the run; plan exclusions carry into the next plan

**medium** · effort M · user experience, live failure

Selecting any thread or switching Deep Research off calls `reset()` (`packages/web/src/app/chat/page.tsx:90`, `:154`), which forgets the run id, clears a finished report and cancels an active run without confirmation. No route lists runs, so that report becomes unreachable. Separately, `DeepResearchView` keeps excluded sub-questions as array indexes in state that nothing clears while the mode stays on (`packages/web/src/components/DeepResearchView.tsx:30`), so item 2 excluded from one plan is omitted from the next on Approve. The June 2026 triage (`docs/reviews/2026-06-22-qa-triage-synthesis.md`) already recorded the exclusion bug.

**Impact.** One click on a past conversation discards minutes of paid research. A user who pruned an earlier plan can approve a narrower plan than they intended.

**Fix.** Remove `reset()` from thread switch and the mode toggle, keeping `setDeepMode(false)`; the hook keeps polling. Show 'running' or 'report ready' on the Deep Research pill, because the reset was added to stop runs executing unseen. Move the approval block into a child component that owns `excluded` and mounts only while awaiting approval. Add tests that a second plan renders with nothing excluded and that toggling off or selecting a thread posts no cancel.

*What is and is not established: Both halves were established by reading the web code; the verifier did not run the client.*

Where: `packages/web/src/components/DeepResearchView.tsx:30`, `packages/web/src/components/DeepResearchView.tsx:115`, `packages/web/src/app/chat/page.tsx:90`, `packages/web/src/app/chat/page.tsx:154`

### RSRCH-9 · One source with an empty link makes a research run unreadable and uncancellable

**medium** · effort S · reliability, data quality

`saveVerification` stores source summaries unvalidated (`packages/agent/src/deep-research/repository.ts:403`), while every read parses the row with `ResearchRunSchema`, which requires each link to be an absolute address or null. An empty or relative link makes every read, cancel and `plan()` call throw. If a retryable error or lease expiry follows the bad write, the run stays `recovering` indefinitely; otherwise it fails and stays unreadable. The local development graph has one current bulletin, among 7,589 documents, with an empty `source_url`.

**Impact.** A user whose research retrieves such a document loses the run and, on the retryable branch, is refused new runs and cannot cancel the stuck one; the operator sees an unhandled rejection every minute.

**Fix.** Normalise links once in `packages/agent/src/deep-research/workflow.ts` with a helper that keeps only parseable http or https links and stores null otherwise, and use it at the three duplicated sites. Parse sources with `ResearchCorpusSourceSchema` inside `saveVerification`. Have `handleFailure` schedule from the value `failOrRetry` returns instead of re-reading the row, and catch the three unguarded launch sites. Add a regression test with an empty link and a `javascript:` link.

*What is and is not established: Reproduced against the real repository and service. The one affected document was found in the older local graph; the deployed corpus was not checked.*

Where: `packages/agent/src/deep-research/repository.ts:403`, `packages/agent/src/deep-research/repository.ts:69`, `packages/contracts/src/schemas.ts:128`, `packages/agent/src/deep-research/service.ts:93`

### RSRCH-10 · Step budgets cover one attempt, so an interrupted report synthesis can never be recovered

**medium** · effort S · reliability, test gap

Each model step is charged to a per-phase counter before dispatch and never refunded (`packages/agent/src/deep-research/checkpoints.ts:49`), but work is checkpointed only when the agent call returns, so a recovered phase restarts at step one with the leftover budget. Synthesis has a budget of one (`packages/agent/src/deep-research/workflow.ts:448`). Two failures were reproduced: a 503 during synthesis went to `recovering` and then failed with 'Research step budget exhausted', as did a worker interrupted at step 10 of 16. Existing tests interrupt only after a checkpoint is saved.

**Impact.** A deploy, out-of-memory restart or provider error during the one-to-two-minute report call costs the user the run, although every finding was already saved.

**Fix.** Keep charge-before-dispatch and size the counter for the permitted attempts: have `reserveResearchStep` pass the per-attempt limit times three, using one shared `MAX_RECOVERY_CLAIMS` constant, and leave each call's `maxSteps` unchanged. The simpler alternative is to delete `research_budgets` and rely on `maxSteps` plus the recovery ceiling. Add recovery tests where `generate` rejects with a retryable error after `prepareStep` in the plan, worker, reflection and synthesis phases; each should end `completed`.

*What is and is not established: Reproduced on the real workflow and SQLite with mocked agents; no interrupted live run was observed.*

Where: `packages/agent/src/deep-research/workflow.ts:448`, `packages/agent/src/deep-research/checkpoints.ts:49`, `packages/agent/src/deep-research/repository.ts:397`, `packages/agent/src/deep-research/workflow.ts:184`

### RSRCH-11 · After a restart, in-flight research waits about 15 minutes on a dead lease

**medium** · effort S · reliability

Startup recovery reclaims only leases that have already expired (`packages/agent/src/deep-research/repository.ts:357`), and a lease lasts 15 minutes, renewed each minute (`repository.ts:28`). The deployment is one process on a SQLite file on a Railway volume, where neither replicas nor overlapping deployments are allowed, so every lease found at boot belongs to a dead process. A run interrupted by a deploy or crash waits 14 to 16 minutes, then spends one of its two recoveries; `packages/agent/tests/deep-research/service.test.ts:128` pins that wait. Separately, if the first sweep rejects, the periodic sweep may never be armed.

**Impact.** The agent redeploys on merges that touch the agent, contracts or policy-corpus packages, so a user with research in flight sees 'Researching' freeze with no progress each time.

**Fix.** Reclaim, on the first sweep at boot only, every lease not owned by the current process instance, using the same transition as `recoverExpiredLeases`, and state the single-process assumption in a comment. Arm the 60-second sweep before the first sweep and add a catch to the `recover()` call in `packages/agent/src/index.ts`. Keep the heartbeat and lease-lost code; do not add a shutdown handler or shorten the lease. Invert the test at `packages/agent/tests/deep-research/service.test.ts:128` to expect immediate recovery.

*What is and is not established: Derived from the code, the pinned test and Railway's volume rules; no production deploy with research in flight was observed.*

Where: `packages/agent/src/deep-research/repository.ts:357`, `packages/agent/src/deep-research/repository.ts:28`, `packages/agent/src/deep-research/service.ts:107`, `packages/agent/tests/deep-research/service.test.ts:128`

### RSRCH-12 · Deep research persists progress twice and carries code that nothing reads or reaches

**medium** · effort L · needless complexity, dependency

The module saves progress in Mastra workflow snapshots with suspend and resume, and again in its own `research_checkpoints` table. Recovery never uses Mastra's resume: `plan()` starts a fresh run and replays checkpoints (`packages/agent/src/deep-research/service.ts:206`), and that path could serve the first approval too. Progress events are emitted about ten times and read by nothing (`packages/agent/src/deep-research/workflow.ts:88`); the declined-plan branch (`workflow.ts:283`) is unreachable from the service and the command-line runner; `checkpoint_version` is only ever 1; several schema exports are unused. The eleven files total 1,881 lines.

**Impact.** The owner must re-validate suspend, resume, snapshot format and cancel behaviour on every Mastra upgrade for no functional gain; several other problems in this section sit in these layers.

**Fix.** Delete the dead code first: progress events and their schema, the declined-plan branch and the unused schema exports. Then have `decide()` commit the approval and run the same start-and-replay routine as `plan()`, removing `resume`, `extractPlan`, `attachWorkflow` and `workflow_run_id` while keeping an in-memory cancel handle per run, and move the command-line runner to that path. Keep leases, the heartbeat and lease-lost handling. Land the approval-expiry sweep first so it does not depend on `workflow_run_id`.

*What is and is not established: That the replay path can serve the first approval comes from reading the code; it was not tried.*

Where: `packages/agent/src/deep-research/service.ts:270`, `packages/agent/src/deep-research/service.ts:206`, `packages/agent/src/deep-research/workflow.ts:88`, `packages/agent/src/deep-research/workflow.ts:283`

## Low severity

### RSRCH-13 · Retry and failure decisions rest on substring matches against error messages

**low** · effort S · reliability

`isRetryableResearchError` tests an unanchored pattern before the status code (`packages/agent/src/deep-research/recovery-errors.ts:14`); worker fatality and user-facing text are matched the same way. In verification, a 429 containing 'Used 28403' and a 503 whose request id contains '401' were classed as terminal.

**Impact.** A user's run that could have recovered automatically ends with 'Research could not be completed'. Every misfire fails closed, so no unverified text is released.

**Fix.** Add a small `ResearchError` with a `code` property for lease loss, budget exhaustion, corpus change, incompatible checkpoint and exhausted recovery. Write one `classify(error)` helper used by `isRetryableResearchError`, the fatal checks at `packages/agent/src/deep-research/workflow.ts:351` and `:401`, `isSystemicWorkerError` and `repository.fail()`; check codes and status before any message pattern. Rewrite the test fixtures as coded or status-bearing errors, including a 503 whose message contains '401'.

*What is and is not established: The misclassifications were reproduced with constructed errors; no provider error with these shapes was observed.*

Where: `packages/agent/src/deep-research/recovery-errors.ts:14`, `packages/agent/src/deep-research/worker-pool.ts:28`, `packages/agent/src/deep-research/repository.ts:320`, `packages/agent/src/deep-research/workflow.ts:351`

### RSRCH-14 · Upgrading Mastra core past 1.72 turns a transient synthesis failure into an empty report

**low** · effort S · dependency, reliability, test gap

From `@mastra/core` 1.73.0, error-retry processors are on by default. In a mock-model probe on 1.74.0, one 503 with `maxSteps: 1` resolved with empty text, which `packages/agent/src/deep-research/workflow.ts:455` checkpoints unchecked. Recovery tests stub `generate` and cannot see it.

**Impact.** After the issue #145 upgrade, one provider error during report writing would give the user a grounding failure or a verifier-written report; in-loop retries would also triple planner and worker step charges.

**Fix.** Set `maxProcessorRetries: 0` on the three research agents now; it has no effect on 1.58.0. Throw when `res.text` is empty inside the worker-draft and synthesis checkpoint closures so nothing empty is saved. Settle the synthesis budget with the step-budget change. Add a test that drives the real `Agent` with a mock model failing once with a 503 and asserts no `synthesis` checkpoint is written.

*What is and is not established: Latent: it cannot occur on the installed 1.58.0, only after the upgrade. Observed with a mock model on 1.74.0.*

Where: `packages/agent/src/deep-research/workflow.ts:448`, `packages/agent/src/deep-research/workflow.ts:455`, `packages/agent/src/deep-research/workflow.ts:214`, `packages/agent/tests/deep-research/recovery.test.ts:20`

### RSRCH-15 · Finished runs keep unverified drafts and duplicated source text for 90 days

**low** · effort S · privacy, cost, dependency

`complete()`, `fail()` and `cancel()` (`packages/agent/src/deep-research/repository.ts:290`) update only the run row. Checkpoints, budgets and Mastra's snapshot, which repeats drafts and source text, go only at 90-day retention or account deletion. A reviewer probe counted ten copies of one source.

**Impact.** The operator keeps text the verifier refused to release in the database and its backups, though clients cannot read it; the retention scrub also depends on Mastra's internal column names.

**Fix.** Delete `research_checkpoints` and `research_budgets` rows for completed, failed and cancelled runs from the existing 60-second sweep. Pass a `shouldPersistSnapshot` option to `createWorkflow` that returns true only when `workflowStatus` is `'suspended'`, because `decide()` resumes from that snapshot; if the simplification removes resume, disable snapshots entirely. Add a test that a finished run has no checkpoint rows and no draft text in `mastra_workflow_snapshot`.

*What is and is not established: The text is not readable by clients; the exposure is to the database and its backups only.*

Where: `packages/agent/src/deep-research/repository.ts:290`, `packages/agent/src/deep-research/workflow.ts:506`, `packages/agent/src/storage/app-database.ts:206`, `packages/agent/src/storage/app-database.ts:211`

### RSRCH-16 · Hand-written workflow types are too loose to catch some Mastra result-shape changes

**low** · effort S · dependency

`ResearchService` declares its own workflow interfaces (`packages/agent/src/deep-research/service.ts:27`) with `status?: string` and all-optional result fields. The build still checks assignability at `packages/agent/src/index.ts:297`, so only a changed status value or a moved `suspendPayload` would compile unnoticed.

**Impact.** The owner could find a Mastra upgrade breaking planning or approval at run time rather than at build time, although a real-engine recovery test exercises the same calls.

**Fix.** Delete the three `as unknown as ResearchMastra` casts in `packages/agent/src/deep-research/routes.ts` (lines 58, 98 and 119); a probe showed a default `Mastra` is assignable. Derive the run and result types from `@mastra/core/workflows` instead of restating them, and narrow on `status` before reading `error`, `result` or `suspendPayload`. Skip this if the simplification removes suspend and resume first.

*What is and is not established: Latent: nothing is wrong on the installed version; the risk appears only if a Mastra upgrade changes the result shape.*

Where: `packages/agent/src/deep-research/service.ts:27`, `packages/agent/src/deep-research/routes.ts:58`, `packages/agent/src/index.ts:297`
