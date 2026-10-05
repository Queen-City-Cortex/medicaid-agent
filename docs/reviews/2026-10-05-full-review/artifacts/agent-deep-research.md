# Working artifact from the agent-deep-research reviewer

## Run state machine (as implemented)

States: `queued`, `planning`, `awaiting_approval`, `researching`, `verifying`, `recovering`, `completed`, `cancelled`, `failed` (packages/contracts/src/schemas.ts:93-103).
Leased states: `planning`, `researching`, `verifying`. Active states (block a new start): the six non-terminal ones.

| # | Transition | Trigger and code | Guard |
|---|---|---|---|
| T1 | none -> queued | POST /research/runs -> `repository.create` (repository.ts:103-148) | one INSERT: no active run for user AND fewer than 2 runs created in 24 h |
| T2 | queued -> planning | `service.plan` -> `acquire` (service.ts:166-176) | compare-and-set on state + leased-run count < maxConcurrent (2); otherwise re-poll every 5 s |
| T3 | planning -> awaiting_approval | Mastra run suspends -> `awaitingApproval` (service.ts:212-218, repository.ts:258-277) | lease-fenced; lease cleared; no expiry afterwards |
| T4 | awaiting_approval -> researching | POST decision approved -> `acquire` with approval_json (service.ts:253-266) | compare-and-set + capacity; on failure 409 `conflict`, no queueing |
| T5 | awaiting_approval -> cancelled | decision approved:false, or cancel (service.ts:241-249, 327-347) | owner-scoped UPDATE |
| T6 | researching -> verifying | `markVerifying` inside the verify step (usage.ts:13-17, repository.ts:279-288) | lease-fenced; skipped when no usage repository is configured |
| T7 | researching/verifying -> completed | `complete` (repository.ts:290-311) | lease-fenced; refuses an unverified report |
| T8 | leased -> recovering | `failOrRetry` on a retryable error (+30 s, then +120 s) (repository.ts:411-423); `recoverExpiredLeases` (346-362) | recovery_count < 2 |
| T9 | recovering -> planning/researching | `plan` -> `acquire`, recovery_count += 1 (repository.ts:190-193) | compare-and-set; count < 2; next_retry_at <= now; capacity |
| T10 | leased -> failed | `fail` (non-retryable or recovery exhausted) (repository.ts:313-344); sweep when count >= 2 | lease-fenced |
| T11 | any active -> cancelled | POST cancel -> `repository.cancel` (240-256) | owner-scoped, not lease-fenced, clears lease |
| T12 | row deleted | retention after 90 days without update; account deletion (app-database.ts:195-291) | n/a |

## What happens on each event

| Event | Behaviour | Verdict |
|---|---|---|
| Crash while queued | boot sweep `listQueued` -> plan | handled |
| Crash while planning/researching/verifying | lease stays valid up to 15 min; sweep then moves to recovering; replay from checkpoints with consumed budgets | stall (restart finding), often terminal (budget finding) |
| Crash while awaiting_approval | nothing to do; approval after restart re-attaches the persisted suspended Mastra run | handled |
| Crash while recovering | boot sweep picks it up once next_retry_at <= now | handled |
| SIGTERM / deploy | no handler, `dispose()` never called; identical to a crash | restart finding |
| Duplicate start request | second gets 409 active_run atomically; no idempotency key and the 409 has no run id, so a lost first response strands the run | lockout finding |
| Two tabs approve | one compare-and-set wins, the other gets 409 | handled |
| Approve racing decline | whichever UPDATE lands first; the other 409s or no-ops | handled |
| Approve with edited plan | edits stored atomically with the claim and reused on recovery; text is unscreened; reflection may add unapproved follow-ups | bypass finding + minor note |
| Approve while slots are full | 409; run stays awaiting_approval with no expiry | lockout finding |
| Cancel racing completion | complete wins: cancel returns 404 and the UI shows an error; cancel wins: complete's fenced UPDATE no-ops and the report is discarded | server handled; client minor |
| Cancel during work | row cancelled; in-flight model calls finish; next prepareStep or checkpoint write fails on the fence | handled, bounded leak of up to 3 calls |
| Lease expires while work continues | every write is fenced; sweep reassigns; old work can only burn in-flight calls | handled |
| One failed lease renewal | treated as lease loss; run failed although 14+ minutes of lease remain | minor note |
| Two server instances | claims are single-statement compare-and-set on shared SQLite; timers and Mastra Run objects are per process and cancel aborts only the local Run | protocol sound; deployment is single-instance by design |
| Corpus release changes mid-run | checked before and after every checkpointed unit; terminal | by design |

## Probe results (scratch directory only; agents and verifier mocked, no network)

```
A  transient 503 in reporter  -> recovering -> failed "Research step budget exhausted or execution lease lost" (synthesis=1/1, reporter called twice)
B  worker fails at step 10/16 -> recovering -> worker reaches 16/16 after 6 steps -> failed, same message
F  one worker 429 + two verifier outages on the report -> failed "Research recovery attempts exhausted. Please start a new run."
C  approve with slots full -> "conflict"; run stays awaiting_approval; new start = active_run now and 89 days later
D  SSN + Medicaid ID: POST /research/runs -> 422; same text in editedSubQuestions -> 202, stored, in public plan, passed to resume with useWeb:true
E  sources_json link "" -> get/getInternal ZodError; cancel throws; state recovering; plan() rejects; new start = active_run
G  completed run: draft text 1x in checkpoints + 2x in Mastra snapshot; evidence 6x + 4x; 13 checkpoint rows still present at day 89; public JSON has no draft
Reflection, 6,127-char prompt  -> model called, object parsed
Reflection, 10,959-char prompt -> tripwire "user message exceeds 10000 characters", model not called, object undefined, ReflectionSchema.parse throws ZodError
Prompt > 10,000 chars (finding lengths drawn from final-gate-full.json, 900-char brief): 3 findings 13.5% | 4: 40.6% | 5: 71.2% | 6: 91.4% | 7: 98.4%
isRetryableResearchError: 429 "Used 28403" -> false | 503 with request id containing 401 -> false | timeout mentioning authoritativeDocument -> false | SQLITE_BUSY -> false
Mastra: workflow.runs.size after 3 completed resumes = 3; failed-step error is not instanceof the thrown class (name, message, own properties kept)
```

## Rough completion odds for a default six-question run (from the repo's own gate data; proxies, not measurements of research runs)

| Stage | Basis | Passes |
|---|---|---|
| No worker finding withheld | 2/50 withheld per verified answer | 0.96^6 = 78% |
| Reflection prompt under 10,000 chars (plans of 4-5 questions) | simulation above | 29-59% |
| Report clean on first verifier pass | 35/50 chat answers clean on first pass; reports are several times longer | 70% at best |
| No third transient error anywhere | two recoveries shared by the whole run | unknown |

## What a simpler design needs (one process, one SQLite file)

Keep: the `research_runs` row with atomic claims, the checkpoint table, owner-scoped routes, the release gate, the two-starts-per-day quota.

Drop or replace:
- Mastra workflow, suspend/resume, snapshots, `extractPlan`, `workflow_run_id`, `attachWorkflow`, snapshot cleanup -> a plain `executeRun(runId)` calling the same checkpointed units; `decide` stores the approval and calls it.
- Lease, heartbeat, 60-second sweep, fencing clauses -> on boot, replay every run in an executing state; an `attempts` counter caps replays.
- `research_budgets` -> per-attempt `maxSteps` (already passed to each agent) plus the attempts cap.
- Two AsyncLocalStorage contexts -> one explicit context object passed to the units.
- Regex error taxonomy -> error codes.
- Progress events, bail branch, legacy handling, checkpoint_version, unused schema exports -> delete.
