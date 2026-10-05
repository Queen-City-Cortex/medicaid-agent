# Verified answer release and research recovery

Chat, research reports, and the default CLI/evaluation path now share a release gate. Assistant prose remains private until claims, citations, relevance, source URLs, and quotations pass. A failed first candidate may produce one corrected answer; the exact correction gets one recheck. The default verifier is `gpt-5.6-terra` with low reasoning effort. Each provider check has a 30-second deadline and no SDK retries. Failure returns a fixed withholding notice and available sources. Minor relevance observations do not block release.

## Public answers and memory

`data-verification-status` carries `verifying`, `passed`, `corrected`, or `withheld`. The SSE adapter drops model text/reasoning and emits only the processor's final release. Progress and retrieval tool results continue to flow. Fixed application errors bypass the model-answer path.

The SQLite `answer_release_keys` row signs released assistant text and its outcome. Keep this key with database backups: replacing it makes old answers untrusted. The LibSQL memory boundary guards writes, updates, reads, and clones. The same boundary fixes thread ownership: a thread write that would change an existing thread's owner is refused, and the gateway rejects the message `include` parameter, which the framework does not scope by owner. The gate classifies every method of the memory store as guarded or reviewed pass-through and the server refuses to start on an unclassified one, so a framework upgrade cannot add an unguarded read or write path unnoticed. Legacy unsigned answers become an unverified-history notice. Client messages contribute only the newest user's text and thread ID; execution settings, tool evidence, assistant history, release metadata, and resource ownership are server-controlled.

Observational memory ignores summaries created before the release gate and rebuilds from guarded messages. The model-written working-memory/profile tool is disabled because its writes happen before answer verification. Thread history and guarded observational memory remain available.

Production rejects `VERIFIER_ENABLED=false`. Local CLI debugging may still explicitly opt out; that output must not be treated as released application content.

## Durable research

Migrations 5 and 6 add the signing key, approved decision, original limits, corpus identity, checkpoint version, recovery count/schedule, verification result, source summaries, checkpoints, and consumed-step counters. Deployment remains one agent service with its existing SQLite volume.

Private checkpoints cover planning, each worker's draft/evidence and verified result, reflection decisions, synthesis, verifier passes, and the released report. Public status never returns the draft. A worker result is saved as it completes, without waiting for its siblings. Stable question hashes avoid duplicate results. Approved edits are committed atomically with execution ownership before resume.

Recovery starts a fresh internal Mastra execution under the same public run ID and reuses checkpoints. Waiting plans still require approval. Provider steps are reserved before dispatch; ambiguous interruptions do not restore the budget. Recovery consumes actual new usage but does not create another daily research start.

The lease remains 15 minutes with one-minute renewal/sweep. Claims are atomic and mutations require the current, unexpired owner. There are at most two recovery claims over the entire run. Transient failures become eligible after 30 seconds, then two minutes; a local timer starts eligible work, with the sweep covering process restarts. Expired leases become eligible immediately when swept. Concurrency still limits actual execution.

Authentication/configuration errors, incompatible checkpoints, exhausted budgets, changed corpus releases, and failed grounding are terminal. A verifier outage retries the saved draft; exhaustion leaves it withheld. A missing corpus release ID cannot be used for recovery. Cancellation clears scheduled retries and prevents late results from publishing.

Retention and account deletion remove private checkpoint/budget rows and associated Mastra workflow snapshots before deleting the public run. Existing completed research reports without a verification result are withheld when read.

## Operational checks

Structured logs include `verification.release` (outcome, passes, reason, latency), `deep_research.checkpoint_reused`, `deep_research.recovery_scheduled`, `deep_research.recovery_claimed`, and `deep_research.terminal_failure` with a failure category. CLI `---VERIFIER---` JSON retains existing fields and adds `outcome`, `pass_count`, `withholding_reason`, and `latency_ms`.

Before production release, compare a stable, full answer-evaluation dataset on the same corpus/model configuration against the baseline. Report passed/corrected/withheld proportions, withholding reasons, answer scores, and median/p95 verification latency. Run repeat samples where judge variance matters. Do not accept a lower withholding rate by weakening grounding checks.

Validation on this branch uses real Mastra execution and temporary file-backed SQLite with mocked providers, including interruption after planning, approval, individual workers, reflection, synthesis, verification, and final report persistence. It checks replay without repeated model calls, preserved approval, bounded retries, verifier-outage recovery, lease contention, cancellation, budget exhaustion, corpus/version incompatibility, cleanup, and draft-sentinel exclusion from SSE, memory, clones, and the UI. Mocked browser tests cover reloads and thread switching. Research reload restores only the public run ID from session storage and polls the owned endpoint; it never re-approves a plan.

Final local checks: 387 agent tests, 271 web tests, 4 contracts tests, and 38 mocked browser tests passed. Agent/web builds, affected type checks, and lint passed. All nine Neo4j integration tests passed against a disposable database after Docker became available.

The [live validation report](../validation/verified-release-2026-09-22.md) records the matched 50-question baseline, initial gate results, corrective changes, and final comparison. The initial gate withheld 30% of answers, exposing evidence-formatting and verifier-calibration problems that were corrected before the final rerun. The local graph predates the immutable-ID migration, so the comparison uses the matching historical dataset. A follow-up against the tagged production graph passed five matched answer checks and a live research run with two automatic recoveries, without repeating completed model calls. Production still lacks all 112 evidence references in the current 55-question dataset; deployment remains blocked on a validated current corpus. Use an isolated observability DB for evaluation (`MASTRA_OBSERVABILITY_PATH=:memory:`) and run the pipeline CLI from `packages/pipeline`.

## Diagram

The editable source is [system-design.excalidraw](../diagrams/system-design.excalidraw), with [SVG](../diagrams/system-design.svg) and [PNG](../diagrams/system-design.png) exports from Excalidraw. The SVG embeds its font. Browser/server boundaries, chat/research paths, publication gate, private checkpoints, lease/recovery limits, and candidate/active graph promotion are shown separately.
