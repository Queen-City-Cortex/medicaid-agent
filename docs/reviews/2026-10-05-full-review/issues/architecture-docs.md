# Architecture, complexity and the knowledge system: all issues

The core holds: the TypeScript packages layer without import cycles, the answer-release boundary fails closed, and `.env.example` and `AGENTS.md` match the code. The risk sits around that core. Production wiring exists only in an import-time script that no test assembles and that evaluation runs in reduced form. When an answer is withheld or reported wrong, the verifier's findings were never stored, so the owner cannot explain it. Rules that bind every contributor, including the US-hosted inference rule, exist only in the owner's private notes. Recorded lessons are not turned into fixes: the scheduled chat-store backup failed on thirteen consecutive days, and the note describing its cause changed nothing. Every impact here is read from code, documents and local logs; nothing was run against production. I would repair the backup script first, then record verifier findings and usage per answer, then write the inference-governance decision.

## What is working

- A script found no runtime import cycles in any TypeScript package. `packages/contracts` depends on Zod only, and `packages/policy-corpus` has no runtime dependencies and receives its Neo4j session and embedder by injection (`packages/policy-corpus/src/types.ts:269`).
- The answer-release boundary fails closed: a verifier error or timeout is returned as an unsupported answer (`packages/agent/src/processors/verifier/verify.ts:121-135`), and the stream gate emits a withheld notice when a stream finishes without a release (`packages/agent/src/answer-release.ts:118-126`).
- Startup validation refuses dangerous production settings: a disabled verifier, the development Neo4j password, a localhost graph or `CORS_ORIGINS` entry, and a non-persistent database (`packages/agent/src/runtime-config.ts:117-141`).
- `corpus-manifest.json` is one data file read by both the crawler and the pipeline, and the crawler validates it at load (`packages/crawler/src/corpus-manifest.ts:40`). It is the pattern to extend to the other cross-language seams.
- `.env.example` is the most accurate configuration document: all 40 of its names are read by code and its defaults and Sentry notes match, with one stale line on the scope of `ANTHROPIC_API_KEY` (`.env.example:11`).
- `AGENTS.md` is 27 lines and its nine bullets are accurate, `docs/development/knowledge-workflow.md` already requires removing superseded guidance, and all 161 relative links in the 27 current documents resolve.

## Medium severity

### ARCH-1 · A past answer's verifier findings cannot be recovered, and chat verifier cost goes unrecorded

**medium** · effort M · reliability, cost

On every web chat turn the verifier computes a 25-field telemetry object and lists of unsupported and missing-citation claims, then stores none of it. What survives is a `verification.release` log line with no thread, user or message identifier (`packages/agent/src/processors/verifier/run.ts:166`) and message metadata holding only status, reason, pass count and a signature. Production traces are off by default. `packages/agent/src/processors/verifier/processor.ts:83` passes no `onUsage`, so chat verifier tokens never reach `usage_events`, although deep research records them.

**Impact.** When an attorney flags a wrong or withheld answer, the owner cannot see which claims the verifier failed or waived without re-running a paid, non-deterministic turn. Usage reports understate chat spend.

**Fix.** Pass `onUsage` in the chat processor so verifier tokens are recorded under phase `verifier`, and log thread and message identifiers on the chat side. Then add one private `answer_audit` table keyed by message id holding outcome, telemetry, claim lists, corpus release and agent model, written without blocking release and deleted on retention, user-data deletion and thread deletion. Add a `packages/agent/tests/chat-memory-http.test.ts` case asserting the audit id equals the persisted message id and the id sent with feedback.

*What is and is not established: Read from code; no production turn was inspected and the unrecorded spend is not quantified. An opt-in diagnostics directory captures findings only when enabled before the turn.*

Where: `packages/agent/src/processors/verifier/run.ts:166`, `packages/agent/src/processors/verifier/processor.ts:83`, `packages/agent/src/answer-release.ts:25`, `packages/agent/src/storage/app-database.ts:195`

### ARCH-2 · One import-time script wires production and doubles as the evaluation command line

**medium** · effort M · reliability, test gap, evaluation validity

`packages/agent/src/index.ts` migrates the database, patches the memory store, builds the agent and server and starts research recovery at import, and doubles as the command-line interface (CLI). Tests cannot import it, so `packages/agent/tests/chat-memory-http.test.ts` hand-builds a second app with one middleware and no input processors. Evaluation runs the CLI branch, which has no memory and omits four input gates, three for no recorded reason. Continuous integration builds the image but never boots it, and merges deploy automatically. CLI runs still construct WorkOS authentication and fail without its three variables.

**Impact.** A wiring fault can reach users before the manual smoke test catches it; the repository records two earlier faults that tests missed. Evaluation does not measure how often production gates refuse a question.

**Fix.** Extract `createAgentRuntime` into `packages/agent/src/runtime.ts`, keeping the literal `new Mastra({...})` export in `index.ts`, which the Mastra build requires. Move both CLI branches to `packages/agent/src/cli.ts` on that factory with no server options; run the scope, coverage and length gates by default and record the two documented quota skips in the evaluation output. Add an in-process Vitest test driving one chat turn through `createHonoServer`, a test that the CLI loads without WorkOS variables, and a post-build container boot polling `/livez`.

*What is and is not established: Read from code. The two earlier faults are taken from `docs/development/gotchas.md` and a workflow comment; no new fault was reproduced, and the effect on evaluation scores was not measured.*

Where: `packages/agent/src/index.ts:60`, `packages/agent/src/index.ts:235`, `packages/pipeline/src/pipeline/eval/levels/answer.py:190`, `.github/workflows/ci.yml:228`

### ARCH-3 · A documented backup failure went unfixed for thirteen days; history swamps current guidance

**medium** · effort M · reliability, documentation

`docs/development/gotchas.md:201`, added 2026-10-02, describes the `railway ssh` failure, yet `scripts/ops/backup-mastra.sh:55` is unchanged since 2026-07-10 and the scheduled chat-store backup failed with that symptom every day from 2026-09-22 to 2026-10-04; no issue tracks it. Of 537 tracked Markdown files, 500 sit in history directories with no `.ignore` file, so searching `rerank` matches 4 current files against 59 historical. `gotchas.md` holds 169 bullets under four headings, and `docs/README.md:27` presents a roadmap last edited 2026-03-29 as planned work.

**Impact.** The newest copies of the chat store and its answer-signing key are two manual, restore-verified snapshots from 2026-10-02. Contributors and coding agents searching the documentation meet superseded guidance before current guidance.

**Fix.** Fix the backup first, in its own issue: in `scripts/ops/backup-mastra.sh` wake the agent, select the running deployment instance, retry when the output lacks `SNAPSHOT_OK`, and find out why thirteen failures went unnoticed. Then replace the dated index paragraphs with a short current-state block linking open issues, move `docs/roadmap.md` to the archive, add a root `.ignore` for `docs/archive/` and `docs/validation/`, give `gotchas.md` accurate headings, and require a linked issue for any gotcha describing something still broken.

*What is and is not established: The failures were read from the laptop's thirteen daily backup logs. Whether the failure alert was sent or seen was not checked. The backup script was not run.*

Where: `docs/development/gotchas.md:201`, `scripts/ops/backup-mastra.sh:55`, `docs/README.md:27`, `docs/roadmap.md:154`

### ARCH-4 · Binding contributor rules and key model decisions have no authoritative record in the repository

**medium** · effort M · privacy, documentation, cost

`docs/decisions/README.md` lists one record. The rule that user text goes only to US-hosted inference providers exists only in the owner's private Claude memory, apart from one sentence on the privacy page, while `AGENTS.md:5` directs every task to a third-party inference skill. The rejection of gpt-5.6-luna as verifier survives only in `docs/archive/byterover`, which `AGENTS.md` gives no authority. `AGENTS.md` names no paid or destructive commands: `build-mixed-corpus` resets the graph by default (`packages/pipeline/src/pipeline/cli/build.py:373`), and the answer evaluation silently falls back to the agent's `OPENAI_API_KEY`.

**Impact.** A contributor or coding agent without the owner's private notes can route user text to a non-compliant provider, reopen a rejected verifier model, drain the shared OpenAI quota or reset the local corpus.

**Fix.** Write decision record 0002 (inference governance: the rule, the reason, and whether TypeSafe and Jev satisfy it) and 0003 (model roles, promoting the gpt-5.6-luna rejection from the archive). Index decisions recorded elsewhere in `docs/decisions/README.md` without moving them. Add a short "Ask before" block to `AGENTS.md`. Default `build-mixed-corpus` to `--no-reset` and require `EVAL_OPENAI_API_KEY` or an explicit override for the answer evaluation, updating `packages/pipeline/tests/test_cli_mixed_corpus.py` and `packages/pipeline/tests/test_answer_eval.py`.

*What is and is not established: Latent: no rule breach was observed. Whether TypeSafe and Jev satisfy the US-hosted rule is not established by any finding; the owner has to decide and record it.*

Where: `docs/decisions/README.md:7`, `AGENTS.md:5`, `packages/pipeline/src/pipeline/cli/build.py:373`, `packages/pipeline/src/pipeline/eval/levels/answer.py:173`

## Low severity

### ARCH-5 · Two environment parsers: validated settings go unread while unvalidated ones accept malformed values

**low** · effort M · reliability, needless complexity

`loadRuntimeConfig` validates Neo4j, model and size-limit fields that nothing reads; consumers re-read the environment through `packages/agent/src/env.ts`, whose `intEnv` uses `parseInt`. Unvalidated settings such as `VERIFIER_MAX_SOURCE_TOKENS` accept `30k` as 30. Three repositories duplicate migration tables.

**Impact.** An operator's typo is silently truncated: `30k` leaves the verifier 120 characters of evidence, which would probably withhold every answer. `OBSERVATIONAL_MEMORY_ENABLED=TRUE` silently disables memory.

**Fix.** Make `intEnv` and `boolEnv` in `packages/agent/src/env.ts` throw on malformed values, and validate the lazily read settings once at startup from `loadRuntimeConfig`. Delete the unread `neo4j`, `agentModel`, `maxBodyBytes` and `maxMessageChars` fields, keeping the production checks. Keep zero or negative as the way to disable rate limits. Remove `ensureTable` from the usage, feedback and rate-limit repositories so migrations own the schema. Add `packages/agent/tests/env.test.ts` covering the malformed-value throws.

*What is and is not established: Latent: it needs an operator typo. The parsing was traced in code and not run; withholding every answer is the expected verifier verdict, not something the code guarantees.*

Where: `packages/agent/src/env.ts:17`, `packages/agent/src/runtime-config.ts:147`, `packages/agent/src/processors/verifier/config.ts:6`, `packages/agent/src/usage/repository.ts:49`

### ARCH-6 · Contracts package carries schemas nothing parses, and the web validates no response against it

**low** · effort M · needless complexity, test gap

About 40% of `packages/contracts/src/schemas.ts` is never parsed, including four release schemas for a manifest only Python produces. `packages/contracts/release-policy.schema.json` rejects the real policy file. The web casts responses unvalidated (`packages/web/src/lib/use-corpus-status.ts:38`).

**Impact.** No wrong answer reaches a user: the message list shows text only for `passed` or `corrected`. A malformed verification part would render a blank message, and the owner maintains schemas that enforce nothing.

**Fix.** Delete the four release schemas, their test case, `packages/contracts/release-policy.schema.json`, `DeepResearchProgressSchema`, and `ApiErrorSchema` unless the error envelope is unified in the same change. Parse with `VerificationProgressSchema` in `extractReleaseState`, returning a withheld state on failure, and with `CorpusStatusSchema` in `useCorpusStatus`. Do not require `confidence`, `severity` or `counts`, which restored messages lack. Add a fixture test running `extractMessageSources` over sample outputs built from each agent tool's `outputSchema`, then run a web build.

*What is and is not established: Read from code; no malformed payload was produced, so the blank-message outcome is inferred.*

Where: `packages/contracts/src/schemas.ts:224`, `packages/contracts/release-policy.schema.json:4`, `packages/web/src/lib/use-corpus-status.ts:38`, `packages/web/src/lib/message-verification.ts:85`

### ARCH-7 · TypeScript and Python meet through stdout text protocols and duplicated table definitions

**low** · effort M · evaluation validity, needless complexity, documentation

Answer evaluation parses four stdout markers and the retrieval bridge parses stdout as JSON, while the agent logger pretty-prints there. Python re-declares two crawler tables. The `scripts/eval-ab.sh` embeddings gate still uses a `voyage-law-2` baseline, although both defaults are `voyage-4`.

**Impact.** No user-facing path is affected. For the owner, a bad Voyage key likely surfaces as a misleading "invalid JSON" error, and fixing only the logger would let keyword-only results pass silently.

**Fix.** Send agent logs to stderr for command-line runs and, in the same change, add `retrievalMode` to the retrieval command's output and make `packages/pipeline/src/pipeline/retrieval/agent_bridge.py` raise on `lexical-degraded`. Have evaluation write one JSON result file and drop the four marker extractors. Delete the duplicated table definitions from `packages/pipeline/src/pipeline/retirement.py` and `packages/pipeline/src/pipeline/source_lifecycle.py`, raising when the tables are missing. Delete or re-baseline the `scripts/eval-ab.sh` embeddings gate. Correct the `packages/agent/src/logger.ts` comment or emit JSON in production.

*What is and is not established: Latent and inferred: the invalid-JSON failure comes from code reading plus a logger-only reproduction; the real retrieval command was not run.*

Where: `packages/pipeline/src/pipeline/eval/levels/answer.py:19`, `packages/pipeline/src/pipeline/retrieval/agent_bridge.py:43`, `packages/pipeline/src/pipeline/retirement.py:17`, `scripts/eval-ab.sh:42`

### ARCH-8 · Setup and configuration documents fail on a fresh checkout and omit production requirements

**low** · effort M · documentation, cost

Four rows of the `RUNBOOK.md` variable table contradict the code, and no document lists production-only requirements. About half the environment inputs are undocumented (90 of 188; 54 of 121 on a narrower scan). Documented bring-up breaks at six points.

**Impact.** An engineer or agent following `README.md` and `RUNBOOK.md` meets a missing `uv` and Docker volume, a WorkOS error and an empty graph. An answer evaluation without `ANTHROPIC_API_KEY` pays for every answer and scores none.

**Fix.** Correct the four `RUNBOOK.md` rows: verifier default, trace sample rate, Sentry environment and Anthropic key scope. Make `.env.example` the only variable reference and `docs/development/README.md` the only quickstart, using the commands `.github/workflows/ci.yml` runs, and delete the duplicate lists. Add a production-configuration section quoting what `loadRuntimeConfig` enforces. Load the root `.env` in `packages/web/next.config.ts` with `process.loadEnvFile`. Document `build-mixed-corpus` as the development-graph route. Fail the answer evaluation before its first agent call when `ANTHROPIC_API_KEY` is empty.

*What is and is not established: No command was run on a fresh machine; the six breaks are inferred from the documents and code. The undocumented-input count depends on scanner scope.*

Where: `RUNBOOK.md:23`, `RUNBOOK.md:12`, `packages/agent/src/runtime-config.ts:124`, `packages/pipeline/src/pipeline/eval/judge.py:61`

### ARCH-9 · RUNBOOK misdescribes the daily job and the federal cache; package READMEs list stale counts

**low** · effort S · documentation

`RUNBOOK.md:197` gives the eCFR federal-regulation cache 90 days; `packages/pipeline/src/pipeline/config.py:76` sets 7. `RUNBOOK.md:164` calls the daily job a ten-minute check; `scripts/ops/daily-check.sh:30` runs a full crawl and parse. Three other documents carry stale counts.

**Impact.** The operator will not anticipate that a federal maintenance page can fail the weekly run, and cannot tell from the RUNBOOK what the morning job downloads or how long it takes.

**Fix.** Fix all five in one change. In `RUNBOOK.md`, state the 7-day eCFR and 30-day statute cache, reword the quarterly section as a manual forced refresh, and rewrite the daily section to describe `scripts/ops/daily-check.sh`. In `packages/crawler/README.md`, link to `corpus-manifest.json` instead of a hard-coded count and list `reconcile`, `source-audit-collect` and `reactivate-source`. Replace the milestone list in `packages/pipeline/data/eval-results/README.md` with a pointer, and delete the test-count sentence in `docs/operations/answer-release-and-recovery.md:37`.

*What is and is not established: The mismatches between documents and code were read directly. The weekly run failing on a federal outage is inferred, not observed.*

Where: `RUNBOOK.md:197`, `RUNBOOK.md:164`, `scripts/ops/daily-check.sh:30`, `packages/crawler/README.md:49`
