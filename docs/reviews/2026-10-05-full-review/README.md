# NC Medicaid Navigator: full project review

Reviewed 4 and 5 October 2026 at commit `c48a9d4` on `main`. The review was read-only; this report was saved into the repository afterwards at the owner's request.

Issue numbers such as `#188` and commit ids in this report refer to the repository before it was republished on 31 October 2026; see the [documentation index](../../README.md#issue-and-commit-numbers-in-older-documents). The area ids such as `SAFE-1` still match the issue titles.

**How to read this.** The first section is the whole review in two pages: what to do today, the verdict, what is strong, and the changes that matter most. The sections after it cover the baseline, Mastra, the models, the architecture, and then every issue by area. Issue ids such as `SAFE-1` are stable within this report. Every issue is written up in the `issues/` folder next to this file, one file per area, and the evidence behind each issue (file and line, the verified claim, how it was checked, the detailed fix) is in `findings/`.

## Summary

### Do these today

1. **Rotate the production Neo4j password** (SEC-1). The live value is committed in two tracked files under `docs/archive/byterover/` and in older history. Check first that no TCP proxy is open on the Railway `neo4j` service, rotate from inside the private network, then update `NEO4J_PASSWORD` on the agent and `NEO4J_AUTH` on the Neo4j service. Once rotated, the committed string is inert and history does not need rewriting.
2. **Unload the Saturday refresh job** (OPS-1). `com.ncmedicaid.weekly-refresh` is loaded in launchd on this machine, and its script ends by wiping and reloading the production graph in place. It fails early today only by accident. Run `launchctl bootout gui/$(id -u)/com.ncmedicaid.weekly-refresh; rm ~/Library/LaunchAgents/com.ncmedicaid.weekly-refresh.plist`. Do not use `install-launchd.sh --uninstall`, which also removes the backup job.
3. **Take a manual backup of the production chat store** (OPS-11). The scheduled backup has failed on every run since 22 September 2026; the last good copy is from 21 September.
4. **Reset the smoke-test account's password** (SEC-4). It is committed in `docs/superpowers/plans/2026-03-29-chat-ui-features.md`.

### Verdict

The core design is sound. The answer-release boundary is real: draft answer text never streams, only a verified answer or its rechecked correction is released, storage refuses unsigned text, and reviewers who tried to get a draft answer out with mock models could not. Package layering is clean, installs are reproducible, and the project records its own failures honestly.

It is not ready for a first customer, for four reasons.

1. **Users would hit failures in ordinary use.** The identifier screen refuses questions containing phrases such as "Medicaid non-emergency transportation" and can block a whole thread (CHAT-1). Footnotes pointed at the wrong section for about 15% of citations in replayed stored answers (WEB-1). Deep research fails on long findings and can lock a user out for up to 90 days (RSRCH-1, RSRCH-2).
2. **"Verified" promises more than the check delivers.** Release rests on one low-effort model call from the same vendor as the generator (the same model under the code defaults), and its miss rate has never been measured (SAFE-6). Its evidence can be cut so that the cited text is missing (SAFE-2). The tracked September release answer puts the federal 90-day appeal ceiling under a North Carolina heading, where the state limit is 30 days (SAFE-1).
3. **The corpus calls things current that are not, and the fixes cannot ship.** The agency's "Archived" tag is discarded (CRAWL-1), documents removed from the agency's index stay active (CRAWL-2), fee schedules frozen since November 2022 are labelled current (DATA-3), and the bulletin parser matches no posts on the live site (CRAWL-4). No corpus release has completed through the current release path, and on current evidence none can: the retrieval floors are out of reach and no stored run meets the answer floor (OPS-2, OPS-3, EVAL-2).
4. **The evaluation cannot yet tell you whether a change helped.** Some reference answers are not supported by the sections they cite (EVAL-1), a withheld answer scores a perfect 3 on hallucination (EVAL-4), the agent that is evaluated is not the agent that is deployed (EVAL-3, EVAL-9), and the differences behind past model choices are inside run-to-run noise (EVAL-11).

The review produced 415 verified findings, merged into 256 issues: 33 high, 160 medium and 63 low. More than half (142) are under a day's work each.

One caution applies to all of them. No reviewer ran a live model or saw production. "Verified" means the mechanism exists in the code and, where an issue says so, was reproduced with mock models, scratch scripts, the local July graph or stored evaluation runs. Wrong-answer impacts are inferred unless stated otherwise. Each issue carries a line saying how far its evidence goes.

### What is strong

- **The release boundary.** A stream gate, a storage gate with signed messages and a bounded correction recheck (`packages/agent/src/answer-release.ts`, `processors/verifier/run.ts`), tested against real Mastra objects and a real SQLite file.
- **A positive route allowlist.** Seven of the Mastra server's 351 stock routes are reachable, and the same seven against the latest version's 419 (`packages/agent/src/execution-gateway.ts`).
- **Safety-critical code is app-owned and thin.** The verifier and scope gate call the AI SDK directly, so changes in the framework's agent loop cannot alter them.
- **Clean layering.** No runtime import cycles; `policy-corpus` has no runtime dependencies and parameterises every Cypher query.
- **Reproducible installs.** Complete, hashed lockfiles; base images pinned by digest; workflow actions pinned by commit.
- **Start-up validation** that refuses a disabled verifier, the development Neo4j password, a localhost graph or an ephemeral database in production.
- **Race-free limits.** Rate-limit and quota decisions are single SQL statements.
- **An evaluation harness with good bones.** A judge from a different vendor than the system under test, infrastructure errors kept out of quality means, fingerprinted release evidence.
- **A green, hermetic JavaScript test suite** (1,343 tests), and a `gotchas.md` that records failures with their causes.

### The changes that matter most

1. **Stop refusing ordinary questions** (CHAT-1, effort S). Screen only the newest user message, tighten the member-ID and Social Security patterns, make the web client read the error, and add the missing test that sends a second message (TEST-4).
2. **Make "verified" mean what the badge says.** Fix the evidence ordering (SAFE-2), state a federal bound only as a federal bound (SAFE-1), get the under-21 exception into coverage answers (SAFE-3), stop presenting the newest change notice as the authoritative document (SAFE-4), and rebuild the stream gate as an allowlist (SAFE-8). Then build one seeded-fault benchmark so the verifier's miss rate is a number (SAFE-6), and pin the six release conditions that no test covers (TEST-1). Add no new checks until that benchmark exists.
3. **Make one corpus release attainable** (OPS-2, OPS-3, OPS-7, OPS-9, EVAL-2). Check inputs before paying for a rebuild, set floors from measured values, and remove the prerequisites that void each other. Until this is done, items 4 and 5 cannot reach production.
4. **Fix what the corpus calls current.** Keep the Archived tag and the "still listed" signal (CRAWL-1, CRAWL-2), stop dropping documents whose last crawl check failed (CRAWL-3), repair bulletin discovery and treat an empty discovery as a failure (CRAWL-4, CRAWL-5), take fee schedules out of the answerable set or crawl the site that is current (DATA-3), and fix effective dates and statute text (DATA-2, DATA-1).
5. **Fix how a question finds its policy.** Exact policy-number lookup (RETR-1), the three wrong alias rules (RETR-2), structural selection of coverage sections (RETR-3), token matching in the router (RETR-4), reading past 6,000 characters (RETR-5), and making the beneficiary-guidance documents reachable (RETR-16). Then stop tuning on the questions that gate releases (RETR-7).
6. **Repair the evaluation before using it to decide anything.** Correct the reference answers and stop telling the judge they are verified (EVAL-1), fix the three judge scoring defects (EVAL-4, EVAL-5, EVAL-6), pin reasoning effort and record it (EVAL-3), and replace the comparison rule with a paired test (EVAL-11).
7. **Close the access gaps before the first real user.** Thread ownership on the built-in memory routes (SEC-2), sign-up by invitation and a service-wide spend ceiling (SEC-8), a production WorkOS environment (SEC-7), and fewer GitHub Apps with write access to an unprotected, auto-deploying `main` (SEC-6).
8. **Turn off observational memory, or fix what it breaks** (CHAT-2, CHAT-8, PRIV-2, SAFE-8). The Mastra section explains why I would turn it off.
9. **Make the privacy statements true and give every answer a record.** Disable response storage at OpenAI (PRIV-5), correct the retention and deletion claims (PRIV-6, PRIV-7), stop sending request bodies to Sentry (PRIV-4), and store what the verifier found for each answer (ARCH-1).
10. **Serve the people in the audience who are not attorneys.** Name a real contact when the product says to seek local help (SAFE-12), show 988 and 911 to someone in crisis (SAFE-13), make a withheld answer look withheld (WEB-2), and fix focus, contrast and Spanish-language handling (WEB-10, WEB-11, RETR-13).

### Dated deadlines

| Date | Event | Issue |
| --- | --- | --- |
| 1 December 2026 | Railway stops reading the checked-in `railway.json` files, which hold the health check, sleep, memory caps and cron schedule; migrate them first | OPS-13 |
| 11 December 2026 | OpenAI removes `gpt-5-mini`; the scope gate and injection detector fail open and the health probe stays green | EVAL-12 |
| 1 January 2027 | The hand-coded income-limit scope window ends and every undated income-limit question is refused | CHAT-7 |
| 1 January 2027 | A reworded statute section already stored as current text takes effect | DATA-1 |
| 30 April 2027 | Node 22 support ends | DEPS-5 |

### What I would not do

- **Do not work through all 256 issues.** A critic counted about 1,370 fix steps in the raw findings, many of which add gates and paid evaluations to a release path that has never completed. The roadmap at the end picks.
- **Do not raise the verifier's deadline, add passes or add retries.** Issue #188 forbids it until the timeout is diagnosed, and that decision is right.
- **Do not change the agent or verifier model yet.** Pin reasoning effort and repair the judge first, or the comparison will measure noise. The classifier move off `gpt-5-mini` (EVAL-12) is the exception, because it has a date.
- **Do not re-embed or change the embedding model.** Nothing in this review points at the embeddings.
- **Do not migrate off Mastra.** Lock the family and upgrade on a schedule instead.

## Baseline: does it build and pass today?

One agent ran the whole toolchain on Node 22.23.2 (the closest installed version to the pinned 22.23.3) with API keys blanked and Neo4j pointed at a closed port. The product code is healthy; the safety net around it has holes.

| Step | Result | What it showed |
| --- | --- | --- |
| Build (5 TypeScript packages) | Pass | No type errors. |
| Lint (ESLint, Ruff, Vulture) | Pass | The web lint also scans the generated `coverage/` directory; the 13.5k lines of pipeline tests are not linted. |
| Test typecheck | Pass | Vacuous for `contracts`: its `tsconfig.json` excludes `tests`. |
| Unit tests, Node 22 | JavaScript: 1,343 passed, 10 skipped, 0 failed. Python: 715 passed, 2 failed, 31 skipped. | The two Python failures (`tests/test_cli_parse.py`) read the real, git-ignored crawler registry. They pass in CI only because the registry is absent there. |
| Unit tests, the machine's default Node 26.9 | 69 crawler tests fail | `better-sqlite3` is compiled for Node 22. Nothing warns that the wrong Node is in use. |
| Coverage | agent 89% of lines, crawler 80%, web 76% | No package enforces a threshold. `policy-corpus`, `contracts` and the Python pipeline are not measured at all. |
| Mocked end-to-end (Playwright) | 39 passed | |
| Production dependency audit | Pass | No high or critical advisories in production dependencies. Development dependencies carry 1 critical and 12 high, which the gate ignores. |
| Operations script tests | Fail on macOS | The shell suite needs `flock`, so 5 of its 8 assertions never run on the developer machine. |
| Installed dependency tree (`npm ls --all`) | Fail | Four invalid entries. Three are root `overrides` that the lockfile itself does not honour, including a second `@mastra/core` (1.45.0) under the web client. |

Three things about the test environment deserve attention before anything else is trusted:

- **Tests load live credentials by default.** `packages/agent/src/load-env.ts` and `packages/pipeline/src/pipeline/config.py` both read the repository-root `.env`, and the default Neo4j target is the real local graph. Every JavaScript suite passed with keys blanked, so the tests are hermetic in practice, but nothing enforces it.
- **Version pins disagree and none is enforced.** `package.json` and CI say Node 22.23.3, `.nvmrc` says 22.22.0, the machine runs 26.9. CI uses Python 3.11 and uv 0.8.22; the local environment has 3.13 and 0.12.18.
- **Crawler unit tests append to the real crawl log** (`packages/crawler/data/crawl.log`, 191 MB).

A separate mutation probe asked a sharper question: would the tests catch a plausible slip on the riskiest lines? Of 30 single-point mutants placed in the verifier, the release gate, the auth middleware, rate limiting, research recovery and retrieval scoring, 21 survived. The mutants were chosen adversarially after reading the tests, so 30% is not a general mutation score; it shows that specific safety-critical conditions can be deleted with every test still green. The findings are in the tests section.

## How the project uses Mastra

Mastra is used correctly and for the right things, and the parts of the product that must not fail are deliberately kept out of its hands. The problems are at the edges: how Mastra versions are pinned and built into the image, two ownership gaps in Mastra's built-in memory routes, and observational memory, which works against several of the app's own guarantees.

### What Mastra does, and what the app keeps for itself

| Mastra provides | The app owns |
| --- | --- |
| The agent tool loop, step limit and forced synthesis hook | The hallucination verifier and scope gate, which call the AI SDK directly with their own deadline and no retries |
| Thread persistence and observational memory on a LibSQL file | A stream gate that drops all model prose and releases only verified text, and a storage gate that saves and recalls only signed answers |
| The HTTP server and WorkOS token verification | An allowlist gateway (7 of the server's 351 stock routes are reachable), resource binding, rate limits, usage records, retention |
| The AI SDK stream adapter (`handleChatStream`) | The `/chat` route wrapped around it, with its own ownership check |
| A five-step workflow for deep research | Research leases, checkpoints and budgets in the app's own tables |

Two reviewers checked the integration against the installed sources (`@mastra/core` 1.58.0, `@mastra/memory` 1.26.1, `@mastra/libsql` 1.14.0, `@mastra/ai-sdk` 1.5.0), not against documentation. They confirmed that:

- the verifier runs before Mastra's memory processors, so memory stores the released text and never the draft;
- `onIterationComplete` with `continue: false` does grant one last model turn, so forced synthesis near the step limit works;
- the resource-binding middleware sets the reserved key that the server prefers over a client-supplied resource id;
- the stream gate matches the chunk types the installed adapter actually emits;
- framework type escapes are few (12 `as any` or `as unknown as` sites in `packages/agent/src`);
- almost none of the custom code duplicates something Mastra ships. Mastra's scorers are sampled and advisory and cannot gate a response; its cost control reads from the observability store, which is off in production; its stock chat route cannot host the ownership check or the stream gate.

### Where the integration hurts

1. **Production runs a Mastra server version that is declared nowhere** (DEPS-1, DEPS-2). The agent pins core 1.58.0, but the `mastra` command-line tool (1.15.0) selects `@mastra/server` and `@mastra/deployer` 1.45.0 from an earlier release train, and that is the HTTP server bundled into the image. The root `overrides` entry does not hold under the pinned npm. `npx mastra build` then runs its own `npm install`, so the shipped dependency tree sits outside the lockfile and outside the production audit. The practical risk is an upgrade that passes every check and still breaks chat. The open, green Dependabot pull request #190 (core 1.72.0 over server 1.45.0) is one.
2. **Two built-in memory routes have ownership gaps** (SEC-2). The gateway rightly allowlists only what the web client needs, but it then relies on Mastra's own ownership checks, and two fail in the installed versions: creating a thread over an existing id replaces its owner, and the `include` parameter can return messages from any thread. Both were reproduced offline against the real routes. Exploitation needs another user's random id, so this is a fix-before-users item, not an emergency.
3. **The storage gate patches nine store methods by name** (DEPS-8). From `@mastra/memory` 1.30.0, cloning goes through a new `copyThread` method the gate does not wrap. Nothing is broken on the installed version; the next upgrade would open the hole silently. A start-up check that fails on any unclassified store method closes this whole class of problem.
4. **Observational memory undermines the app's own guarantees.** With it on, which is the default:
   - the scope gate and coverage boundary receive only the newest message, so the follow-up protections written for them do not run (CHAT-2);
   - on long turns the observer's summary replaces the user's question and the frame result in the model's context (CHAT-8);
   - observer text crosses the stream gate and is stored in signed history (see the answer-verification section);
   - retention deletes a thread but leaves its observer summary, which a reused thread id inherits (PRIV-2);
   - the streamed message id can differ from the stored one, which detaches feedback from the answer (WEB-8).

   The evaluation harness builds no memory at all, so none of this is measured. Upstream, 51 of the 76 memory changelog entries since the installed version concern observational memory.
5. **One import-time script is the only place production is wired** (ARCH-2). `packages/agent/src/index.ts` builds the server at import and doubles as the evaluation command line with a different processor chain, so no test assembles what production runs and evaluation measures a different agent.

Two smaller notes. Tracing is off in production by design, and switching it on with the installed `@mastra/observability` would export the WorkOS user object and the question unredacted (DEPS-10). And `MastraAuthWorkos` imports from `@mastra/core/auth/ee`, which Mastra's licence text excludes from Apache-2.0; it is worth asking Mastra in writing whether bearer-token authentication counts as an enterprise feature before the first paying customer (DEPS-14).

### Recommendation on observational memory

This is my judgment, not a verified finding. For a tool whose every answer must be grounded in retrieved policy text, observational memory adds five failure paths and an extra model call per turn, and there is no multi-turn evaluation that could show it helps. I would set `OBSERVATIONAL_MEMORY_ENABLED=false` in production now and run on plain thread history, and add `lastMessageOnly: true` to both injection detectors so they stop rescanning the whole thread. That one setting removes the first four problems above. The cost is that very long threads lose compression and fall back to Mastra's default message window. If you prefer to keep it, the fixes in CHAT-2, CHAT-8 and PRIV-2 are all required.

### Upgrade path

The installed core is 18 stable releases behind (1.74.0 was published on 1 October 2026), and Mastra ships nine to fourteen releases a month. The reviewer who compared both versions by source and with mock-model probes found that the release gate, the route allowlist and the processor chain still hold on the latest version. The changes that matter are default flips, not breaking changes: output processors run again on failed streams (1.59), the token limiter changes what it trims (1.70), tools start before a step finishes (1.71), and three error processors turn on by default (1.73).

1. **Now, no behaviour change.** Pin every `@mastra/*`, `mastra`, `ai` and `@ai-sdk/*` dependency exactly, declare `@mastra/deployer` and `@mastra/server` explicitly, add a lockfile check that there is one core and that server and deployer match it, put the family in one Dependabot group, and close #164 and #190.
2. **Low risk.** Raise `@mastra/libsql` from 1.14.0 to 1.20.x, which scopes `include` by owner and fixes a thread-title race.
3. **App-side fixes no upgrade provides.** The store-surface check, the thread-ownership guard, the persisted message id in the verification part, observational-memory rows in retention, and one contract test that boots the real server with the app's middleware (TEST-5).
4. **Then the family, in one pull request under issue #145**, stopping at core 1.72 to stay below the default error processors; go to 1.73 or later as a separate, deliberate step.

### Is Mastra the right foundation?

Yes, with a change in how it is managed. The safety-critical pieces are already thin wrappers around the AI SDK and the app's own storage, so the framework is not a single point of failure for correctness. What Mastra costs is upgrade churn, and the answer to that is a locked family, a contract test, and a scheduled monthly upgrade, not a migration. Replacing it would mean rebuilding the tool loop, thread storage, the stream adapter and the workflow runner for no gain in answer quality.

## The models it uses

Model ids, prices and retirement dates in this section were read from the vendors' own pages on 4 October 2026 and re-checked on 5 October. The complete inventory, with every call site, what text it sees, its deadline, retries and whether its usage is recorded, is in `artifacts/model-inventory.md`; the role-by-role analysis with sources is in `artifacts/model-strategy.md`.

### Where each model runs

| Role | Model today | Sees user text | Deadline | Usage recorded |
| --- | --- | --- | --- | --- |
| Main agent (chat, deep research) | `gpt-5.6-terra` in code; production overrides to `gpt-5.4` according to the repository's own 3 October audit | Yes | None per call | Yes |
| Hallucination verifier | `gpt-5.6-terra`, low reasoning effort, at most two passes | Yes | 30 s | Deep research only; not in chat |
| Scope gate | `gpt-5-mini` | Yes | None | No |
| Prompt-injection detector (two sites) | `gpt-5-mini`, hard-coded | Yes | None | No |
| Observational-memory observer | `gpt-5.4-mini`, hard-coded | Yes | None | No |
| Query and document embeddings | `voyage-4`, 1,024 dimensions | Yes (the question) | 15 s query, 120 s batch | No |
| Evaluation judge | `claude-sonnet-4-6`, hard-coded | No | 60 s | No |
| Reference extractor (optional) | `claude-haiku-4-5-20251001`, hard-coded | No | 120 s | No |
| Jev classifiers | `jev-1.13.0`, disabled at runtime | Would, if enabled | 500 ms | Ledger only |

Every language-model call that sees user text goes to OpenAI, which is consistent with the US-hosted inference rule. Two other services receive user-derived text and are not named in that rule: Voyage embeds every question, and Exa (the optional deep-research web search) receives queries the model writes from the question. The rule itself exists only in private notes, not in the repository (ARCH-4).

### What is wrong

1. **The deployed agent is not the agent that was evaluated** (EVAL-3). Reasoning effort is set only for the verifier. The agent runs at whatever the provider defaults to, which is none for `gpt-5.4` and medium for `gpt-5.6-terra`. The comparison that chose `gpt-5.6-terra` therefore changed model and effort together, production then went back to `gpt-5.4`, and a six-question cost sample shows zero reasoning tokens on every `gpt-5.4` generation call. Pin the effort in code, record it in every evaluation result, and re-run before drawing any conclusion about either model.
2. **Both input classifiers and the health probe use a model that is being removed** (EVAL-12). OpenAI has scheduled `gpt-5-mini` for removal on 11 December 2026. The scope gate and the injection detector both allow the message through when the provider errors, and the health probe treats a 404 as healthy, so on that day both gates would switch off silently with a green health check.
3. **The verifier is the generator checking itself** (covered in the answer-verification section). It is one low-effort call to the same vendor and, by default, the same model as the agent; it grades the correction it wrote; and its miss rate has never been measured.
4. **Model decisions so far are inside the noise** (EVAL-11). On stored July runs, the difference that led to adopting `gpt-5.6-terra` (+0.040 overall) has a standard error of about 0.04. Detecting a true difference of 0.10 on the 55-question set takes roughly three runs per arm on the overall score and five on hallucination; detecting 0.05 takes 11 to 17.
5. **Chat spend is under-reported** (EVAL-17). Only the main agent's tokens reach `usage_events` in chat. In the six-question sample the verifier was 37% of model cost. `pricing.ts` has no cache-write rate, although OpenAI bills cache writes at 1.25 times the input rate from GPT-5.6 onward.
6. **A mistyped model id fails silently** (EVAL-16). Any id that does not start with `gpt-`, `o1`, `o3` or `o4` is routed to Anthropic. A mistyped `VERIFIER_MODEL` boots, withholds every answer, and leaves health checks green. The documentation advertises Claude for the agent, but step 0 forces a tool choice that Anthropic documents as an error on Sonnet 5.5 and Opus 5.5, so that path cannot run on current Claude models.
7. **The installed AI SDK providers predate the newest models** (DEPS-4). `@ai-sdk/openai` 3.0.74 drops the verifier's reasoning-effort setting for a `gpt-6` id with only a warning. Update both providers within their declared ranges before evaluating any GPT-6 or Claude 5.5 candidate, or the comparison will test the wrong configuration.
8. **Prompts are stored at OpenAI by default** (PRIV-5). No call sets `store: false`, so each request is retrievable for at least 30 days. Setting it does not stop OpenAI's separate abuse-monitoring logs; only a zero-data-retention agreement does.

### Recommendation by role

| Role | Recommendation |
| --- | --- |
| Main agent | Pin reasoning effort to medium first and re-measure. Then evaluate `gpt-6.1-sol` ($2 in, $10 out per million tokens) as a non-inferiority candidate at a 0.10 margin, with three to five runs per arm. It needs the provider update, rejects effort `none`, and supports tool calls only through the Responses API. |
| Verifier | Keep the model. Before changing anything, build a seeded-fault benchmark (about 300 answers with planted errors) so the miss rate is a number. Then trial a first pass from a different lab, such as `claude-sonnet-5-5` at low effort, to decorrelate its errors from the generator's. Do not expect a saving from newer Claude models on price alone: models from 4.7 on tokenise the same text into about 30% more tokens. |
| Scope gate, injection detector, health probe | Move off `gpt-5-mini` well before 11 December. `gpt-5.4-mini` is the no-surprises choice because the project already runs it. `gpt-6-luna` ($0.10 in, $0.50 out) is cheaper and newer but needs the provider update. Do not take OpenAI's suggested replacement, `gpt-5.6-terra`: it costs eight times as much per input token. Add a three-second deadline either way, and re-run the scope boundary scenarios. |
| Memory observer | Moot if observational memory is turned off, as recommended in the Mastra section. |
| Evaluation judge | Keep `claude-sonnet-4-6` through the current campaign; Anthropic lists its retirement as not before 17 February 2027. Fix its credentials, which failed in the 3 October audit, and add a retry. Its request sets `temperature: 0`, which Claude models from 4.7 on reject, so plan the successor with a calibration bridge: judge about 150 archived answers with both models, which needs no agent runs. The Batch API halves judging cost. |
| Reference extractor | Keep, but make the id configurable. Anthropic's published floor for retiring this snapshot is 15 October 2026; no deprecation has been announced, and its policy is at least 60 days' notice. |
| Embeddings | Stay on `voyage-4`. The retrieval problems found in this review are in routing, truncation and data quality, not in the embedding model, and a full re-embed costs about $115 before fee-schedule compaction. |
| Reranker | Stay removed; the reason recorded in PR #71 still holds. |
| Jev | Stay disabled at runtime. Using it for the scope gate would send user text to a vendor outside the approved list. |

Measured cost per chat answer on 3 October (six questions, `gpt-5.4` agent, `gpt-5.6-terra` verifier) was about $0.054 for the agent and $0.032 for the verifier. One 55-question evaluation run costs about $9.

## Architecture assessment

### Shape

The static structure is clean. A script found no runtime import cycles in any TypeScript package; `contracts` depends on Zod only; `policy-corpus` has no runtime dependencies and takes its Neo4j session and embedder by injection. The coupling that matters is at the level of processes and data. The TypeScript crawler and the Python pipeline both write one SQLite registry. The pipeline shells out to `tsx` in five ways and parses four text markers from standard output. No test crosses that boundary; each side checks itself against hand-written fixtures (ARCH-7, TEST-10).

The two-language split is justified by Docling on the Python side and should stay. What it needs is one shared fixture that both sides test against, and a handshake in the graph itself (schema version, embedding model and dimensions) that the reader checks at start-up.

### The central problem: fixes cannot ship

Most of the findings about corpus data, the crawler and retrieval take effect only when a new corpus is released. The release path has never completed, and on current evidence it cannot:

- The retrieval floors (0.9 exact-section recall, 0.95 primary-section hit rate) are out of reach. Five of the 55 benchmark questions cannot hit at all, and stored runs score 0.30 to 0.36 recall (OPS-2).
- No stored golden-set run reaches the 2.75 answer floor, and one noisy run decides (OPS-3, EVAL-2).
- The inputs that decide a release are checked only after the inactive graph has been wiped and re-embedded, and a rejected snapshot is rebuilt every day (OPS-7).
- The prerequisites for a first release invalidate one another: a crawl voids the scope approvals, a redeploy voids the baseline (OPS-9).
- The statute source is offline (DATA-1), and the primary regulation fetch path returns a document the validator rejects (OPS-7).

By the repository's own records, production still serves the graph tagged 25 July 2026. So the first architectural move is not a new component. It is to make releasing boring: check inputs before paying for a rebuild, set floors from measured values, compare the candidate against the serving graph on the questions both can answer, and delete the ceremony that voids itself.

### Where the complexity is, and whether it earns its keep

About a quarter of the non-test source (roughly 14,000 of 55,000 lines) is release, retirement, audit, scope and experiment machinery.

| Machinery | Size | Assessment |
| --- | --- | --- |
| Signed answer release and memory gate | about 160 lines | Load-bearing and cheap. This is the product's core safety property. Keep it. |
| Retrieval heuristics, answer frames and planner directives | about 9,700 lines, plus an 841-line planner | The core bet, and currently tuned to the same questions that gate releases. Stored frames hold the expected primary section about 42% of the time, roughly what the top six plain search hits give. Measure it with an ablation before investing further. |
| Blue/green releases, qualification, identity catalogue | about 4,800 lines | The idea is right: never mutate the live graph, cut over atomically, keep a rollback. The implementation has not yet promoted a release. Cutover is implemented twice, once in journaled, tested Python and once in unjournaled Bash that every later release would use (OPS-5). |
| Source retirement, availability, audit, recovery | about 3,500 lines | The principle is right: a 404 is not a withdrawal. The mechanism is over-built, and each automatic tombstone blocks every release until an evidence bundle is written (CRAWL-9). |
| Jev experiments, budget ledgers, review tooling | about 3,000 lines | Disabled at runtime, yet imported by the server's environment loader, and the experiments cannot answer the questions they gate on (EVAL-18). Move it out of the boot path. |
| Research checkpoints, leases, claims | about 940 lines | Half of it. Checkpoint reuse protects paid, user-approved work across redeploys. Progress is persisted twice, and several branches are unreachable (RSRCH-12). |
| Bounded answer scope | about 840 lines | A hand-written patch per missing document, with a calendar expiry that will refuse every undated income-limit question from 1 January 2027 (CHAT-7). |

### Gates: closed where it matters, open upstream

The release boundary fails closed across five layers: verifier error or timeout, the stream gate, signed memory, the command line, and deep research. Reviewers exercised provider errors, malformed verdicts, tool errors and disconnects with mock models, and no draft answer text reached the client or the database. Observer notes and raw tool errors do cross the stream gate (SAFE-8).

The inputs that decide what evidence the verifier sees are different. They fail open and do not tell the release decision:

- when the embedding call fails, retrieval silently becomes keyword-only (SAFE-11);
- when the injection detector errors, the message is allowed with only a console warning (CHAT-11);
- when the verifier's evidence exceeds its budget, cited section text can be dropped and the answer still passes (SAFE-2);
- edited deep-research sub-questions pass through no input gate at all (RSRCH-5).

The full ledger of 31 gates and how each fails is in `artifacts/architecture.md`.

### One process, one file

All state is one libSQL file on a Railway volume, and Railway allows neither replicas nor overlapping deployments on a service with a volume. That is a reasonable choice for the first customers. A deploy or crash cuts any in-flight answer, and research waits about 15 minutes on a dead lease before resuming (RSRCH-11). Moving to two instances needs a hosted database first; after that the request path is close to replica-safe, because rate-limit and quota decisions are already single SQL statements.

### Explaining an answer after the fact

Today the owner cannot say why a past answer was withheld or what the verifier found wrong with it. The verifier computes 25 fields of telemetry and two lists of problem claims on every turn and stores none of it (ARCH-1). For a legal-aid customer this record is the audit trail, and for the owner it is the data the evaluation set should grow from. Of everything in this section it is the best investment per line of code.

### What I would do, in order

1. **Subtract.** Remove the in-place weekly refresh path (OPS-1), the unreachable half of deep-research persistence (RSRCH-12), the retired verifier rewrite code (SAFE-15), the duplicate cutover implementation (OPS-5), and Jev from the boot path.
2. **Make one release attainable** (OPS-2, OPS-3, OPS-7, OPS-9), so data fixes can reach production.
3. **Record every answer's verification** (ARCH-1) and extract the server wiring from `index.ts` so tests and evaluation run what production runs (ARCH-2).
4. **Measure the retrieval heuristics before adding to them**: run the ablation, and let the result decide how much of the routing layer to keep.
5. **Write down the rules that bind contributors**, starting with inference governance (ARCH-4).

## Findings by area

Each issue merges the verified findings that share a root cause. This section gives each area's assessment, its high-severity issues in full, and a table of the rest. Effort is S (under a day), M (days) or L (weeks). The line "What is and is not established" under an issue says how far the evidence goes: no reviewer ran a live model or saw production.

### Answer verification and release

The text boundary holds: model prose never streams, only a passed answer or its rechecked correction is released, and storage replaces unsigned assistant text. In every failure exercised with mocked models, no draft answer text reached the client or the database, although observer notes and raw tool errors did. The main risk is what gets released as verified. One low-effort model call decides, its catch rate has never been measured, and its evidence can be truncated so that cited text is missing. The tracked September 2026 release answer gives a federal 90-day appeal ceiling under a North Carolina heading, the under-21 exception is often absent from coverage answers, and the amendment lookup presents change notices as authoritative. The product names no help contact. I would first fix the evidence ordering and the appeal-deadline prompt rule, then build the single verifier benchmark before adding any new check.

**8 high, 7 medium, 7 low.** Every issue is written up in [issues/answer-safety.md](issues/answer-safety.md); the evidence is in [findings/answer-safety.md](findings/answer-safety.md).

#### SAFE-1 · Appeal answers give the federal 90-day ceiling where North Carolina's shorter limit applies

**high** · effort M · wrong-answer risk, data quality, evaluation validity

Neither `packages/agent/src/prompt.ts:124` nor the verifier prompt distinguishes a federal bound from the North Carolina rule. Thirteen of 48 distinct stored answers to one appeal question state only the federal maximum of 90 days (42 CFR 431.221(d)) for a fee-for-service hearing request; none states North Carolina's limit, 30 days under N.C.G.S. 108A-70.9A(d) or 60 days for county decisions. One is the tracked 22 September 2026 release answer, which puts it under an 'NC Medicaid Direct' heading and was released as verified. Its 18 sources held no North Carolina hearing source.

**Impact.** A beneficiary who reads 90 days and files on day 45 is out of time and may lose continued services during the appeal, under a green verified badge.

**Fix.** Sharpen `packages/agent/src/prompt.ts:124` into a general rule: state a federal maximum or minimum only as the federal bound, give the North Carolina figure only from a North Carolina source, and otherwise say the notice's deadline controls. Amend the q-033 answer key and add one county-decision case (60 days). Then seed the four hearing statutes from ncleg.gov and alias appeal phrases to MA-2420 and MA-3430 in `PolicyCorpus`. Add no verifier rule and no fixed number in the web interface.

*What is and is not established: Counts come from stored April to September runs on the older local graph; no live model was run. The 90-day sentence is accurate federal law, misplaced.*

Where: `packages/agent/src/prompt.ts:124`, `packages/pipeline/data/eval-results/milestones/2026-09-22-verified-release/final-gate-full.json:5427`, `packages/agent/src/processors/verifier/verify.ts:78`

#### SAFE-2 · Verifier evidence budget drops cited section text and keeps section listings

**high** · effort S · wrong-answer risk, release gate, test gap

`buildSourceText` (`packages/agent/src/processors/verifier/evidence.ts:458-480`) puts sources whose link the answer cites first, then stops at the first block that exceeds the budget. Entries sharing a link all count as cited, so long section listings can crowd out section bodies. Replaying current code on the recorded 22 September 2026 gate evidence, one answer carried a passed outcome although about 1,400 characters of federal requirements it stated were absent from the verifier text. Across 1,449 recorded answers the replay truncates 34 and drops a section body in 24.

**Impact.** An attorney can receive specific requirements marked verified that the verifier had no evidence for; a fabricated detail in that position would have passed the same way.

**Fix.** Reorder `buildSourceText` to cited section bodies, cited other entries, uncited bodies, then the rest, and skip an oversized entry instead of stopping. Return the dropped entries, record `evidence_chars_sent` and `evidence_entries_dropped` in telemetry, and withhold without a model call when a cited body is dropped. Keep the budget, deadline and listing lines. Add the q-010 regression, a listing-title quotation test and a dropped-cited-body test. Land it with or after the deep-research report source split, because oversized reports will otherwise be withheld.

*What is and is not established: Replay of current code on recorded evidence, not a captured prompt. The production budget is unrecorded; the 30,000-token default is assumed. Most truncated rows predate July 2026.*

Where: `packages/agent/src/processors/verifier/evidence.ts:476`, `packages/agent/src/processors/verifier/evidence.ts:458`, `packages/agent/src/processors/verifier/run.ts:109`, `packages/pipeline/src/pipeline/eval/evidence.py`

#### SAFE-3 · Under-21 EPSDT exception often fails to reach adult yes/no coverage answers

**high** · effort M · wrong-answer risk, data quality, test gap

The Early and Periodic Screening, Diagnostic and Treatment (EPSDT) rule is last in `COVERAGE_SUPPORTING_PROFILE_RULES` (`packages/policy-corpus/src/frame/coverage-sections/candidates.ts:494`), and only the first four supporting candidates survive. Selection and the planner match the provision by phrases in body text, so a 129-character cross-reference banner in section 4.0 is taken for it. In 133 recorded frames for 16 questions since 13 June 2026, the provision's text was present in 50, only the banner in 38 and neither in 45. With neither, 43 of 45 answers omitted the exception, including every acupuncture and massage run.

**Impact.** A parent or case manager asking whether a service is covered gets a verified 'not covered' with no mention that a child under 21 may still qualify.

**Fix.** Move the `epsdt-exception-supporting` rule to the front of `COVERAGE_SUPPORTING_PROFILE_RULES`, gated to yes/no or not-covered questions that are not already pediatric. Export one predicate from policy-corpus that matches the provision by section number and title with non-empty content, and use it in selection and the planner. When section 2.2.1 is empty, select the '42 U.S.C. § 1396d(r)' sibling. Replace the two hand-built tests with a real template fixture and add under-21 evaluation checks. Fix lettered-heading hierarchy at the next graph rebuild.

*What is and is not established: Frequencies are the reviewer's saved outputs over recorded runs and the local June parse, read but not re-derived. No live model was run.*

Where: `packages/policy-corpus/src/frame/coverage-sections/selection/groups.ts:56`, `packages/policy-corpus/src/frame/coverage-sections/candidates.ts:494`, `packages/policy-corpus/src/frame/coverage-sections/selection/assembly.ts:94`, `packages/agent/src/processors/answer-frame-planning.ts:185`

#### SAFE-4 · Amendment lookup names the newest change notice as authoritative, and retrieval ignores document status

**high** · effort M · wrong-answer risk, data quality, test gap, user experience

`getAmendments` promotes the newest change notice to `authoritativeDocument` (`packages/policy-corpus/src/primitives/amendments.ts:51`) and fetches the amended document with `LIMIT 1` and no ordering. `packages/agent/src/prompt.ts:93` tells the model to adopt it, the verifier receives it under 'Authoritative document', and `packages/web/src/components/ToolStep.tsx:184` labels it 'Current document'. In the local July 2026 graph, 114 of 193 notices amend several manuals, and the top notice for 125 of 335 amended documents has under 50 characters of text. No retrieval backend filters on status or date, so limit tables for 2019 to 2023 marked `current` compete with the newest.

**Impact.** A beneficiary or case manager asking for a current income limit can receive a prior year's figure, cited and marked verified. How often this happens on real questions was not measured.

**Fix.** Return `{ document, amends, amendments, latestAmendment, truncated }`, where `document` is the queried document and `amends` lists every amended document in a stable order; drop `authoritativeDocument` and `baseDocument`. Update together `packages/policy-corpus/src/frame/pipelines/amendment.ts:78-91`, `packages/agent/src/prompt.ts:93`, `packages/agent/src/tools/navigate.ts`, the verifier evidence headings, `ToolStep.tsx` and their tests. Fix notice-date ordering separately, because `latestAmendment` depends on it. Then exclude documents that are not retrieval-ready and mark superseded year-stamped editions at load, with golden questions that fail on a 2019 to 2022 limit.

*What is and is not established: Counts come from the older local July 2026 graph. No stored or live answer giving a prior-year limit was shown; the wrong-figure impact is inferred.*

Where: `packages/policy-corpus/src/primitives/amendments.ts:46`, `packages/policy-corpus/src/frame/pipelines/amendment.ts:78`, `packages/agent/src/prompt.ts:93`, `packages/web/src/components/ToolStep.tsx:184`

#### SAFE-5 · Questions about a past date are answered from current policy text

**high** · effort M · wrong-answer risk, data quality, evaluation validity, test gap

The corpus holds one text version per document, and only `resolveCoverageScope` (`packages/policy-corpus/src/scope/coverage.ts:67`, `:83`) relates a date in the question to a source, for two Modified Adjusted Gross Income (MAGI) tables and one COVID-19 bulletin. A probe asking what Policy 8C required in March 2024 returned no scope. In the local July 2026 graph, 378 of 3,322 documents other than change notices carry an effective date. The verifier's only temporal rule favours the latest revision, and no golden question asks about a past date.

**Impact.** A legal-aid attorney preparing an appeal over a 2024 denial can receive today's rule presented as the rule then in force, marked verified, because every claim matches a retrieved current section.

**Fix.** Add a unit-tested `asOfDate` detector that fires on one explicit past date, not on ranges such as 'amended since 2024', and carry it on the coverage scope. Using `getAmendments`, make the answer name later revisions and state the earlier rule only where a change summary quotes it; otherwise say only current text is held. Fail `coverageEvidenceIssue` without that evidence. Add ten as-of golden questions. Defer loading prior versions.

*What is and is not established: The end-to-end case was not run; the wrong-answer outcome is inferred from the scope probe. Counts come from the older local July 2026 graph.*

Where: `packages/policy-corpus/src/scope/coverage.ts:67`, `packages/policy-corpus/src/internal/rerank.ts:220`, `packages/pipeline/src/pipeline/graph/loader.py:451`, `packages/agent/src/processors/verifier/verify.ts:65`

#### SAFE-6 · Release depends on one low-effort model call whose catch rate is unmeasured

**high** · effort M · wrong-answer risk, release gate, evaluation validity, test gap

Beyond deterministic coverage, link and quotation checks, release rests on one `generateObject` call at low reasoning effort (`packages/agent/src/processors/verifier/verify.ts:94-99`), and the same model rechecks its own correction; 13 of 50 answers in the September 2026 milestone run were released that way. The call is hard-wired to OpenAI, so a Claude `VERIFIER_MODEL` would withhold every answer. No catch rate is measured. In stored runs a mismatched first document preceded low-accuracy answers 3.7 times more often (36 of 580 rows against 26 of 1,576), and the enforced gate has never met one.

**Impact.** Anyone relying on the verified badge: a transposed dollar figure, a wrong deadline or a flipped qualifier is released if that single pass misses it.

**Fix.** Build one offline benchmark that replays `runVerificationForAnswer` three times over two sets: captured answers with one seeded error each (figure, date, qualifier, section label), and the 64 stored judged-bad answers, copied out of the gitignored results directory and hand-confirmed. Report catch and false-withhold rates. Route `verifyAnswer` through `createModel()` and validate `VERIFIER_MODEL` at startup. Report per run whether the first routed document is a golden document. Change effort or model only against that benchmark, within the limits fixed by issue #188.

*What is and is not established: No live verifier was run. Stored-run figures use noisy judge scores on the older graph, and all 36 bad mismatch rows date from April to June 2026.*

Where: `packages/agent/src/processors/verifier/verify.ts:93`, `packages/agent/src/processors/verifier/run.ts:120`, `packages/agent/src/processors/verifier/config.ts:9`, `packages/agent/src/tools/answer-frame.ts:105`

#### SAFE-7 · Citation section labels are model-written, and no check ties them to evidence

**high** · effort M · wrong-answer risk, release gate, evaluation validity, test gap

Tools return one link per document (`packages/policy-corpus/src/internal/record-mapping.ts:129`), and the model writes the 'Policy 8C § 3.2.1' label. `validateAnswerUrls` checks only that the link was retrieved, so with only § 3.2.1 retrieved, citations to § 5.6 and a nonexistent § 9.9.9 passed both deterministic checks. Replaying the two proposed label validators on 7,102 stored labels flagged mostly correct citations: in the four enforced September 2026 runs they failed 3 and 1 of 90 released answers and caught no wrong citation. `docs/reviews/2026-06-11-remediation-plan.md:48` lists per-citation verification as completed; it was never built.

**Impact.** An attorney can quote a section that does not contain the rule, from an answer marked verified, and must search the whole document to check it.

**Fix.** Add `policyNumber`, `sectionNumber` and `childSectionNumbers` to `SourceEntry`, populated in `extractGetSection` and the container branch of `getSection`. Compare labels after normalising ('1-H' equals '1H', trailing '.0', container children count as retrieved) and only log an `unknownSections` counter; keep it out of the `clean` predicate. Commit the replay as a regression test over the tracked September 2026 files, asserting zero flags on the final gate. Promote to enforcement only after a clean replay on current-corpus evidence. Correct the June plan's banner.

*What is and is not established: Shown with a constructed example. Stored runs on the older graph hold no wrong section label in 90 enforced answers and 8 of 1,697 advisory-era answers.*

Where: `packages/policy-corpus/src/internal/record-mapping.ts:129`, `packages/agent/src/processors/verifier/answer-validation.ts:169`, `packages/agent/src/processors/verifier/evidence.ts:130`, `packages/policy-corpus/src/primitives/sections.ts:128`

#### SAFE-8 · Stream gate forwards unverified observer text, classifier reasons and raw tool errors

**high** · effort S · release gate, security, test gap, documentation

`gateAnswerStream` (`packages/agent/src/answer-release.ts:118-127`) drops text, reasoning and metadata chunks and forwards every other chunk type unchanged. Through the real chat route with mocked models, the response carried the observational-memory model's observations under production memory defaults, a free-text classifier abort reason and a raw tool error naming an internal Neo4j host. The observer text was also stored inside signed released messages, because the signature covers only text and outcome. The runbook says the stream emits only the final release, and the regression test never asserts that the observer's output is absent.

**Impact.** The web client hides observer text, so no unverified policy text is displayed today. A failed tool call can show its raw error, and any chunk type a framework upgrade adds would be released.

**Fix.** Replace the deny-list with an allow-list that rebuilds each chunk from named fields, with fixed text for `tool-output-error`, and drop all `data-om-*` chunks. Redact observer text from stored markers in `releaseMessage`. Strip `metadata.mastra` from thread responses and, in the same change, stop the client sending thread metadata on rename, or rename will erase memory state. Extend `packages/agent/tests/chat-memory-http.test.ts` to assert the observer string is absent from the response and the database. Correct the runbook.

*What is and is not established: Reproduced with mocked models. A 'suggested response' crossed only under the forced-observation test configuration, and the web client does not render observer text; high reflects the breached server invariant.*

Where: `packages/agent/src/answer-release.ts:118`, `packages/agent/src/answer-release.ts:21`, `packages/web/src/components/ToolStep.tsx:317`, `docs/operations/answer-release-and-recovery.md:7`

**Medium-severity issues**

| Id | Issue | Effort |
| --- | --- | --- |
| SAFE-9 | Deterministic evidence guard is satisfied by the routing hint alone | S |
| SAFE-10 | Planner injects a '60-day review cycle' directive whenever federal text contains '60 days' | S |
| SAFE-11 | Keyword-only fallback retrieval is invisible to the answer frame, release record and evaluations | M |
| SAFE-12 | Product tells people to seek local help but names no contact anywhere | S |
| SAFE-13 | No path shows 988 or 911 to a user in crisis | S |
| SAFE-14 | Verifier evidence omits the supersession details that `lookupPolicy` tells the model to relay | S |
| SAFE-15 | Verifier keeps the retired rewrite design, and its confidence dot can contradict the badge | S |

**Low-severity issues (7):** SAFE-16 Verifier outages withhold finished answers under the same notice as grounding failures; SAFE-17 Deep-research plan card shows unchecked planner statements before approval; SAFE-18 A question can imitate the verifier's evidence block; SAFE-19 Step-limit forced synthesis stores a spurious 'not verified' notice in history; SAFE-20 Threads whose observational memory predates the release gate never rebuild it; SAFE-21 Client disconnect cannot cancel verification because Mastra never passes the abort signal; SAFE-22 Verifier prompt order makes the recheck pass re-bill all evidence uncached.


### Security and access control

The authentication boundary holds for direct access: a binding middleware ties each request to the verified WorkOS user, and a positive-list gateway answered 404 on 344 of 351 built-in Mastra routes in a reviewer's in-process run. The main risk is credential hygiene, not application code. The production Neo4j password and the smoke-test account's password sit in tracked files, nine GitHub Apps can read them and push to an unprotected branch that deploys to production, and no scanner would have caught either. Rotate both passwords first, then narrow the app installations. In the application, two Mastra memory routes fail their ownership checks and thread metadata bypasses the input guards; both need small gateway or store changes and two-user tests before real users arrive. Production also appears to run on a WorkOS staging environment, which is cheapest to correct while there are no users.

**2 high, 8 medium, 4 low.** Every issue is written up in [issues/security.md](issues/security.md); the evidence is in [findings/security.md](findings/security.md).

#### SEC-1 · The production Neo4j password is committed in two tracked files and Git history

**high** · effort S · security, wrong-answer risk, data quality

`docs/archive/byterover/context-tree/database_operations/neo4j_auth/railway_neo4j_auth_handling.md` (lines 17 and 39) and `docs/archive/byterover/dream-log/drm-1781233424044.json` (lines 442 and 469) contain a 32-character string that an in-memory comparison found identical to `NEO4J_PASSWORD` in four captures of the production agent environment, the latest from 2026-10-03. Six older blobs under `.brv/context-tree` hold it too. The graph is otherwise reachable only on Railway's private network, but `scripts/ops/railway-tcp-proxy.sh` publishes it on a public port during a data deploy, and the Saturday launchd job that does so is still loaded, though it currently fails earlier.

**Impact.** Anyone with repository read access, including nine installed GitHub Apps, could alter policy text during a proxy window. Altered text would be retrieved, cited and pass the verifier, misleading attorneys and beneficiaries.

**Fix.** Confirm no TCP proxy is open, then rotate the password from a shell inside the Neo4j service without opening the proxy, and update `NEO4J_PASSWORD` and `NEO4J_AUTH`; accept only when `/readyz` reports Neo4j connected. Rotate any blue or green graph sharing the value, delete unpromoted activation checkpoints and `.local-recovery` copies holding it, then replace the literals with `<redacted>` and update the two hashes in `docs/archive/byterover/snapshot-manifest.json`. Do not rewrite history. Treat this review's session transcript as containing the value.

*What is and is not established: Match established against the 2026-10-03 capture, not a live sign-in. Tampering needs a public proxy window; none was observed open. Containment in pull-request refs was not re-scanned.*

Where: `docs/archive/byterover/context-tree/database_operations/neo4j_auth/railway_neo4j_auth_handling.md:17`, `docs/archive/byterover/dream-log/drm-1781233424044.json:442`, `scripts/ops/railway-tcp-proxy.sh`, `docs/archive/byterover/snapshot-manifest.json:146`

#### SEC-2 · A signed-in user can seize or read another user's conversation given its id

**high** · effort M · security, privacy, test gap, dependency

`packages/agent/src/execution-gateway.ts:31-34` exposes Mastra's built-in memory routes and relies on their ownership checks, two of which fail in the installed `@mastra/server` 1.45.0 and `@mastra/libsql` 1.14.0. `POST /api/memory/threads` with an existing thread id replaces that thread's owner, because the handler skips the ownership check and the store writes with `INSERT OR REPLACE`. `GET /api/memory/threads/:id/messages` with `include` and no known `agentId` returns messages from any thread. Offline reproductions against the real routes and the app's middleware confirmed both. Three reviewers reported this one defect.

**Impact.** After a takeover the owner gets 403 on their own conversation, and the other user can read it by cloning it and then delete it. Conversations hold attorneys' and case managers' pasted client facts.

**Fix.** Wrap `saveThread` beside `installMemoryReleaseGate` in `packages/agent/src/answer-release.ts` to reject a write that changes an existing thread's `resourceId`. Return 400 for `include` in the gateway, or raise `@mastra/libsql` to 1.20 through 1.22, which scope it by owner. Add two-user tests for both gaps to `packages/agent/tests/chat-memory-http.test.ts`. Reviewers disagreed on one point the owner must decide: whether also to remove the `POST /api/memory/threads` rule and its client call, which requires server-set thread titles.

*What is and is not established: Reproduced offline, not in production. Exploitation needs another user's random 122-bit thread or message id, which no product surface exposes, and there are no users yet.*

Where: `packages/agent/src/execution-gateway.ts:31`, `packages/agent/src/answer-release.ts:56`, `packages/agent/package.json:26`, `packages/agent/tests/chat-memory-http.test.ts:196`

**Medium-severity issues**

| Id | Issue | Effort |
| --- | --- | --- |
| SEC-3 | Client-written thread metadata reaches the model as system messages, bypassing the input guards | S |
| SEC-4 | The production smoke-test account's email and password are committed in a plan document | S |
| SEC-5 | No secret scanning runs, and default gitleaks would miss both live committed passwords | S |
| SEC-6 | Nine GitHub Apps and the Claude workflows can write to unprotected, auto-deploying main | S |
| SEC-7 | Production appears to authenticate through a WorkOS staging environment shared with the workstation | M |
| SEC-8 | Open self-registration with only per-user limits leaves the shared model budget uncapped | M |
| SEC-9 | Mastra parses request bodies of any size before authentication and the 2 MB cap | M |
| SEC-10 | Ignore rules for secrets and databases miss nested and variant file names | S |

**Low-severity issues (4):** SEC-11 Token checks call WorkOS on every request yet pin no issuer or algorithm; SEC-12 The deep-research web-search tool ignores the plan's corpus-only flag once Exa is enabled; SEC-13 Feedback routes take the user's identity from a different source than every other route; SEC-14 The web app sets no security headers while page scripts hold the access token.


### Privacy, compliance and product readiness

The trust boundary is sound: identity comes from the verified token, logs carry no user text, trace storage is off in production, and a complete account-deletion routine and a daily retention job exist. The main risk is that the product's privacy statements and controls do not match what the code does. The privacy page and runbook describe retention, memory and processors as they stood on July 10; retention, Sentry defaults, OpenAI response storage and backup leftovers each keep user text outside the controls the page describes. The identifier screen also rejects ordinary questions that quote a notice while letting spoken-form identifiers through. Nothing here was observed in production, and there are no users yet. I would first fix the identifier screen and the retention gap in `app-database.ts`, then the Sentry and OpenAI storage settings, then rewrite the privacy page and runbook in one pass before legal review.

**0 high, 10 medium, 3 low.** Every issue is written up in [issues/privacy-product.md](issues/privacy-product.md); the evidence is in [findings/privacy-product.md](findings/privacy-product.md).

**Medium-severity issues**

| Id | Issue | Effort |
| --- | --- | --- |
| PRIV-1 | Identifier screen rejects quoted notices and ordinary wording while missing spoken-form identifiers | S |
| PRIV-2 | Conversation retention leaves each expired thread's AI summary, which a reused thread id inherits | S |
| PRIV-3 | A refused question's first 60 characters are already stored as the thread title | M |
| PRIV-4 | Sentry defaults send request bodies and thread titles to Sentry | S |
| PRIV-5 | Every OpenAI call leaves prompts stored at OpenAI under the vendor default | M |
| PRIV-6 | Privacy page and runbook say conversations persist until deleted; the server purges them | S |
| PRIV-7 | Documented account-deletion procedure leaves user data; the complete routine has no caller | S |
| PRIV-8 | Failed backups leave full plaintext database copies on the agent volume indefinitely | S |
| PRIV-9 | Exported answers lack case-file provenance; Deep Research reports cannot be exported or reopened | M |
| PRIV-10 | Feedback is stored but never read, and comments skip the identifier screen | M |

**Low-severity issues (3):** PRIV-11 Privacy page overstates vendor limits: unpinned regions, Voyage training licence, unlisted processors; PRIV-12 Printed and copied answers carry no disclaimer; professional eligibility requests are unevaluated; PRIV-13 No organisation model: any account is authorised and every setting is deployment-wide.


### Chat request path: prompt, tools, input gates and runtime

The request path holds where it protects answer release: the server discards client-supplied history, the verifier keeps its own evidence and question, and gate blocks show only fixed text. The main risk is everything that depends on conversation context. Under the default observational-memory configuration the coverage boundary and scope gate see only the newest message, and retrieval, planning and verification of a follow-up all run on the bare last message, while tests and benchmarks are single-turn and cannot detect it. Separately, the identifier screen blocks ordinary Medicaid wording today and the interface hides the reason. Most impacts were shown with mock models or by running functions offline; none was observed in production. I would fix the identifier screen first, then supply stored history to the gates, then add two-turn tests before changing the prefetch.

**2 high, 9 medium, 4 low.** Every issue is written up in [issues/chat-agent-loop.md](issues/chat-agent-loop.md); the evidence is in [findings/chat-agent-loop.md](findings/chat-agent-loop.md).

#### CHAT-1 · Identifier screen rejects ordinary Medicaid questions and follow-ups, and the UI hides why

**high** · effort S · live failure, user experience, privacy, reliability

`packages/agent/src/chat-route.ts:33` runs `findSensitiveIdentifiers` over the whole request body, which the web client fills with the entire thread, although the server keeps only the newest user message. The member-identifier rule at `packages/agent/src/sensitive-data.ts:13` matches phrases such as "Medicaid non-emergency" and "beneficiary no longer", and the Social Security rule matches a ZIP+4. The 422 response uses a nested error shape that `packages/web/src/lib/parse-chat-error.ts:39` cannot read. Run offline against the real functions, six ordinary phrasings were flagged, and 19 of 2,702 stored benchmark answers would block their thread.

**Impact.** A beneficiary asking about non-emergency medical transportation sees a generic error whose "Try again" button fails identically and uses up the 30-per-hour allowance. Threads of about 13 turns hit the 2 MiB body cap.

**Fix.** Call `trustedChatInput` first in `chat-route.ts`, screen only that newest user text and delete `extractText`. Adopt the member-identifier pattern that requires a digit and allows a "number" or "is" filler; make the unlabelled Social Security branch hyphen-only. Send only the last user message from `use-chat-thread.ts`. Move every agent error to the nested envelope and parse that shape only. Add the negative phrase table to `tests/sensitive-data.test.ts` and a two-turn case to `tests/chat-memory-http.test.ts`.

*What is and is not established: Reproduced offline with the repository's own functions, not in the deployed product. The phone, ZIP+4 and e-mail trigger appeared in none of 2,702 stored answers.*

Where: `packages/agent/src/chat-route.ts:33`, `packages/agent/src/sensitive-data.ts:13`, `packages/web/src/lib/parse-chat-error.ts:39`, `packages/web/src/lib/use-chat-thread.ts:89`

#### CHAT-2 · Coverage boundary and scope gate never see earlier turns under default observational memory

**high** · effort M · wrong-answer risk, test gap, documentation, reliability

With observational memory on, the code default, Mastra passes input processors only the newest message. `coverageConversationQuery` at `packages/agent/src/processors/coverage-boundary.ts:26` and the four-message window at `packages/agent/src/processors/scope-gate.ts:76` therefore never see history; unit tests hide this. In a probe using the real Mastra loop and a mock model, "And for February 2025?" after a Modified Adjusted Gross Income (MAGI) table question raised no limitation notice and gave the verifier no dated-source requirement. The scope gate also cuts the newest message to 300 characters. With memory off, the injection detector rescans every recalled message.

**Impact.** An attorney asking a dated follow-up can receive an answer drawn from the wrong period's income table, with the check that would withhold it inactive. Long messages are classified on their opening lines.

**Fix.** Read the last six to eight stored messages in `chat-route.ts` after the ownership check, set them on a server-owned request-context key, and have both processors combine them with `messages`. Narrow inheritance to date-only and language-only follow-ups. Pass the newest message to the classifier whole and set `lastMessageOnly: true` on both injection detectors. Add the two-turn regression test with observational memory on. The alternative, accepting latest-only and deleting the inheritance code and its documentation, leaves dated follow-ups unprotected.

*What is and is not established: Shown with a mock model; no wrong answer was observed. The deployed `OBSERVATIONAL_MEMORY_ENABLED` value was not checked. A second reviewer rated the scope-gate half medium.*

Where: `packages/agent/src/processors/coverage-boundary.ts:26`, `packages/agent/src/processors/scope-gate.ts:42`, `packages/agent/src/processors/scope-gate.ts:76`, `packages/agent/src/index.ts:160`

**Medium-severity issues**

| Id | Issue | Effort |
| --- | --- | --- |
| CHAT-3 | Follow-up turns are retrieved, planned and verified from the bare last message | M |
| CHAT-4 | Six-item checklist cap drops the under-21 EPSDT directive on adult-exclusion questions | S |
| CHAT-5 | A failed frame lookup makes the planner reuse the previous turn's frame | S |
| CHAT-6 | Prompt, planner and verifier require citing template boilerplate as scope and exclusion evidence | M |
| CHAT-7 | Coverage-scope regexes refuse unrelated questions, and every undated MAGI question from 2027-01-01 (deadline 2026-12-31) | M |
| CHAT-8 | Long research turns evict the question, frame and evidence from the generating model | M |
| CHAT-9 | Web chat strips the model's reasoning items between tool steps; evaluation runs keep them | S |
| CHAT-10 | A chat run has no deadline, and its step ceiling is 99 | S |
| CHAT-11 | Scope and injection classifiers run without deadlines, and injection-detector failures go unreported | S |

**Low-severity issues (4):** CHAT-12 `lookupPolicy` hands the model and verifier sibling policies and synthetic rows first; CHAT-13 System prompt contradicts the tools and runtime and duplicates the citation block; CHAT-14 Pinned `@mastra/libsql` 1.14.0 leaves a thread-title race and deferred native connection cleanup; CHAT-15 Deploys cut in-flight chat streams within five seconds.


### Deep research

Deep research fails closed: run state changes are single guarded database statements, every route is scoped to the signed-in user, and no unverified draft leaves the server. What has not been shown is that a run can finish at default settings. Reflection prompts over 10,000 characters trip a chat-input guard, the report is verified under the chat verifier's 30-second deadline, one withheld worker finding ends the run, and an interrupted synthesis cannot recover. Every test replaces the three agents with stubs, and the only recorded live run used one sub-question with reflection off. Each failure also spends one of two daily starts, and closing the tab at the approval card locks the user out for up to 90 days. I would fix the reflection guard, the lockout and the start-counting rule first, then record one live run at default limits before touching report verification, and simplify the duplicated durability layers last.

**2 high, 10 medium, 4 low.** Every issue is written up in [issues/deep-research.md](issues/deep-research.md); the evidence is in [findings/deep-research.md](findings/deep-research.md).

#### RSRCH-1 · Reflection prompts over 10,000 characters trip the planner's chat-input guard and fail the run

**high** · effort S · reliability, test gap

The reflection step reuses `deepResearchPlannerAgent` (`packages/agent/src/deep-research/workflow.ts:369`), which carries `MessageLengthGuard`, the scope gate and the prompt-injection detector (`packages/agent/src/deep-research/agents.ts:55-58`). When the prompt, which is the brief plus every finding, exceeds 10,000 characters, the guard returns a tripwire, the model is never called, and `ReflectionSchema.parse` throws a non-retryable error. Reflection runs by default whenever a plan has fewer than six sub-questions. A reviewer's simulation from chat answer lengths put 41% of four-finding prompts and 71% of five-finding prompts over the limit.

**Impact.** A user loses a multi-minute run after all worker spend, sees only 'Research could not be completed', and has used one of two daily research starts.

**Fix.** Pass `inputProcessors: []` on the reflection `generate` call; `docs/development/gotchas.md:33` already rules out classifying internal reflection prompts. On a tripwire or parse failure, log `deep_research.reflection_skipped` and proceed to synthesis instead of throwing. Remove `MessageLengthGuard` from the planner; the start route already enforces the cap. Add a test driving the real planner `Agent` with a mock model and a findings prompt over 10,000 characters. Ship the pruned-plan reflection fix with this, because reflection will then run more often.

*What is and is not established: The failure was reproduced offline with the real agent and guard. The 41% and 71% rates come from a simulation that was not reproduced; no live run was observed.*

Where: `packages/agent/src/deep-research/workflow.ts:369`, `packages/agent/src/deep-research/workflow.ts:375`, `packages/agent/src/deep-research/agents.ts:55`, `packages/agent/src/processors/message-length-guard.ts:21`

#### RSRCH-2 · Abandoned plans lock users out of deep research for up to 90 days

**high** · effort M · reliability, user experience, live failure

A run in `awaiting_approval` blocks new starts but has no lease or expiry (`packages/agent/src/deep-research/repository.ts:269`), and the 409 on a second start carries no run id. The web client keeps the id only in per-tab `sessionStorage`, and 'Try again' after any error forgets it without cancelling (`packages/web/src/lib/use-deep-research.ts:286`). Closing the tab at the plan card, clicking 'Try again' after a failed poll, or typing a new question over the plan strands the run until retention deletes it, 90 days after the plan was produced. A reviewer probe saw starts rejected 89 days later.

**Impact.** An attorney who closes the tab at the approval card is told 'Only one active research run is allowed per user' with nothing to cancel, until the owner edits the database.

**Fix.** Cancel `awaiting_approval` runs after about 24 hours in the existing 60-second sweep. Let the server identify the active run; the owner must choose between returning its id in the 409 body, which needs no new route, and adding `GET /research/runs/current`, which also lets the page show the run on load and removes the `sessionStorage` copy. Send the cancel from `reset()` when status is `error`, and tolerate a few failed polls. Add hook tests for tab reopen and adopting the run after a 409.

*What is and is not established: The server behaviour was reproduced by a reviewer probe. The client paths were established by reading the hook, not by running it in a browser.*

Where: `packages/agent/src/deep-research/repository.ts:269`, `packages/agent/src/deep-research/service.ts:266`, `packages/agent/src/deep-research/routes.ts:63`, `packages/web/src/lib/use-deep-research.ts:286`

**Medium-severity issues**

| Id | Issue | Effort |
| --- | --- | --- |
| RSRCH-3 | The final report is verified under chat limits and may not fit in 30 seconds | M |
| RSRCH-4 | Reflection can research sub-questions the user removed from the plan | S |
| RSRCH-5 | Edited sub-questions on plan approval skip the identifier screen applied to the question | S |
| RSRCH-6 | One withheld worker finding fails the whole run, and transient errors share two recoveries | M |
| RSRCH-7 | Declined, cancelled and failed runs each consume one of two daily starts | S |
| RSRCH-8 | Leaving Deep Research cancels the run; plan exclusions carry into the next plan | M |
| RSRCH-9 | One source with an empty link makes a research run unreadable and uncancellable | S |
| RSRCH-10 | Step budgets cover one attempt, so an interrupted report synthesis can never be recovered | S |
| RSRCH-11 | After a restart, in-flight research waits about 15 minutes on a dead lease | S |
| RSRCH-12 | Deep research persists progress twice and carries code that nothing reads or reaches | L |

**Low-severity issues (4):** RSRCH-13 Retry and failure decisions rest on substring matches against error messages; RSRCH-14 Upgrading Mastra core past 1.72 turns a transient synthesis failure into an empty report; RSRCH-15 Finished runs keep unverified drafts and duplicated source text for 90 days; RSRCH-16 Hand-written workflow types are too loose to catch some Mastra result-shape changes.


### Retrieval and answer frames

What works: Cypher is parameterised, dependencies are injected, the collector is an explicit staged pipeline, and the verifier accepts only section text as evidence. What does not: which policy and which sections reach the model is decided by substring rules, alias tables and template-title matches tuned on the 55 questions that also gate releases. Round two reproduced wrong-policy frames for over-the-counter drugs, outpatient therapy and in-home personal care, and showed that coverage frames rarely carry the answering section's text. The main risk is a correctly cited answer built on the wrong policy, which a grounding check cannot detect. No model was run, so every wrong-answer impact is inferred. I would first make section ordering deterministic and the policy lookup exact, since both change frames and must precede any baseline comparison, then fix the alias rules, then apply the settled coverage-selection design.

**7 high, 20 medium, 2 low.** Every issue is written up in [issues/retrieval-frames.md](issues/retrieval-frames.md); the evidence is in [findings/retrieval-frames.md](findings/retrieval-frames.md).

#### RETR-1 · Policy numbers are extracted and looked up loosely, anchoring frames on the wrong policy

**high** · effort M · wrong-answer risk, test gap

`extractExplicitPolicyNumbers` (`packages/policy-corpus/src/internal/query-intent.ts:445`) treats any digit-plus-letter token as a policy number, and `lookupPolicy` (`packages/policy-corpus/src/primitives/policy-lookup.ts:62`) matches by prefix while routing keeps the first row. On the local July 2026 graph with embeddings stubbed, "3D mammograms" anchors a coverage frame on Policy 3D, Hospice, and 27 of 62 look-alike questions resolve to a document. Six policies resolve to a sibling, such as 1A-2 to 1A-27. Stored numbers such as 1-I, 7 and 15 are missed, and a suffixed form number such as DHB-5125B is read as two numbers and finds nothing.

**Impact.** A beneficiary asking whether a service is covered can get an answer plan built on an unrelated policy. The verifier checks grounding only, so a cited answer about the wrong policy could pass.

**Fix.** Adopt the round-two combined patch: make the `lookupPolicy` WHERE clause an exact case-insensitive match, exclude revision rows, and accept a bare token only beside a cue word. Do not add an exact-first `any()` ORDER BY key; it crashes the pinned Neo4j 2026.05. Tighten the "under" cue and resolve form numbers to the stored prefix-and-digits key, preferring the typed suffix. Ship the 54 scratch checks as a table test and add sibling fixtures to the existing Neo4j integration test.

*What is and is not established: Measured on the local July 2026 graph with embeddings stubbed and on fixtures; no agent answer was run. The combined patch was checked only on the reviewer's 217 questions.*

Where: `packages/policy-corpus/src/internal/query-intent.ts:445`, `packages/policy-corpus/src/primitives/policy-lookup.ts:62`, `packages/policy-corpus/src/frame/context/routing.ts:140`, `packages/agent/tests/integration/neo4j-tools.integration.test.ts`

#### RETR-2 · Alias rules force the wrong policy for over-the-counter, outpatient therapy and CAP/Choice questions

**high** · effort S · wrong-answer risk, live failure, test gap

`extractAliasedPolicyNumbers` (`packages/policy-corpus/src/internal/query-intent.ts:450-495`) maps bare substrings to policy numbers that are then treated as typed by the user. Over-the-counter medication wording forces Policy 9, whose exclusion list begins with over-the-counter products; Policy 9A, which covers them, never enters the frame. "Outpatient therapy" forces Policy 10A although the corpus uses the phrase only in behavioural-health policies, and "cap/c" also matches the Community Alternatives Program options CAP/Choice and CAP/CD, which belong to Policy 3K-2. In a fixture probe the Policy 8C psychotherapy section, the top hit at 0.97, was absent from the frame.

**Impact.** A case manager asking whether prescribed Claritin, or outpatient therapy for depression, is covered is steered toward a cited "no" from the wrong policy, which a grounding check would accept.

**Fix.** Split the pharmacy alias so the eight over-the-counter phrases map to 9A only and pharmacy wording keeps 9. Replace the "outpatient therapy" rule with "outpatient specialized therap", bound "cap/c" so it matches only CAP/C and CAP/Children, and map "cap/choice" to 3K-2. Leave `scoreVariantDocument` unchanged. Flip the over-the-counter assertion in `packages/policy-corpus/tests/internal/query-intent.test.ts`, add the negative cases, and check golden questions q-004 and q-032 on the next evaluation run.

*What is and is not established: Frames were reproduced on fixtures and on the local July 2026 graph with embeddings disabled. The wrong final answers are inferred; no model was run.*

Where: `packages/policy-corpus/src/internal/query-intent.ts:462`, `packages/policy-corpus/src/internal/query-intent.ts:488`, `packages/policy-corpus/src/internal/document-selection.ts:108`, `packages/policy-corpus/src/query/analysis.ts:54`

#### RETR-3 · Coverage frames fill slots with template sections and strip the answering section's text

**high** · effort M · wrong-answer risk, evaluation validity, test gap

For yes/no questions, `packages/policy-corpus/src/frame/pipelines/coverage.ts:220` lists title-matched template sections ahead of search hits. The scope slot is chosen by substring over section bodies (`packages/policy-corpus/src/frame/coverage-sections/selection/groups.ts:146`), leftover hits become avoid entries with their text stripped, and rebalance promotes them back without text. Given the right section as the top hit, 218 synthetic probes returned it with text in 4 to 11% of cases. Nine of 50 frames in each stored September run held a text-less primary or supporting section. Prompts and tests assert a 2.1.1 plus 4.1 pair that recorded frames never contain.

**Impact.** For a service that is covered, the plan leads with boilerplate and the not-covered template and holds no text about the service. A beneficiary may get a hedged, withheld or mis-anchored answer.

**Fix.** Choose the first primary structurally: section 1.0, then its first non-empty child, with no body-text matching. Hydrate the top in-policy search hits next and move 4.1, 4.2.1 and 3.2.1 to supporting. Nominate avoid sections only on a title match, strip avoid content after rebalance, and never select an empty-body section. Reword the pair rule in `packages/agent/src/prompt.ts:20-21`, `packages/agent/src/processors/verifier/verify.ts:66` and the planner. Replace the retitled fixtures with real section lists, then add the content invariant test and the oracle probe as acceptance.

*What is and is not established: Probes are synthetic and put the section title in the question; stored-run counts come from the legacy local graph. No score harm was visible and no model was run.*

Where: `packages/policy-corpus/src/frame/pipelines/coverage.ts:220`, `packages/policy-corpus/src/frame/coverage-sections/selection/groups.ts:146`, `packages/policy-corpus/src/frame/rebalance/coverage.ts:21`, `packages/policy-corpus/tests/frames-coverage.test.ts:295`

#### RETR-4 · Substring intent and care-setting rules misroute common questions and are unstable under paraphrase

**high** · effort M · wrong-answer risk, test gap

Question type, document-type groups and care-setting preferences come from bare substring checks (`packages/policy-corpus/src/internal/query-intent.ts:508`, `packages/policy-corpus/src/internal/term-lists.ts:397`). The adult-care-home term 'ach' matches inside "each" and "reach"; on the local July 2026 graph a question about personal care "each month" in the person's own home lost Policy 3L and kept only the congregate policy 3L-1. An income-limit question mentioning the federal poverty level routes to federal authority, and "state plan amendment" routes to the amendment pipeline. The bare router keeps the original type for 38 of 50 held-out paraphrases.

**Impact.** A family member asking about in-home personal care, or a case manager asking an income limit, can get an accurately cited answer from the wrong policy or one that omits the state rule.

**Fix.** Match query-side terms with the existing `matchesToken` in `packages/policy-corpus/src/internal/document-selection.ts:118` and `:196` and for single-word intent triggers, adding the plural forms that token matching drops. Give the setting entries an exact `policyNumbers` field (3L-1 congregate, 3L in-home). Exclude "federal poverty" in `isFederalAuthorityQuery`, strip "state plan amendment" before the change-notice test, and make federal type groups additive. Add a free test that runs `analyzeQuery` over each golden and paraphrase pair, with a shrinking allow-list.

*What is and is not established: Measured on the bare router and the local graph, embeddings disabled. Production frames come from a model-written tool call that often overrides the router; the live misroute rate is unknown.*

Where: `packages/policy-corpus/src/internal/query-intent.ts:508`, `packages/policy-corpus/src/internal/term-lists.ts:397`, `packages/policy-corpus/src/internal/document-selection.ts:196`, `packages/policy-corpus/src/internal/retrieval-planning.ts:32`

#### RETR-5 · Section text beyond the first 6,000 characters cannot be read by any tool

**high** · effort M · wrong-answer risk, live failure, test gap

`getSection` truncates content at 6,000 characters (`packages/policy-corpus/src/internal/record-mapping.ts:144`) while its tool description promises the complete text (`packages/agent/src/tools/read.ts:12`). The truncation note points to sub-sections, but nearly all over-length sections are leaves. On the local July 2026 graph about 5,300 sections exceed the cap, including 82% of fee-schedule sections, 36% of federal statute sections and 15% of federal regulation sections. Frame hydration and verifier evidence use the same call, so the model, the frame and the verifier all see only the head.

**Impact.** An attorney asking about a later paragraph of a long regulation, such as remittance in 42 CFR 438.8, can get a partial or withheld answer, or a negative claim from an incomplete read.

**Fix.** Add `offset` and a bounded length to `PolicyCorpus.getSection` and the tool, slicing in Cypher with `substring` and returning the total length and next offset. Make the truncation note state the range shown and how to continue, correct the tool description, and label verifier evidence with the window. Test continuation and the container-children path. Cap spreadsheet section size in the pipeline.

*What is and is not established: The truncation is in current code; the counts come from the local July 2026 graph. No partial or wrong answer was observed end to end.*

Where: `packages/policy-corpus/src/internal/record-mapping.ts:144`, `packages/agent/src/tools/read.ts:12`, `packages/policy-corpus/src/primitives/sections.ts:134`, `packages/policy-corpus/src/frame/context/hydration.ts:35`

#### RETR-6 · Amendment recency is unreliable: synthetic dates tie and markers are parsed from unrelated titles

**high** · effort M · wrong-answer risk, data quality, test gap

The loader dates every `dhhs_policy` change notice January 1 of its year (`packages/pipeline/src/pipeline/graph/loader.py:291`). `getAmendments` sorts on that date, breaks ties by id and labels the first row `authoritativeDocument`. On the local July 2026 graph 56 of 209 amended base documents tie at the newest date; MA-3550 returns notice 02-26 ahead of 04-26. The marker parser (`packages/policy-corpus/src/internal/change-markers.ts:15`) reads false markers from 836 section occurrences and 658 real document titles. Because only notices carry dates, the document keyword backend gives all six slots to notices ahead of tied manuals.

**Impact.** An attorney asking what is current for a manual can be told an older notice is the latest. Tool output supports the claim, so the verifier would not catch it.

**Fix.** Return the queried manual as the current document from `getAmendments` (two of three reviews preferred this), report notices as history, and update `packages/agent/src/prompt.ts:93`. Replace both marker regexes with the single measured pattern anchored on "change", reject years beyond next year, and pin a table test per header family. Sort status before date at `packages/policy-corpus/src/retrieval/backends/keyword.ts:105`. Stop writing synthetic dates; the owner must choose a null date with stored year and sequence, or the notice's parsed header date. Test three same-year notices.

*What is and is not established: Counts come from the legacy local graph, and the new pattern's 1,182 of 1,182 result is in-sample. The effect on final answers was not measured.*

Where: `packages/policy-corpus/src/primitives/amendments.ts:30`, `packages/pipeline/src/pipeline/graph/loader.py:291`, `packages/policy-corpus/src/internal/change-markers.ts:15`, `packages/policy-corpus/src/retrieval/backends/keyword.ts:105`

#### RETR-7 · Retrieval and frame heuristics are tuned to the same questions that gate releases

**high** · effort L · evaluation validity, release gate, needless complexity

Predicates in `packages/policy-corpus/src/internal/query-intent.ts` and term lists in `packages/policy-corpus/src/internal/term-lists.ts:100` carry vocabulary and section numbers matching single golden questions, and `isEpsdtOverviewQuery` (line 359) matches the production smoke question verbatim. `release-validate` scores only the 55 golden questions (`packages/pipeline/src/pipeline/cli/release.py:283`). The only other sets are one-to-one paraphrases of the same questions. Golden evidence covers 33 documents: 21 of 177 clinical policies and no fee schedule, state plan amendment, contract, bulletin, waiver or provider manual. A verifier's count found topic predicates firing on 15 of 55 golden questions and 1 of 25 fresh ones.

**Impact.** Release scores describe tuned topics, and the project's records mark this problem as fixed since June 2026. A question about dental, estate recovery or another unbenchmarked policy takes an unmeasured generic path.

**Fix.** Author one frozen set of 20 to 40 questions on document families and policies the golden evidence does not touch, score it at retrieval level first, and never tune on it. Add an environment flag that bypasses the single-policy branches, compare repeated runs through `scripts/eval-ab.sh`, and delete branches that do not beat the ablated arm. The reviews disagree on whether the paraphrase set belongs inside `release-validate`; the owner must choose, and should not add it before a release has completed.

*What is and is not established: Tuning is inferred from vocabulary overlap and from predicates firing on 15 of 55 golden questions against 1 of 25 fresh ones. Quality on untested topics was not measured.*

Where: `packages/policy-corpus/src/internal/query-intent.ts:359`, `packages/policy-corpus/src/internal/term-lists.ts:100`, `packages/pipeline/src/pipeline/cli/release.py:283`, `packages/pipeline/src/pipeline/evaluation_evidence.py:80`

**Medium-severity issues**

| Id | Issue | Effort |
| --- | --- | --- |
| RETR-8 | Hit-inferred coverage routing keeps one policy, dropping a second service or the top-ranked document | S |
| RETR-9 | Prior-authorisation frames fill with tied template headings and demote the Prior Approval section | S |
| RETR-10 | Waiver scoring ranks age-65 waiver regulations above the governing 1915(c) sections | S |
| RETR-11 | Archived and companion fee schedules stay searchable; `retrieval_ready` is only a rerank penalty | M |
| RETR-12 | Frame composition depends on Neo4j's unordered section listing | S |
| RETR-13 | Spanish questions bypass the English-only coverage boundary, determinism hints and tokeniser | M |
| RETR-14 | Policy-variant frames contain only template boilerplate and no search evidence | S |
| RETR-15 | Amendment frames list synthetic revision rows as authoritative and omit the named policy | S |
| RETR-16 | The beneficiary_guidance document family is unreachable by default search and every answer frame (deadline 2027-01-01) | S |
| RETR-17 | Keyword backends scan every section body per search and return whole bodies | M |
| RETR-18 | Four lookup tools return unbounded results, up to about 260,000 tokens | S |
| RETR-19 | Hits carry no document id, so expansion and boosts key on non-unique titles | M |
| RETR-20 | Vector search per group draws from one global top-200 pool, starving federal groups | M |
| RETR-21 | Full-text recovery favours the first type group and passes operators through to Lucene | S |
| RETR-22 | Ten retrieval catch blocks turn any Neo4j error into an empty result without logging | S |
| RETR-23 | The agent's planning processor re-derives question intent and injects policy-specific directives | L |
| RETR-24 | The model's optional question-type hint overrides the router, and frame tests bypass it | M |
| RETR-25 | The concept backend matches aliases as substrings and returns the five longest tagged sections | M |
| RETR-26 | Nothing checks that the agent's query embeddings match the corpus model and dimensions | M |
| RETR-27 | Specialised frame selection is not shown to surface the right section better than search | L |

**Low-severity issues (2):** RETR-28 An empty frame still tells the model to finalize from existing evidence; RETR-29 The frame layer carries unread flags, unreachable branches and repeated section fetches.


### Corpus data quality: parsing, graph, references and federal text

The write side is sound: each document loads in one transaction, embedding plans are lossless and hash-bound, and federal downloads are validated before a cache is replaced. The risk is in content and authority metadata. Statute sections carry editorial notes and not-yet-effective amendments as law, and the statute's only source has served a maintenance page since 3 October, which stops every release build. Effective dates are wrong for about a third of clinical policies and invented for change notices. Fee schedules have been frozen since November 2022 but are labelled current. Revision rows are loaded as documents; list markers, heading hierarchy and tables are degraded. The verifier cannot catch these defects because it checks answers against the same stored text. Most figures come from a July 2026 local graph; production was not inspected. I would settle the statute source first, then fix dates, retire fee schedules and reload once.

**3 high, 17 medium, 4 low.** Every issue is written up in [issues/corpus-data.md](issues/corpus-data.md); the evidence is in [findings/corpus-data.md](findings/corpus-data.md).

#### DATA-1 · Statute text includes editorial notes and future amendments, and its only source is down

**high** · effort M · deadline 2027-01-01 · wrong-answer risk, data quality, release gate, reliability

`parse_usc_subchapter` (`packages/pipeline/src/pipeline/federal/ssa_parser.py:120-123`) stores everything between two section headings as statute text: on the cached United States Code pages 48% of Title XIX text follows the source-credit line, and 89 of 553 local chunks contain 'read as follows', including a rewording of section 1902(a)(34) that applies from 1 January 2027. `_split_statute_subsections` (`:174-180`) fabricates or mislabels 9 of 258 children. Separately, both `USC_URLS` in `packages/pipeline/src/pipeline/federal/ssa_client.py:21` returned maintenance pages on 5 October 2026, so every release build stops at the statute stage.

**Impact.** An attorney can be given superseded or not-yet-effective wording as current law, or a pin cite such as 1917(i) that does not exist. The owner cannot complete a release build today.

**Fix.** Decide whether to accept GovInfo's Statute Compilations (COMPS-8765 and COMPS-8770) as the statute source; otherwise repair the parser to keep only the statute field. Before switching, spot-check two or three provisions with delayed effective dates. Then add a small adapter that takes children from the XML `subsection` elements and drops footnotes, keep the six anchor checks and document ids, point `source_url` at GovInfo, record the current-through public law, and delete the HTML parser and subsection splitter. Re-ingest before January 2027.

*What is and is not established: No retrieval was run. Parser figures come from the June 2026 cache and local graph. The compilation's legal equivalence and its handling of delayed-effective amendments are unverified.*

Where: `packages/pipeline/src/pipeline/federal/ssa_parser.py:120`, `packages/pipeline/src/pipeline/federal/ssa_parser.py:174`, `packages/pipeline/src/pipeline/federal/ssa_client.py:21`, `packages/pipeline/src/pipeline/release.py:235`

#### DATA-2 · Policy effective dates are wrong, impossible or fabricated, and revision chains are incomplete

**high** · effort M · wrong-answer risk, data quality, test gap

`_extract_effective_date` (`packages/pipeline/src/pipeline/graph/loader.py:259-293`) takes the string maximum of every date in a clinical policy's history section and invents `YYYY-01-01` for change notices. Of 174 local clinical policies with an `Amended Date:` banner, the stored date matches it in 94 and is older in 60; 11A-10 and 1E-3 are dated 2105 and 2028. Invented notice dates are off by a median of 149 days across 202 local notices. `_parse_revision_rows` (`packages/pipeline/src/pipeline/references/amendments.py:156`) accepts the 2105 row and a month 00, and its heading filter leaves 48 policies without an amendment chain.

**Impact.** An attorney asking when a policy was last amended can receive a date years too early, or for 11A-10 a revision dated 2105. The verifier checks both against the same stored values.

**Fix.** Read the first title-block `Amended Date:` banner for clinical policies, or `Effective Date:` after `Policy No:`, falling back to the latest valid revision row. Parse each change notice's header `DATE:` line in its six observed shapes, otherwise store null, and print it as `Dated:`. Build dates with `datetime.date` in one shared helper that rejects rows more than 366 days after `source_changed_at`. Widen the heading match to 'history'. Add tests for the 10C, 1E-3, 2105 and month-00 shapes; reload.

*What is and is not established: Measured on local parses and the July 2026 local graph with current loader code; production was not inspected and no wrong answer was reproduced.*

Where: `packages/pipeline/src/pipeline/graph/loader.py:259`, `packages/pipeline/src/pipeline/references/amendments.py:156`, `packages/policy-corpus/src/primitives/policy-lookup.ts:80`, `packages/agent/src/processors/verifier/evidence.ts:108`

#### DATA-3 · Fee schedules frozen since November 2022 are labelled primary and current for rate questions

**high** · effort M · wrong-answer risk, data quality, cost, needless complexity

The fee-schedule family in `corpus-manifest.json:112-119` crawls an agency page that stopped receiving updates on 3 November 2022; later schedules are on a separate site that is not crawled. None of the 1,998 registry rows carries a 2023 to 2026 date, yet current code labels 189 files `primary`, `packages/pipeline/src/pipeline/graph/loader.py:451` marks every document `current`, and reimbursement wording adds the family to retrieval with a boost. In the July 2026 local graph the family is 96% of stored text and about nine tenths of embedding tokens.

**Impact.** A provider or case manager asking what NC Medicaid pays can be quoted a rate at least four years old from a document described as current, and the verifier accepts it.

**Fix.** Remove `['fee_schedule']` from `OPERATIONAL_TYPE_GROUPS` in `packages/policy-corpus/src/internal/scoring-constants.ts`, delete `scoreFeeScheduleBuckets`, and stop embedding the family. Write `status='archived'` for fee schedules in the loader and stop assigning the `primary` bucket. Mark the manifest family frozen so the daily crawl stops re-validating about 2,000 files. For narrowly matched rate questions, add a `requirements` entry in `resolveCoverageScope` stating that the corpus holds no schedule after 2 November 2022. Add four or five fee questions to the golden set.

*What is and is not established: No stale-rate answer was observed: stored runs cite no fee schedules and the golden set has no fee question. Changing scope policy requires renewed scope approvals under issue #188.*

Where: `corpus-manifest.json:119`, `packages/pipeline/src/pipeline/graph/loader.py:451`, `packages/policy-corpus/src/internal/scoring-constants.ts`, `docs/operations/fee-schedule-compaction.md:43`

**Medium-severity issues**

| Id | Issue | Effort |
| --- | --- | --- |
| DATA-4 | Two current MA-2180 manuals tie in lookup, and document id order picks one | S |
| DATA-5 | Territory-only 42 CFR Part 436 is loaded as authoritative and ranks beside Part 435 | S |
| DATA-6 | Over half of Document nodes are synthetic revision rows that crowd lookups and counts | M |
| DATA-7 | Regulation last-revised dates are wrong or missing where the citation says 'Sept.' | S |
| DATA-8 | Unnumbered headings capture the numbered sections that follow, so container reads are silently partial | M |
| DATA-9 | List letters and numbers are dropped from every PDF section body | S |
| DATA-10 | Mentions in change notices and revised public notices are recorded as amendments | S |
| DATA-11 | Reference resolver links citations to the wrong documents, including every '1915(c)' to one waiver | M |
| DATA-12 | Padded tables push sections past the 6,000-character read cap, hiding the newest rows | S |
| DATA-13 | Fee-schedule dates are misread from titles, so wrong files become the primary schedule | S |
| DATA-14 | XLS, DOCX and HTML parsers drop or misplace content while reporting answer-ready | M |
| DATA-15 | Federal statute and regulation text carries no as-of date in the graph | S |
| DATA-16 | Concept links are keyword mentions labelled COVERS and feed every hybrid search | M |
| DATA-17 | Citation extraction misses most federal cross-references and discards statute subsections | M |
| DATA-18 | `parse --force` reports crashed re-parses as success; `load` and `run-all` exit 0 on errors | S |
| DATA-19 | The no-OCR gate accepts no real PDF, so every PDF is converted twice | M |
| DATA-20 | Every release re-embeds the whole corpus, with thin retry and no spend ceiling | M |

**Low-severity issues (4):** DATA-21 Notice-stage plan amendments reach verifier evidence labelled 'Status: current'; DATA-22 The eCFR primary fetch cannot succeed, and its 406 is documented as an outage; DATA-23 Parse sidecars record no parser versions, and each run re-reads every artifact several times; DATA-24 Model-assisted reference extraction is unused in releases and would misattribute references if enabled.


### Crawler and source lifecycle

Redirect hops are checked against a per-family allow-list, replaced files are archived, and retirement needs durable evidence. The weak point is that the crawler throws away or never records the signals that say a document is no longer current. The agency's own Archived tag is discarded, de-listing is not recorded, and the loader stamps every document `status="current"`, so superseded income tables, old manual versions and unapproved State Plan proposals are answerable as current policy. In the other direction, a document whose last check merely failed is dropped from the release and no gate fails. Discovery health is unobserved: a blocked index counts as success, and the bulletin listing parser matches nothing on the live site. Evidence comes from the live indexes, the workstation registry and an older local graph; production was not inspected. Fix the bulletin selector and the two title parsers first, then capture the Archived tag.

**5 high, 9 medium, 2 low.** Every issue is written up in [issues/crawler-sources.md](issues/crawler-sources.md); the evidence is in [findings/crawler-sources.md](findings/crawler-sources.md).

#### CRAWL-1 · The agency's Archived tag is discarded, so superseded income tables load as current

**high** · effort M · wrong-answer risk, data quality, test gap

`parseDhhsPoliciesPage` takes the first non-top-level `span[data-slug]` as the category and stores no tags (`packages/crawler/src/sources/dhhs-policies.ts:86-95`); the loader stamps every document `status="current"`. On the live index fetched 2026-10-05, 137 of 921 rows carry the agency's Archived tag, including the year-titled income and reserve tables through 2025; 129 are loadable on the workstation. In a fixture probe, the coverage frame for the aged, blind and disabled income limit held the archived 2021 to 2023 tables beside the undated MA-2252, all marked current, and dropped the top-scoring 2026 table.

**Impact.** A case manager asking for a current income or resource limit can be given a superseded year's figure. The verifier checks grounding, not currency, so that answer would be released.

**Fix.** Read `doc_tags` separately from categories in the parser and store them in the `source_listings` side table shared with the de-listing fix, overwriting on each successful parse. In the loader set a boolean `Document.archived` and `status='archived'`, leaving `answer_ready` untouched. Exclude archived documents in the retrieval backends and coverage-frame routing, and sort them last in `lookupPolicy`. Add a tagged-row parser fixture test, a loader test, and a policy-corpus test that the 2025 MAGI scope question still returns `MA-3321-1.pdf`.

*What is and is not established: Frame result is a fixture probe with placeholder figures; graph labels are from the older July local build. The undated MA-2252 row is untagged, so the tag is incomplete.*

Where: `packages/crawler/src/sources/dhhs-policies.ts:86`, `packages/pipeline/src/pipeline/graph/loader.py:451`, `packages/policy-corpus/src/scope/coverage.ts:64`, `packages/policy-corpus/src/primitives/policy-lookup.ts:62`

#### CRAWL-2 · Documents dropped from the agency index stay active and answerable as current

**high** · effort M · wrong-answer risk, data quality

Discovery only adds. `upsertDiscovered` (`packages/crawler/src/db/registry.ts:120-123`) refreshes title and category but never records whether a URL is still on its index page, and the loader stamps every crawled document `status="current"`. A row leaves the active set automatically only after three 404s on its own URL, so a revision posted at a new URL leaves the old file active. On 2026-10-04 the live index listed 920 documents; the workstation registry copy (not production) had 1,209 active `dhhs_policy` rows, 308 of them unlisted, including four versions of MA-2240 Transfer of Assets.

**Impact.** An attorney asking about transfer-of-assets penalties can be answered from an older manual section presented as current.

**Fix.** Add a `source_listings` side table written by the discovery loop (`packages/crawler/src/cli/crawl.ts:66-82`); the Archived-tag fix uses the same table. Derive de-listing at read time per index page after a healthy run, and exclude de-listed `dhhs_policy` rows in the loader's `_document_exclusion_reason`. Never change `status` or create retirement evidence from the signal. Review the roughly 308 backlog rows as one release, spot-checking the administrative letters, and confirm the audit does not count the exclusion as a missing load.

*What is and is not established: Counts are from the workstation registry, not production. The two MA-2240 versions marked current are in the older local graph; whether retrieval prefers the old one was not traced.*

Where: `packages/crawler/src/db/registry.ts:120`, `packages/crawler/src/db/schema.ts:31`, `packages/pipeline/src/pipeline/graph/loader.py:451`, `packages/crawler/src/cli/crawl.ts:66`

#### CRAWL-3 · A failed crawl check removes a document from the release and no gate fails

**high** · effort M · wrong-answer risk, release gate, data quality, test gap

Registry status `error` means the last check failed; the stored payload is kept. Nine Python files declare the active-status set with two memberships: the parser includes `error` (`packages/pipeline/src/pipeline/parse/converter.py:62`); the loader, audit and release counts exclude it (`packages/pipeline/src/pipeline/graph/loader.py:34`). The loader skips the document, the mandatory `missingAnswerReadyLoads` gate cannot see it, and the status flip changes the release-trigger hash. In a scratch run with one or two of 100 required documents in `error`, every gate passed. The committed 2026-10-03 qualification evidence skips 26 such records yet reports zero missing answer-ready loads.

**Impact.** One timeout on a clinical coverage policy removes it from the next release. Attorneys may then be answered from a neighbouring policy or not at all, and the verifier cannot detect an omitted source.

**Fix.** Define the status sets once in `packages/pipeline/src/pipeline/crawler_registry.py` and import them everywhere. The verifiers disagreed on the rest, so choose one: load an `error` row when its registry `file_hash` matches the parsed sidecar, which matches `docs/operations/corpus-parser-recovery.md:118` and lets the existing `missingAnswerReadyLoads` gate cover it; or keep excluding and add a mandatory `requiredCrawlerErrors` gate, which fires on 25 workstation rows today. The first adds no gate. Add loader, audit and release tests for `error`.

*What is and is not established: One of two verifiers rated this medium. Counts are from the workstation registry and committed qualification evidence; no answer affected by an omitted document was observed.*

Where: `packages/pipeline/src/pipeline/graph/loader.py:34`, `packages/pipeline/src/pipeline/parse/converter.py:62`, `packages/pipeline/src/pipeline/audit.py:248`, `packages/pipeline/src/pipeline/release.py:409`

#### CRAWL-4 · Bulletin listing parser matches no posts on the live site

**high** · effort S · data quality, release gate, test gap

`parseBulletinListingPage` selects `.views-row h3 a` (`packages/crawler/src/sources/bulletins.ts:26`), but the live listing now puts titles under `h2.field-content`. A live fetch on 2026-10-04 returned ten rows and the parser matched none; the checked-in fixture from 2026-03-26 still uses `h3`, so the tests pass. A zero-post first page is a debug-level `break`, so the family is still recorded as a successful discovery. The workstation log shows run #26 on 2026-09-26 parsing 0 posts, finding 96 bulletin documents against 388 on 2026-09-05, and completing normally.

**Impact.** At the next crawl, no attachment from a bulletin posted since the markup change enters the corpus, so answers about recent amendments would rest on older guidance. Monthly digest files are still discovered.

**Fix.** Select `.views-row a[href]` and keep links matching `/blog/YYYY/MM/DD/`, de-duplicated, which returns ten posts on the live page and both fixtures. Throw from `bulletinsSource.discover` when a listing page is non-200, or yields zero posts on page 1 or while a next link exists. Re-capture the fixture with `update-fixtures`, replace the March slug assertion with a shape assertion, and add tests for an `h2` row and for a 200 page with no parsable posts.

*What is and is not established: Observed against the live page on 2026-10-04 and in the workstation log. The effect on answers is inferred; no release has been built from the reduced bulletin set.*

Where: `packages/crawler/src/sources/bulletins.ts:26`, `packages/crawler/src/sources/bulletins.ts:215`, `packages/crawler/tests/sources/bulletins.test.ts:65`

#### CRAWL-5 · A discovery that finds nothing counts as success and stamps the family fresh

**high** · effort M · release gate, reliability, data quality, test gap

`discoverDocuments` marks a family successful whenever `discover()` returns without throwing (`packages/crawler/src/crawl/discovery.ts:60-61`). Source modules return empty, break or skip on a 403, 404 or 410, and return whatever matches on a 200 with unrecognised markup. `crawl` then stamps `source_freshness`, even on `--dry-run`, marks the run completed and exits 0; the release gate `freshnessSlaMet` reads only that stamp. With every page answering 403, a reproduction recorded 11 of 11 families successful and three documents, all static seeds. A persistent 429 or server error does fail the family.

**Impact.** If the agency's firewall blocks the crawler or a page is redesigned, new policies stop arriving while the operator sees a completed run and the release freshness gate passes on a stale corpus.

**Fix.** Throw when a configured index or seed page is non-200 or its first listing parses to zero entries, and enforce a per-family minimum count on full runs. Stamp freshness only for passing families, never on `--dry-run`. Exit non-zero when a required family failed, with `scripts/ops/railway-corpus-job.sh` still parsing, syncing and backing up but skipping promotion. Add `discoverDocuments` tests for a 403 index and unrecognised markup, and a crawl test that a dry run stamps nothing.

*What is and is not established: Reproduced with every page forced to answer 403; no real block or redesign has occurred beyond the bulletin markup change.*

Where: `packages/crawler/src/crawl/discovery.ts:60`, `packages/crawler/src/sources/crawl-helpers.ts:43`, `packages/crawler/src/cli/crawl.ts:91`, `packages/pipeline/src/pipeline/release.py:465`

**Medium-severity issues**

| Id | Issue | Effort |
| --- | --- | --- |
| CRAWL-6 | Unapproved State Plan proposals are loaded as authoritative, current policy | M |
| CRAWL-7 | Crawler title parsers drop or split policy numbers, breaking lookup by number | S |
| CRAWL-8 | Bulletin pagination stops at 50 pages, so older posts are never reached | M |
| CRAWL-9 | Crawler tombstones documents after three 404s, and each tombstone blocks every release | S |
| CRAWL-10 | Download guards accept empty and wrong-type payloads and buffer oversized bodies in memory | S |
| CRAWL-11 | A document can be marked unchanged when its stored file is missing | S |
| CRAWL-12 | A third URL canonicalizer disagrees with the registry key on attachment links | S |
| CRAWL-13 | Registry writes wait until a phase ends, so a killed crawl loses its bookkeeping | S |
| CRAWL-14 | Stored ETag and Last-Modified values go stale, so daily checks re-download unchanged files | S |

**Low-severity issues (2):** CRAWL-15 Fee-schedule variant selection can prefer a file that cannot be loaded; CRAWL-16 robots.txt is checked for three of seven hosts and the contact URL is dead.


### Evaluation and model selection

The harness has sound parts: a judge from a different vendor than the system under test, infrastructure errors kept out of quality means, retrieval evaluation that calls production code, and fingerprinted release evidence. The main risk is that its numbers are trusted further than they can bear. Some reference answers are unsupported by their cited sections, every question set has been tuned against, the hallucination score is distorted by withheld answers, a lenient judge prompt and a faulty evidence budget, and the release floors have never been met and sit inside run-to-run noise. Nothing has been measured on the current 55-question benchmark, and no release has completed. First, fix the judge scoring defects and pin reasoning effort; then run retrieval alone and one answer run on the candidate graph, and reset the floors from those measurements before paying for a qualification cycle. Replace `gpt-5-mini` before 11 December 2026.

**2 high, 16 medium, 1 low.** Every issue is written up in [issues/evaluation-models.md](issues/evaluation-models.md); the evidence is in [findings/evaluation-models.md](findings/evaluation-models.md).

#### EVAL-1 · Golden reference answers assert facts their cited sections do not contain

**high** · effort M · evaluation validity, data quality, wrong-answer risk, release gate

The judge prompt labels every reference answer in `packages/pipeline/data/golden/dataset.json` "verified correct" (`packages/pipeline/src/pipeline/eval/judge.py:15`) and scores factual accuracy as agreement with it. Checked against the local July 2026 graph, the keys for `q-017`, `q-019`, `q-026`, `q-027`, `q-031` and `q-039` are unsupported or contradicted by the sections they cite. Twelve keys rest only on generic template sections; section 4.1 matches one template in 161 of 177 clinical policies. Fourteen of 55 entries are marked NEEDS_VALIDATION, and `q-042`, `q-044` and `q-045` are instructions, not answers.

**Impact.** Attorneys and beneficiaries would get answers shaped by these keys: the rules at `packages/agent/src/prompt.ts:20-21` were tuned to them and favour a definitive "No" citing generic sections. Accurate answers score lower.

**Fix.** Remove "(verified correct)" from the judge prompt, add a `status` field and skip unvalidated entries, and give each key verbatim `supporting_quotes` checked by an `eval validate-golden` preflight. Publish this as a versioned dataset, then re-evaluate the prompt rules and the section promotion in `packages/policy-corpus` against it. The owner must choose: amend issue #188 to name the new version before the qualification cycle, or run the cycle on the unchanged 55 questions and correct the keys afterwards.

*What is and is not established: Six keys were checked directly against the older local graph; the full tally of 24 suspect entries was not independently reproduced. The effect on production answers is inferred.*

Where: `packages/pipeline/data/golden/dataset.json:1160`, `packages/pipeline/src/pipeline/eval/judge.py:15`, `packages/agent/src/prompt.ts:20`, `packages/pipeline/data/golden/dataset.json:1777`

#### EVAL-2 · Release floors have never been met and one noisy run decides

**high** · effort M · release gate, evaluation validity

`corpus-release-policy.json:17-20` sets four floors that accept no override, and `packages/pipeline/src/pipeline/cli/release.py:283` decides on a single answer run. No stored run meets the retrieval floors: ten June 2026 runs scored recall 0.295 to 0.36 and primary hit 0.46 to 0.58 against 0.9 and 0.95. Three July runs of one configuration scored 2.694, 2.760 and 2.729 against the 2.75 answer floor, and both complete September gate runs missed it. A proposed rule blocking on repeated low hallucination scores fails 77 of 114 unchanged July triples.

**Impact.** The owner's next paid qualification cycle can be rejected, or pass or fail by chance, and every corpus fix waits behind it. No wrong answer reaches a user.

**Fix.** Run the retrieval evaluation alone on the candidate graph, then one 55-question answer run, before paying for a cycle. Fail `release-validate` on retrieval before the answer stage, and reset the retrieval floors to the measured values minus 0.02 to 0.04. Apply the answer floors to the released-row mean of three runs without requiring each to pass. Split the regression limit by metric scale and fail when no baseline exists. Print repeated low-hallucination questions as a review list, not a gate.

*What is and is not established: All figures come from stored June to September runs on the legacy graph and 50-question sets. Nothing has been measured on the current 55-question benchmark or retrieval path.*

Where: `corpus-release-policy.json:17`, `packages/pipeline/src/pipeline/cli/release.py:283`, `packages/pipeline/src/pipeline/release.py:514`, `docs/operations/blue-green-corpus-releases.md:247`

**Medium-severity issues**

| Id | Issue | Effort |
| --- | --- | --- |
| EVAL-3 | Agent reasoning effort is never set, so it changes silently with the model | S |
| EVAL-4 | Withheld answers are judged and score a perfect 3 on hallucination | S |
| EVAL-5 | Hallucination judge sees the reference answer and accepts any fetched text as support | S |
| EVAL-6 | Judge evidence budget drops all agent evidence for three questions | S |
| EVAL-7 | Mandatory scope acceptance does not check what two pass cases actually say | S |
| EVAL-8 | The held-out set is a tuned paraphrase set with retired section identifiers | M |
| EVAL-9 | Answer evaluation runs a reduced agent and never calibrates the verifier | L |
| EVAL-10 | No benchmark question exercises section truncation, sibling policy lookup or fee schedules | M |
| EVAL-11 | The model comparison script cannot resolve the differences it decides on | M |
| EVAL-12 | Scope gate and injection detector depend on a model retiring 11 December 2026 (deadline 2026-12-11) | S |
| EVAL-13 | Judge call has no retry, scores parse failures as zero, and its credentials failed | M |
| EVAL-14 | The weekly gate before the production data push cannot fail closed | S |
| EVAL-15 | Evaluation harness parses agent output loosely and its real subprocess path is untested | M |
| EVAL-16 | Unknown model identifiers route to Anthropic, and the advertised Claude path cannot run | M |
| EVAL-17 | Chat cost reporting omits the verifier and classifiers and cannot price cache writes | M |
| EVAL-18 | Jev experiment gates cannot answer the questions they are meant to decide | M |

**Low-severity issues (1):** EVAL-19 Model documentation and two comparison-script gates have drifted from code defaults.


### Corpus releases, deployment, backups and CI

Two generations of data operations coexist. The laptop tier is still installed: its Saturday job would wipe the production graph if its incidental failures cleared, and the chat-store backup has produced nothing since 21 September. The hosted blue-green tier has fail-closed gates, a tested job wrapper and atomic manifests, but it has never promoted. On current evidence it cannot: the retrieval floors are arithmetically out of reach, no stored golden-set run meets the answer floor, the statute source is offline, and release inputs are checked only after a paid rebuild. Its scheduled path would then stop daily on scope approvals and retention locks. The main risk is a stale or destroyed serving graph with no rehearsed way back. First unload the Saturday job, then make one release attainable by removing bindings and recalibrating gates, repair the backup, and migrate Railway configuration before 1 December 2026.

**1 high, 17 medium, 5 low.** Every issue is written up in [issues/release-ops.md](issues/release-ops.md); the evidence is in [findings/release-ops.md](findings/release-ops.md).

#### OPS-1 · Installed Saturday laptop job ends in an unattended wipe of the production graph

**high** · effort S · reliability, wrong-answer risk, documentation

`scripts/ops/weekly-refresh.sh:77` runs `npm run deploy-data -- --yes`, whose `load --reset` deletes every node in the Neo4j service recorded as serving production. Both gates pass vacuously when the cache directory is empty (`scripts/ops/eval-gate.sh:34-37`; the change gate compares against `none`). The launchd job was still loaded on 2026-10-05; recent runs stopped only because Docker was not running and because of a `better-sqlite3` Node version mismatch. `RUNBOOK.md:145` and `:424` still document this path as current.

**Impact.** Users would query an empty or partial graph during the reload, the tagged legacy graph that every validation record uses as its baseline would be gone, and `/readyz` would return 503.

**Fix.** Unload the job today with `launchctl bootout gui/$(id -u)/com.ncmedicaid.weekly-refresh` and delete its plist; do not run `scripts/ops/install-launchd.sh --uninstall`, which also removes the backup job. Pause the `HC_URL_WEEKLY` check. Then choose: delete `scripts/ops/weekly-refresh.sh`, `scripts/ops/eval-gate.sh`, `scripts/ops/railway-tcp-proxy.sh` and `scripts/deploy-data.sh` and rewrite the RUNBOOK sections now (two verifiers), or keep `deploy-data` until blue-green activation, documented as leaving `/readyz` failing (one verifier). Give `scripts/ops/backup-corpus.sh` another caller.

*What is and is not established: The wipe has not happened. The local crawl, pipeline, audit, evaluation and Railway login must all succeed first, but none of them is a designed safeguard.*

Where: `scripts/ops/weekly-refresh.sh:77`, `scripts/deploy-data.sh:74`, `scripts/ops/eval-gate.sh:34`, `RUNBOOK.md:424`

**Medium-severity issues**

| Id | Issue | Effort |
| --- | --- | --- |
| OPS-2 | Neither retrieval floor in the release gate can be met on the 55-question benchmark | M |
| OPS-3 | No stored golden-set run reaches the 2.75 answer floor, and one run decides | M |
| OPS-4 | A release-gate override file stays in force for every later unattended release | S |
| OPS-5 | Interrupted cutover is unfenced, and the seven-day lock makes deferral a daily failure | M |
| OPS-6 | Cutover, rollback and scope acceptance each hinge on single unrepeated verifier outcomes | M |
| OPS-7 | Release inputs are checked only after a full-cost wipe and rebuild, retried daily | M |
| OPS-8 | Answer-scope approvals are voided by any crawl change, stopping the scheduled job daily | M |
| OPS-9 | First-release prerequisites invalidate one another, and bootstrap cannot override the freshness gate | M |
| OPS-10 | The first corpus release cannot build while uscode.house.gov is under maintenance | S |
| OPS-11 | Production chat-store backup has failed every day since 22 September 2026 | M |
| OPS-12 | Chat-store backups are plaintext in the same Railway account; no restore is rehearsed | M |
| OPS-13 | Railway stops reading the checked-in `railway.json` files on 1 December 2026 (deadline 2026-12-01) | M |
| OPS-14 | Runbook emergency commands are wrong: rollback does not roll back, chat-store restore is unsafe | M |
| OPS-15 | Volume restore treats a failed bucket listing as absent and restores the legacy layout | S |
| OPS-16 | Corpus job has no drain time and parses downloads as root with every credential | S |
| OPS-17 | Local graphs never pass readiness, so real-agent smoke suites skip as 'Agent not reachable' | S |
| OPS-18 | Corpus-job image ships unused CUDA libraries and downloads parser models at run time | M |

**Low-severity issues (5):** OPS-19 The graph reset is never confirmed before a release build proceeds; OPS-20 After bootstrap, the first scheduled run always starts a new release; OPS-21 Bootstrap activation rewrites the agent's entire variable set with `replace: True`; OPS-22 `parse-import` reads manifest and sidecar fields only after replacing the first artifact; OPS-23 Release code carries a dead fee-schedule report and write-only marker state.


### Web app, user experience and accessibility

The web client enforces the rule that matters most: it shows no answer prose without a server release, and markdown rendering is safe by default. The main risk is in the surfaces a legal-aid user relies on to check an answer. Footnotes often highlight a different section from the one cited (15.4% of citations when stored answers were replayed locally), a withheld answer is displayed like an ordinary one while a leftover dot can say checks passed, and the Markdown export drops links and sources and reads only the newest 40 stored messages. Turn state is inferred from message parts, so stopping, re-running or switching threads produces false failure notices or hidden turns. Accessibility groundwork exists, but focus, announcements and contrast have gaps. Evidence is code reading plus local probes; nothing was observed in the deployed app. Fix the citation resolver first, then the withheld display and the export; the sidebar scroll fix is one class name.

**1 high, 11 medium, 4 low.** Every issue is written up in [issues/web-ux.md](issues/web-ux.md); the evidence is in [findings/web-ux.md](findings/web-ux.md).

#### WEB-1 · Citation footnotes fall back to the document URL and highlight the wrong section

**high** · effort M · wrong-answer risk, user experience, test gap, live failure

`buildCitationResolver` (`packages/web/src/lib/message-citations.ts:40-105`) matches a citation by exact label, then by an ancestor rule that requires an identical `Policy` string and strictly fewer dotted segments, then by URL, which returns the document's first section row. Federal labels, `Policy 1-H` against rows labelled `1H`, and subsections carried inside an `N.0` row all fall through. Replaying stored answers through the real functions, 1,901 of 12,359 citations (15.4%) in 525 of 1,547 answers resolved to a different section's row, including about half of federal citations. Answer text and links stay correct.

**Impact.** An attorney clicking a footnote is shown a sibling section's excerpt as the source, and a citation of a never-retrieved section still gets a footnote number. Copied and exported text carry the same numbers.

**Fix.** Replace the `Policy`-only parse with one rule scoped to rows sharing the link's normalised URL: match the token after `§` to a row's section number or its deepest ancestor, treating a row ending in `.0` as the parent of `N.x`. Otherwise use a document-level or sole row, else show no footnote number. Build the cited group from resolved rows. Rewrite the test pinning first-row fallback; add federal, suffixed-label, never-retrieved, `Policy 3L-1 § 5.6` and `Policy 1-H § 3.2.1` fixtures.

*What is and is not established: Incidence comes from replaying stored answers on the older local graph with rebuilt source panels, not production. Two round-one verifiers rated this high and medium; high kept given the measured rate.*

Where: `packages/web/src/lib/message-citations.ts:104`, `packages/web/src/lib/message-citations.ts:49`, `packages/web/src/lib/message-citations.ts:92`, `packages/web/src/lib/message-sources.ts:55`

**Medium-severity issues**

| Id | Issue | Effort |
| --- | --- | --- |
| WEB-2 | Withheld answers look like ordinary answers, and the Sources dot says checks passed | M |
| WEB-3 | Markdown export drops citation links and the source list; print output is faint | S |
| WEB-4 | Thread restore and export load only the newest 40 stored messages | M |
| WEB-5 | Re-running an earlier answer hides every later turn while the server appends | M |
| WEB-6 | Switching threads mid-answer orphans the run and shows a false failure on return | M |
| WEB-7 | Stopped or dropped answers keep showing progress and blame an API error | S |
| WEB-8 | Feedback on a live answer can detach after reload because message ids differ | S |
| WEB-9 | Sidebar thread list cannot scroll once full and pushes Sign out off-screen | S |
| WEB-10 | Keyboard and screen-reader users lose focus on footnotes and miss errors and research phases | M |
| WEB-11 | Accent text, thinned labels and focus rings fall below accessibility contrast minimums | S |
| WEB-12 | A 60-second status poll from any open chat tab keeps the agent awake | S |

**Low-severity issues (4):** WEB-13 Released answers show a green verified badge but no not-a-case-decision caution; WEB-14 Block notices read at college level and the prompt never requests plain language; WEB-15 Six groups from the June quality-assurance handoff remain open and untracked; WEB-16 Every keystroke in the composer re-renders and re-parses the whole transcript.


### Mastra, AI SDK and dependencies

Installs from source are reproducible: both lockfiles are complete and hashed, and base images and tools are pinned by digest. Nothing in this section fails for a user of the deployed product today; the one live failure is the laptop's scheduled jobs. The weakness lies outside the locks. The Mastra family is half pinned across two release trains, the single-core override is ignored by the pinned npm, and the agent image is built from a second install that no lockfile or audit governs. Parser model weights and Python advisories are unwatched. The main risk is an upgrade that passes every check and still breaks chat; the open, green pull request #190 is one. First close #190 and #164 and pin the Mastra family exactly behind a lockfile check, then make the image ship the locked tree. Refresh both AI SDK providers before any GPT-6 comparison.

**0 high, 7 medium, 8 low.** Every issue is written up in [issues/framework-deps.md](issues/framework-deps.md); the evidence is in [findings/framework-deps.md](findings/framework-deps.md).

**Medium-severity issues**

| Id | Issue | Effort |
| --- | --- | --- |
| DEPS-1 | Mastra packages span two release trains, and the single-core override does not hold | M |
| DEPS-2 | Agent image ships a second dependency tree outside the lockfile and audit | M |
| DEPS-3 | Parser model weights are fetched unpinned at run time and never recorded | M |
| DEPS-4 | Installed AI SDK providers mishandle GPT-6 and Claude 5.5 model identifiers | S |
| DEPS-5 | Node and Python pins disagree and are unenforced; laptop scheduled jobs now fail (deadline 2027-04-30) | S |
| DEPS-6 | Nothing watches for vulnerable dependencies outside the npm production tree | M |
| DEPS-7 | Dependabot groups split coupled package families across separate pull requests | S |

**Low-severity issues (8):** DEPS-8 Memory release gate patches nine methods by name and cannot notice new ones; DEPS-9 Unlogged duplicate-item workaround runs every model step but changed nothing in replays; DEPS-10 Production has no tracing; enabling it would export user identity and questions unredacted; DEPS-11 Internal packages use an npm scope nobody has registered; DEPS-12 Audit gate accepts exceptions with a missing or malformed expiry date; DEPS-13 Root npm overrides are mostly redundant, and one forces an undeclared major version; DEPS-14 Mastra's Apache-labelled packages contain Enterprise-licensed code that the auth provider imports; DEPS-15 Four dependencies add install and image weight the product does not use.


### Tests and quality gates

The suites are fast and stable: about 1,340 JavaScript and 724 Python tests run in under a minute. The answer-release path is tested through a real Mastra agent, memory and SQLite, and sentinel strings show that no draft leaks. Tests are weak wherever a fake stands in for the real thing: most of the release predicate, the real HTTP server, tool schemas, Cypher text, the Python and TypeScript contracts, and the browser wire format. A mutation probe aimed at the riskiest lines (a judgment sample) found that 21 of 30 single-line changes passed every test. Almost every item is latent: the code is right today, and a refactor or the planned Mastra upgrade could break it with every check green. Two gaps have already hidden live defects, in the chat identifier guard and in thread ownership. Start with the test tables for the identifier guard, the release predicate and the stream gate.

**0 high, 15 medium, 10 low.** Every issue is written up in [issues/tests.md](issues/tests.md); the evidence is in [findings/tests.md](findings/tests.md).

**Medium-severity issues**

| Id | Issue | Effort |
| --- | --- | --- |
| TEST-1 | Six of ten answer-release predicate terms can be deleted with every test green | S |
| TEST-2 | Five secondary answer-release defences can be removed without failing a test | S |
| TEST-3 | Citation validators skip six input forms and wrongly flag three; tests are single examples | S |
| TEST-4 | No test exercises the chat identifier guard, which rejects ordinary Medicaid questions | S |
| TEST-5 | No test runs the real Mastra server; cross-user isolation rests on stub handlers | M |
| TEST-6 | No test submits a research decision or cancellation as a non-owner | S |
| TEST-7 | Retention SQL for conversations and research snapshots never executes in any test | S |
| TEST-8 | Every tool test replaces `createTool`, so Mastra's schema validation never runs under test | S |
| TEST-9 | Most retrieval Cypher goes unchecked: stubs ignore query text and failures are swallowed | M |
| TEST-10 | No test crosses the Python and TypeScript boundary; each side uses hand-written fixtures | M |
| TEST-11 | Browser and component tests render hand-written streams the answer gate cannot produce | M |
| TEST-12 | The mocked browser backend never checks requests and omits nine of sixteen routes | M |
| TEST-13 | Deep-research recovery was validated only with stub agents and a reduced live run | M |
| TEST-14 | No automated accessibility check exists, and browser tests run only desktop Chrome | S |
| TEST-15 | Production smoke fails on its second run because it leaves a same-titled thread | S |

**Low-severity issues (10):** TEST-16 Neither the benchmark nor unit tests can detect policy-number extraction or lookup-ordering errors; TEST-17 Verifier tests cover dead fallback code while live release-target selection is untested; TEST-18 Ranking tests pin eight exact floats yet miss two scoring errors; TEST-19 Verifier call bounds are weakly pinned: retryability, deadline and retry count; TEST-20 The only real-document loader test asserts little more than non-emptiness; TEST-21 The opt-in Playwright smoke and design projects have rotted outside continuous integration; TEST-22 The daily rate-limit window can be halved without failing a test; TEST-23 Test runs read live provider keys and write to the operational crawl log; TEST-24 Root `npm test` can replay a stale pass after a dependency package changes; TEST-25 Coverage is never measured, and contracts tests, browser tests and Python escape type checking.


### Architecture, complexity and the knowledge system

The core holds: the TypeScript packages layer without import cycles, the answer-release boundary fails closed, and `.env.example` and `AGENTS.md` match the code. The risk sits around that core. Production wiring exists only in an import-time script that no test assembles and that evaluation runs in reduced form. When an answer is withheld or reported wrong, the verifier's findings were never stored, so the owner cannot explain it. Rules that bind every contributor, including the US-hosted inference rule, exist only in the owner's private notes. Recorded lessons are not turned into fixes: the scheduled chat-store backup failed on thirteen consecutive days, and the note describing its cause changed nothing. Every impact here is read from code, documents and local logs; nothing was run against production. I would repair the backup script first, then record verifier findings and usage per answer, then write the inference-governance decision.

**0 high, 4 medium, 5 low.** Every issue is written up in [issues/architecture-docs.md](issues/architecture-docs.md); the evidence is in [findings/architecture-docs.md](findings/architecture-docs.md).

**Medium-severity issues**

| Id | Issue | Effort |
| --- | --- | --- |
| ARCH-1 | A past answer's verifier findings cannot be recovered, and chat verifier cost goes unrecorded | M |
| ARCH-2 | One import-time script wires production and doubles as the evaluation command line | M |
| ARCH-3 | A documented backup failure went unfixed for thirteen days; history swamps current guidance | M |
| ARCH-4 | Binding contributor rules and key model decisions have no authoritative record in the repository | M |

**Low-severity issues (5):** ARCH-5 Two environment parsers: validated settings go unread while unvalidated ones accept malformed values; ARCH-6 Contracts package carries schemas nothing parses, and the web validates no response against it; ARCH-7 TypeScript and Python meet through stdout text protocols and duplicated table definitions; ARCH-8 Setup and configuration documents fail on a fresh checkout and omit production requirements; ARCH-9 RUNBOOK misdescribes the daily job and the federal cache; package READMEs list stale counts.


## Roadmap

The order matters more than the list. Almost every fix to corpus data or retrieval needs a new corpus release to reach production, and no release can complete today. So the plan is: stop the bleeding, fix what needs no release, make a release possible, then spend it.

### Today

The four actions at the top of this report: rotate the Neo4j password (SEC-1), unload the Saturday job (OPS-1), take a manual chat-store backup (OPS-11), reset the smoke-test password (SEC-4).

### This week: small changes that need no corpus release

Most of these are under a day each.

- **What users hit.** The identifier screen (CHAT-1) with its test (TEST-4); the reflection guard and the stranded-plan lockout in deep research (RSRCH-1, RSRCH-2); the footnote resolver (WEB-1); the withheld-answer display (WEB-2).
- **The release gate.** Evidence ordering (SAFE-2), the federal-bound prompt rule (SAFE-1), the stream-gate allowlist (SAFE-8), the routing-hint guard (SAFE-9), and tests for the six unpinned release conditions (TEST-1).
- **Memory.** Set `OBSERVATIONAL_MEMORY_ENABLED=false`, add `lastMessageOnly: true` to both injection detectors, and add the missing retention statement (PRIV-2).
- **Access and privacy.** The thread-ownership guard and the `include` fix (SEC-2), sign-up by invitation (SEC-8), `store: false` on every OpenAI call (PRIV-5), Sentry request bodies off (PRIV-4), fewer GitHub Apps and the Claude workflow permissions (SEC-6).
- **Models.** Pin reasoning effort and record it (EVAL-3); move the classifiers and health probe off `gpt-5-mini` and give them deadlines (EVAL-12, CHAT-11).
- **Evaluation scoring.** The three judge defects (EVAL-4, EVAL-5, EVAL-6). They change no product behaviour and make every later measurement more honest.
- **Operations.** Repair the backup script (OPS-11), pin the Mastra family exactly and close pull requests #164 and #190 (DEPS-1), bound the four unbounded lookup tools (RETR-18).
- **Help for people in trouble.** One reviewed "Get help" block with real contacts, and the 988 and 911 line (SAFE-12, SAFE-13).

### Before the first customer

1. **Make one release attainable** (OPS-2, OPS-3, OPS-7, OPS-9, EVAL-2). Add a preflight that checks inputs before any rebuild, run the retrieval evaluation alone on a candidate graph, set the floors from what you measure, and decide in issue #188 how withheld answers count. Fetch the statute and regulations from GovInfo (DATA-1, OPS-7). Fence the cutover (OPS-5) and correct the runbook's emergency commands (OPS-14).
2. **Spend the first release on currency and lookup.** The Archived tag and delisting (CRAWL-1, CRAWL-2), documents dropped on a failed crawl check (CRAWL-3), bulletin discovery (CRAWL-4, CRAWL-5), fee schedules (DATA-3), effective dates (DATA-2), exact policy lookup and the alias rules (RETR-1, RETR-2), coverage-section selection (RETR-3), the router's substring rules (RETR-4), reading long sections (RETR-5), the beneficiary-guidance family (RETR-16), and the under-21 exception (SAFE-3).
3. **Correct the reference answers** (EVAL-1). This is work for someone who knows the policy, and it is the single most valuable piece of evaluation work available: 24 of the 55 keys were checked in this review and several are unsupported; the other 31 are unchecked.
4. **Measure the verifier** (SAFE-6) with a seeded-fault benchmark, and store every answer's verification record (ARCH-1). Then decide whether a second-vendor pass is worth it.
5. **Make the production identity real.** A production WorkOS environment (SEC-7), privacy and retention statements that match the code (PRIV-6, PRIV-7), a rehearsed restore (OPS-12).
6. **Migrate Railway configuration before 1 December** (OPS-13).
7. **Test what production runs.** Extract the server wiring from `index.ts` (ARCH-2), add one contract test that boots the real server (TEST-5), and one fixture shared by the Python writer and the TypeScript reader (TEST-10).
8. **Accessibility.** Focus, live regions and contrast (WEB-10, WEB-11), and an automated check so it stays fixed (TEST-14).

### After that

- **Find out what the retrieval heuristics are worth** (RETR-7, RETR-27). Write 20 to 40 questions on documents the golden set does not touch, never tune on them, and run the ablation. Delete the branches that do not beat it.
- **Answer questions about a past date honestly** (SAFE-5), starting with detection and a plain statement that only current text is held.
- **Upgrade the Mastra family** under issue #145, following the plan in the Mastra section.
- **Simplify deep research** (RSRCH-12) and the planner (RETR-23) once the evaluation can show nothing was lost.
- **A multi-turn evaluation**, which nothing in the project has today and which every question about memory and follow-ups depends on.

### What to leave alone

The 63 low-severity issues, most of the test-gap issues that are not named above, and the documentation issues can wait until a customer is using the product. They are written up in the area files so that they can be picked up when someone is already working in that code.

## How this review was done, and what it could not check

**Scope.** Commit `c48a9d4` on `main`, reviewed on 4 and 5 October 2026. The review was read-only: no file in the repository was changed, no commit was made, and `git status` was clean at the end. The report itself was added to the repository afterwards.

**Round one.** Thirty-two reviewers each took one scope: sixteen package scopes (for example the verifier, the deep-research workflow, the crawler, the graph loader) and sixteen cross-cutting lenses (security, privacy, Mastra usage against the installed version, Mastra upstream, AI SDK usage, model inventory, model strategy, dependencies, documentation, test quality, mutation testing, architecture, retrieval design, earlier review findings, performance and cost, and the live graph). Each read its scope in full. Between them they read 650 of the 680 tracked code and configuration files; the 30 unread files are empty `__init__.py` files, two small config files and 18 test files. One more agent ran the build and test baseline.

**Verification.** Every finding was then attacked by independent verifiers told to refute it. Findings rated medium or higher got three verifiers with different questions: is it true of the code, does it matter for this project, and is the proposed fix right. Low-severity findings got one combined check. Verifiers opened the cited code and the installed `node_modules` sources, ran throwaway scripts and mock-model probes outside the repository, and checked external facts against vendor documentation. Of 337 unique findings, 332 were confirmed, 1 was contested and 4 were rejected. Verification mattered more for calibration than for rejection: it corrected a detail in 258 claims and lowered the severity of 115. Reviewers had proposed 1 critical and 91 high findings; 45 high findings remained.

**Round two.** A critic who read all of round one found that its facts held but that its reviewers had prescribed incompatible fixes in fifteen places, that several high ratings restated one defect, and that reviewers had stopped at their limit of 12 findings each. Six studies were run to settle the most important disagreements: a policy-number lookup bake-off, a design for effective dates and amendments, a review of coverage-section selection, a test of whether the release gates can be met at all, a walkthrough of the release path, and a replay of proposed fixes against stored answers. Further reviews covered secrets in the git history, Medicaid facts hard-coded in prompts, and how the product treats vulnerable users, and three triage passes promoted the most serious of the unverified minor notes. The 82 new findings went through the same verification. Fourteen editors then merged all 415 findings into the 256 issues in this report, reconciling conflicting fixes and adding to each issue a statement of how far its evidence goes.

**Round two was cut short.** The account reached its usage limit partway through, and four pieces of planned work did not run: a full audit of the 55 golden answer keys against the corpus (24 were checked in round one), triage of the minor notes from 8 of the 32 scopes, and the second of two completeness critics. These are the review's known gaps.

**What was not checked.** These limits matter when reading the findings.

- **No live model calls.** The review made no paid requests, so answer quality, the verifier's real miss rate, classifier false-positive rates and latency were not measured. Findings about model behaviour rest on code, mock-model probes and the repository's own stored evaluation results.
- **No production access.** Railway variables, the production graph and production logs were not inspected. Statements about deployed settings (for example that production overrides the agent model to `gpt-5.4`) come from the repository's own audit documents.
- **The local graph is an older build.** The Neo4j copy on this machine was loaded in July 2026 with legacy document ids. Counts measured on it describe that build. Where a finding depends on it, the reviewer confirmed that the code producing the pattern is unchanged, but production numbers may differ.
- **Most minor notes remain unverified.** Round two promoted and verified the most serious from 24 of the 32 scopes; the rest are listed separately and should be read as leads, not findings.
- **Impact is mostly inferred.** A finding marked verified means the mechanism exists in the code. Where it was also reproduced, the issue says how: with mock models, scratch scripts, the local graph or stored evaluation runs. No wrong answer was observed reaching a real user.
- **Severity assumes a pre-customer product.** Several issues rated medium here would be high once real users and real client information are involved.

## Files that accompany this report

| File | Contents |
| --- | --- |
| `issues/<area>.md` | Every issue in that area written up in full: what is wrong, the impact, the fix, and how far the evidence goes. Also lists what is working in the area. |
| `findings/<area>.md` | The verified findings behind each issue: location, claim as corrected by verification, evidence, impact, detailed fix, how it was checked. |
| `issue-index.md` | One line per issue: id, severity, effort, title. |
| `rejected-and-contested.md` | The findings verification rejected or contested, with the reasoning. |
| `minor-notes-unverified.md` | The 792 smaller observations reviewers recorded but did not verify. Leads, not findings. |
| `artifacts/` | Working material the reviewers produced: the model and inference inventory with prices, the data-flow map for privacy, the gate ledger, the research and release state machines, the mutant table, environment-variable lists, the ledger of earlier review findings, the live-graph inventory, and the round-two studies (policy-number bake-off, amendment-date design, release-gate attainability, release-path walkthrough, stored-run incidence, domain-fact audit, vulnerable-user review, secrets scan). |
