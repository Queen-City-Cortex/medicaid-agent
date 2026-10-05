# Working artifact from the docs-drift reviewer

## A. Environment variables

Method: throwaway scanners in the scratch dir (`envscan.py`, `docscan.py`). Code side: `process.env.X`, `env.X`, `strEnv/intEnv/boolEnv('X')`, `nonEmpty/parseInteger(env,'X')`, `os.environ*`/`os.getenv`, and shell `${X:-…}` / unassigned `$X` across tracked TS/JS/Python/shell. Excluded: test-only reads, shell locals, Docker build ARGs, `NODE_ENV`/`CI`/`HOME`/`PATH`. Docs side: any occurrence of the name in README, RUNBOOK, AGENTS, .env.example, docs/{README,architecture,development,operations,decisions}, package READMEs, packages/web/AGENTS.md, deploy/railway/neo4j.env.example. "Documented" means the name appears somewhere, not that the description is right (see A4).

**Result: 188 env inputs read by non-test code; 98 named in at least one in-scope doc; 90 in none.**

### A1. Read by code, documented nowhere in scope (90)

Bold = changes production behaviour or blocks boot. `HC_URL`, `LOG_FILE`, `CORPUS_JOB_CHILD` and `CORPUS_JOB_TEST_SOURCE_ONLY` are set by calling scripts or tests rather than operators; they are counted because the scripts read them from the environment.

| Area | Variables (first read) |
| --- | --- |
| agent (26) | **`CORS_ORIGINS`** (runtime-config.ts:94; localhost rejected in production :134), **`PUBLIC_PRODUCTION`** (runtime-config.ts:86; makes SENTRY_* mandatory), **`CONVERSATION_RETENTION_DAYS`** (:161, default 90), **`FEEDBACK_RETENTION_DAYS`** (:162, 180), `RATE_LIMIT_RETENTION_HOURS` (:164, 25), **`EXA_API_KEY`** (deep-research/config.ts:36; enables third-party web search), **`VOYAGE_MODEL`** (config.ts:7), **`EMBEDDING_DIMENSIONS`** (policy-corpus.ts:19), `DEEP_RESEARCH_MODEL` (deep-research/config.ts:9), `DEEP_RESEARCH_MAX_SUB_QUESTIONS` (:12), `DEEP_RESEARCH_MAX_REFLECTION_ROUNDS` (:15), `DEEP_RESEARCH_WORKER_MAX_STEPS` (:21), `DEEP_RESEARCH_PLANNER_MAX_STEPS` (:24), `DEEP_RESEARCH_CONCURRENCY` (:27), `DEEP_RESEARCH_NOVELTY_MIN_NEW_IDS` (:33), `DEEP_RESEARCH_WEB_MAX_RESULTS` (:38), `DEEP_RESEARCH_SERVICE_CONCURRENCY` (index.ts:81), `VERIFIER_MAX_SOURCE_TOKENS` (verifier/config.ts:6), `HEALTHZ_OPENAI_PROBE_MODEL` (health.ts:67), `ALLOW_MASTRA_STUDIO` (index.ts:269), `LOG_LEVEL` (logger.ts:21), `AGENT_EVAL_CAPTURE_ROUTE` (tools/answer-frame.ts:103), `JEV_VALIDATION_LEDGER`, `JEV_VALIDATION_PRICING` (jev/validation-budget.ts:8), `RAILWAY_SERVICE_ID` (:20), `RAILWAY_VOLUME_MOUNT_PATH` (docker-entrypoint.sh:15) |
| web (3) | **`NEXT_PUBLIC_MASTRA_URL`** (lib/mastra-url.ts:18; build-time, falls back to http://localhost:4111), `NEXT_PUBLIC_DEBUG_CHAT` (lib/debug.ts:4), `RAILWAY_PUBLIC_DOMAIN` (app/auth/callback/route.ts:15) |
| pipeline (12) | **`EMBEDDING_MODEL`** (config.py:51), `NEO4J_DATABASE` (config.py:43), `LIBREOFFICE_BINARY` (parse/converter.py:719), `AGENT_EVAL_TIMEOUT_SECS`, `AGENT_EVAL_MAX_RETRIES`, `AGENT_EVAL_RETRY_DELAY_SECS`, `AGENT_EVAL_HEARTBEAT_SECS`, `AGENT_EVAL_POLL_SECS`, `AGENT_EVAL_ERROR_TAIL_CHARS` (eval/levels/answer.py:23-28), `RETRIEVAL_CLI_TIMEOUT_SECONDS`, `RETRIEVAL_BATCH_CLI_TIMEOUT_SECONDS`, `RETRIEVAL_CLI_DEBUG_PASSTHROUGH` (retrieval/agent_bridge.py:15-20) |
| policy-corpus / crawler (2) | `POLICY_CORPUS_SEARCH_DEBUG` (internal/base.ts:2), `CORPUS_OPERATOR_LOCK_HELD` (crawler cli/reactivate.ts:35) |
| e2e (5) | `HERMETIC_AUTH` (playwright.config.ts:25; set by the root npm script), `JWKS_STUB_PORT`, `SMOKE_HEADLESS`, `SMOKE_MIN_ANSWER_CHARS`, `SMOKE_TEST_RUN_ID` |
| scripts/ops (31) | `OPS_ENV`, `BACKUP_REMOTE`, `BACKUP_BUCKET`, `HC_URL`, `LOG_FILE` (lib.sh), `HC_URL_BACKUP` (backup-corpus.sh), **`RAILWAY_ACCESS_TOKEN`**, `RAILWAY_ENV_ID`, `RAILWAY_NEO4J_SERVICE_ID` (railway-tcp-proxy.sh), **`CORPUS_RELEASE_TRIGGER_URL`** (daily-check.sh:42), **`RELEASE_OVERRIDE_FILE`**, `REQUESTED_CORPUS_RELEASE_ID`, `CUTOVER_RESTORE_ATTEMPTS`, `RAILWAY_DEPLOYMENT_WAIT_ATTEMPTS`, `RAILWAY_DEPLOYMENT_WAIT_INTERVAL_SECONDS` (corpus-release.sh), `PIPELINE_PYTHON`, `RAILWAY_DEPLOYMENT_ID`, `CORPUS_JOB_CHILD`, `CORPUS_JOB_TEST_SOURCE_ONLY` (railway-corpus-job.sh), `BACKUP_RETENTION_DAYS`, `SECONDARY_RCLONE_TARGET` (object-storage-backup.sh), `OBJECT_STORAGE_FORCE_PATH_STYLE` (object-storage-lib.sh), `RCLONE_TRANSFERS`, `RELEASE_SMOKE_QUESTION`, `RELEASE_SMOKE_TIMEOUT_SECONDS`, `RELEASE_SMOKE_MIN_ANSWER_CHARS`, `SYNTHETIC_ACCESS_TOKEN` (release-smoke.mjs), `SMOKE_DEPLOYMENT_ID` (epsdt-smoke-batch.mjs), `SAMPLE_GATEWAY_URL`, `SAMPLE_GATEWAY_NONCE`, `SAMPLE_QUESTION_ID` (sample-budget-preload.mjs) |
| scripts (11) | `NEO4J_HOST` (deploy-data.sh:23); `AB_BOLT`, `DATASET`, `RUNS`, `CANDIDATE_MODEL`, `CANDIDATE_DIMS`, `BASELINE_VERIFIER`, `CANDIDATE_VERIFIER`, `BASELINE_AGENT`, `CANDIDATE_AGENT`, `EVAL_REGRESSION_THRESHOLD` (eval-ab.sh; described only in its own header, which is itself stale) |

### A2. Read by code and named in a doc (98), by first place documented

- **RUNBOOK (38):** `EVAL_OPENAI_API_KEY`, `VERIFIER_MODEL`, `TRACE_STORE`, `OBSERVATIONAL_MEMORY_ENABLED`, `NEO4J_IDLE_CLOSE_MS`, `NEO4J_QUERY_TIMEOUT_MS`, `VOYAGE_TIMEOUT_MS`, `PORT`, `MASTRA_OBSERVABILITY_PATH`, `MAX_BODY_BYTES`, `MAX_MESSAGE_CHARS`, `RATE_LIMIT_MESSAGES_PER_HOUR`, `RATE_LIMIT_MESSAGES_PER_DAY`, `SCOPE_GATE_ENABLED`, `SCOPE_GATE_MODEL`, `USAGE_RETENTION_DAYS`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, `RAILWAY_GIT_COMMIT_SHA`, `HC_URL_DAILY`, `HC_URL_MASTRA_BACKUP`, `HC_URL_WEEKLY`, `FORCE_DEPLOY`, `SKIP_DEPLOY`, `SMOKE_BASE_URL`, `SMOKE_QUESTION`, `SMOKE_TIMEOUT_MS`, `SMOKE_SCREENSHOT_PATH`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`
- **README (8):** `OPENAI_API_KEY`, `VOYAGE_API_KEY`, `ANTHROPIC_API_KEY`, `AGENT_MODEL`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `DATABASE_URL`
- **.env.example only (10):** `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, `WORKOS_REDIRECT_URI`, `NEXT_PUBLIC_WORKOS_REDIRECT_URI`, `VERIFIER_ENABLED`, `TYPESAFE_API_KEY`, `SCOPE_GATE_PROVIDER`, `JEV_SECTION_ROLES_ENABLED`, `JEV_SECTION_ROLE_ALLOWLIST`
- **blue-green runbook only (30):** `CORPUS_JOB_MODE`, `CORPUS_RELEASE_ID`, `NEO4J_BLUE_URI`, `NEO4J_GREEN_URI`, `NEO4J_BLUE_PASSWORD`, `NEO4J_GREEN_PASSWORD` (read dynamically: cli/release.py:644-645, railway-corpus-job.sh:52), `RAILWAY_ENVIRONMENT`, `RAILWAY_AGENT_SERVICE`, `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_AGENT_SERVICE_ID`, `RAILWAY_TOKEN`, `AGENT_PUBLIC_URL`, `SYNTHETIC_USER_EMAIL`, `SYNTHETIC_USER_PASSWORD`, `SYNTHETIC_RESOURCE_ID`, `BACKUP_AGE_RECIPIENT`, `HC_URL_CORPUS_JOB`, `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`, `ENDPOINT`, `BOOTSTRAP_TARGET_COLOR`, `BOOTSTRAP_RESET_CONFIRM`, `BOOTSTRAP_BASELINE_EVIDENCE`, `SMOKE_ACTIVATION_NONCE`, `SMOKE_RECEIPT_PATH`, `SMOKE_RESTORE_THREAD_TITLE`, `VERIFIER_PRIVATE_DIAGNOSTICS_DIR`
- **other ops/dev docs (12):** `CORPUS_RECOVERY_MAX_RUNTIME_SECONDS`, `CORPUS_RECOVERY_MAX_CONSECUTIVE_TIMEOUTS`, `CORPUS_JOB_SIGNAL_GRACE_SECONDS` (corpus-parser-recovery); `EVAL_IDENTITY_CATALOG`, `JEV_CONFIRMED_INPUT_USD_PER_MILLION`, `JEV_CONFIRMED_SCOPE_PRICING` (jev.md); `SMOKE_EXPECTED_RELEASE_ID`, `SMOKE_READINESS_RECEIPT_PATH` (operations/README); `CORPUS_DATA_ROOT` (gotchas and four runbooks; never in RUNBOOK); `EMBEDDING_TOKENIZER_DIR`; `PIPELINE_PARSE_TIMEOUT_SECONDS`; `DESIGN_SHOTS` (packages/web/AGENTS.md)

### A3. Named in docs, not read by repository code

No documented variable is dead. The residue is:

| Kind | Names | Note |
| --- | --- | --- |
| consumed by a third-party library/image | `WORKOS_COOKIE_PASSWORD` (.env.example:54), `NEXT_TELEMETRY_DISABLED` (RUNBOOK:321), `NEO4J_AUTH` and `NEO4J_server_*` (neo4j.env.example, RUNBOOK:337-340), `RAYON_NUM_THREADS` (qualification-preparation:67), `COPYFILE_DISABLE` (gotchas:155) | fine |
| Railway variable looked up by scripts, not an env read | `ACTIVE_CORPUS_COLOR` (blue-green:259; corpus-release.sh:385) | fine |
| test-only switches | `RUN_NEO4J_INTEGRATION`, `RUN_EMBEDDING_INTEGRATION`, `JEV_DISPOSABLE_NEO4J`, `JEV_DISPOSABLE_NEO4J_URI` | fine |
| shell placeholders in example commands | `PREPARATION_NETWORK`, `PRIVATE_RUN`, `RESTORED_CORPUS`, `ORIGINAL_CORPUS_ROOT`, `PINNED_PIPELINE_IMAGE` | fine |

Reverse case (names only, values not read): the local `.env` holds `GROQ_API_KEY`, which no code reads since the reranker was removed.

### A4. Documented default or behaviour differs from code

| Doc | Says | Code |
| --- | --- | --- |
| RUNBOOK:18, :23 | verifier default `gpt-5.4-mini` | `gpt-5.6-terra` (verifier/config.ts:9, since PR #133, 2026-09-22); .env.example:20 is right |
| RUNBOOK:36, :43 | `SENTRY_ENVIRONMENT` falls back to `NODE_ENV` | server side: unset means Sentry disabled plus a warning (agent sentry.ts:22-34; web instrumentation.ts:14-23); only the browser falls back (instrumentation-client.ts:30) |
| RUNBOOK:37, :43 | trace sample rate default `0`, "errors only" | `0.1` (sentry.ts:42; instrumentation.ts:29; instrumentation-client.ts:31) |
| RUNBOOK:10, :21; README:44; .env.example:11 | `ANTHROPIC_API_KEY` only for a Claude `AGENT_MODEL` | also required by the answer-eval judge (eval/judge.py:61-62; config.py:89), `--llm-assist` (references/llm_extractor.py:124), `jev ai-draft` (jev/ai_review.py:145) |
| RUNBOOK:22 | `gpt-*`/`o3*`/`o4*` route to OpenAI | also `o1*` (model.ts:37) |
| RUNBOOK:25, :84, :109 | working memory active; kill switch disables "both" | `workingMemory: { enabled: false }` always (chat-memory.ts:29) |
| RUNBOOK:26, :29, :32 | `NEO4J_URI`, `NEO4J_PASSWORD`, `DATABASE_URL` "Required: No" | production boot rejects the defaults (runtime-config.ts:123-132) |
| RUNBOOK:79; privacy page:80 | threads kept until the user deletes them | deleted after 90 idle days (runtime-config.ts:161; app-database.ts:241) |
| RUNBOOK:80-81 | feedback: orphan pruning only | also deleted at 180 days (runtime-config.ts:162; app-database.ts:203) |
| RUNBOOK:86-98 | four manual DELETEs complete an account deletion | `deleteUserData` covers eight more tables and has no caller (app-database.ts:249-290) |
| RUNBOOK:5 | `docker compose up -d neo4j` starts Neo4j | fails until the external volume exists (docker-compose.yml:41); only `npm run dev:infra` creates it |
| RUNBOOK:6 | `engines.node` is `>=22.12.0` | exact `22.23.3` (package.json:9); `.nvmrc` says `22.22.0` |
| RUNBOOK:7 | Python 3.11+ venv | uv-managed venv (`uv sync --frozen`); local 3.13.2, CI 3.11, no `.python-version` |
| RUNBOOK:12 | web picks up root `.env` via load-env.ts | web never imports it; Next reads `packages/web/.env*` only |
| RUNBOOK:136, :164-170 | daily job is a conditional-request `check` (~10 min) | daily-check.sh:30,33 runs `crawl` then `pipeline.cli parse` |
| RUNBOOK:197 | eCFR cached 90 days | 7 days (config.py:76); SSA 30 (config.py:77) |
| RUNBOOK:301, :379 | `/healthz` is the health check | Railway healthcheck is `/readyz` (agent/railway.json:15); `/healthz` is the same handler (readiness.ts:135-139); the provider probe is the undocumented `/dependencyz` |
| blue-green:235, :284 | `CORPUS_JOB_MODE=release\|rollback railway redeploy …` selects the mode | the prefix only sets a local variable; the container reads its stored service variable (railway-corpus-job.sh:16) |
| README:63 | e2e "requires web dev server" | mocked project starts its own with `reuseExistingServer: false` (playwright.config.ts:112,119) |
| crawler README:49 | ten source families | eleven (corpus-manifest.json; crawler config.ts:22) |
| eval-results README:6-10 | three tracked milestones | 25 tracked JSON files under milestones/ |
| gotchas:64; RUNBOOK:309 | set agent watch paths in the Railway UI | `watchPatterns` in packages/agent/railway.json:6-12 |

## B. Bring-up walk (read-only; nothing started)

| Step from the docs | Outcome on a fresh clone |
| --- | --- |
| README:24 `npm install` | works; EBADENGINE warning unless Node is exactly 22.23.3 / npm 11.11.0 (no engine-strict) |
| README:25 `npm run setup -w @nc-medicaid/pipeline` | fails without `uv` (not mentioned in README or RUNBOOK); also downloads two tokenizer files from huggingface.co (tokenizer.py:31) |
| dev guide:9-11 | installs uv into `.local-recovery/uv-tools`, a git-ignored directory the audit doc describes as private recovery storage |
| README:27 "Start Neo4j" | no command given; RUNBOOK:5's `docker compose up -d neo4j` fails on the external volume; `npm run dev:infra` works |
| RUNBOOK:12 copy `.env.example` to `.env` | agent loads it; web does not (owner's machine has an untracked symlink `packages/web/.env.local` to the root file) |
| README:42-50 env list | omits `WORKOS_API_KEY`/`WORKOS_CLIENT_ID`; `@mastra/auth-workos` throws without them, for the server and the CLI (agent index.ts:256,267) |
| WorkOS application setup | not described (redirect URI, sign-out URI, test user); only gotchas:19,203 mention pitfalls |
| README:31 `npm run dev -w @nc-medicaid/agent` | starts against an empty graph; no document says how to obtain one short of a full crawl + Docling parse + paid Voyage embed; LibreOffice needed for `.doc` (converter.py:719) is unlisted; `build-mixed-corpus` exists but is undocumented and defaults to `--reset` |
| readiness | a graph built by `run-all` has no `CorpusRelease` node, so `/readyz` and `/healthz` return 503 (readiness.ts:60-69) |
| README:63-64 `npm run test:e2e` | needs `cd e2e && npm ci && npx playwright install chromium` first (only gotchas:76 says so) and no dev server on port 3000 |

## C. Documentation volume and search noise

| Area | Markdown files | Size | Role |
| --- | --- | --- | --- |
| Root (README, RUNBOOK, AGENTS, CLAUDE) | 4 | 33 KB | active |
| docs/README, architecture, decisions | 4 | 9 KB | active |
| docs/development | 5 | 105 KB (gotchas.md is 68 KB, 169 bullets) | active |
| docs/operations | 8 | 81 KB | active |
| docs/archive | 442 (+24 other files) | 986 KB | historical |
| docs/validation | 29 (+248 JSON, 4 logs; 4.6 MB total) | 219 KB | historical |
| docs/superpowers | 18 | 485 KB | historical |
| docs/reviews | 11 | 361 KB | historical |
| docs top-level dated notes + roadmap | 4 | 27 KB | unlabelled |

Active guidance is about 21 of 537 Markdown files (4%) and under 10% of Markdown bytes (roughly 58k tokens at 4 bytes per token, an estimate). Files matching common search terms, active docs vs historical docs: `rerank` 2 vs 71; `voyage-law-2` 0 vs 28; `gpt-5.4-mini` 1 vs 20; `deploy-data` 2 vs 21; `VERIFIER_MODEL` 2 vs 14. There is no `.ignore` or `.rgignore`; greptile.json and the Claude review workflow exclude only docs/archive.

## D. AGENTS.md "Essential verification", bullet by bullet

| # | Bullet | Accurate? | A check or a description? |
| --- | --- | --- | --- |
| 1 | read relevant gotchas | yes | check, but "relevant" is unfindable in 169 unindexed bullets |
| 2 | agent tests and build | yes (build is `tsc`) | check |
| 3 | Ruff + Vulture, uv from packages/pipeline | yes | check |
| 4 | answer release enforced on server | yes | description |
| 5 | research recovery limits | yes (lease 15 min, 30 s / 120 s, two claims) | description |
| 6 | routing belongs in PolicyCorpus; validate identities | yes | half check |
| 7 | isolated observability; repeated runs | yes | check |
| 8 | keep retirement evidence durable | yes | description |
| 9 | work from main; preserve refs | yes | check |

Missing: paid-command list and the eval-key rule; production-touching commands; live `.env`; local Neo4j is the real corpus; inference governance; branch and PR workflow.

## E. Decisions that deserve an ADR (none recorded today)

| Decision | Where it lives now |
| --- | --- |
| Answers are released only after exact-text verification; signed memory | answer-release runbook; AGENTS.md:20 |
| US-hosted inference only for anything that sees user text | owner's private Claude memory only; zero hits in tracked active docs |
| Model roles: agent terra (A/B 2026-07-09), verifier terra (luna rejected), judge claude-sonnet-4-6, embeddings voyage-4 at 1024 | RUNBOOK:55; model.ts:23-28 comment; config.py:89; nowhere for luna or voyage-4 |
| No request-time LLM or Jev reranker | gotchas:95 |
| Blue-green corpus releases replace the in-place weekly rebuild; when launchd retires | blue-green runbook:340-345 vs RUNBOOK:127-162 |
| Neo4j DR is rebuild from artifacts, not restore | RUNBOOK:424 |
| One agent service with a LibSQL volume, no queue or worker | system-design.svg footer; answer-release runbook:17 |
| Observational memory on (guarded), working memory off | answer-release runbook:11; chat-memory.ts:28-29 |
| Policy-family routing in PolicyCorpus, not prompts | AGENTS.md:22; gotchas:115 |
| Jev stays opt-in and disabled until human-qualified; $25 cap | jev.md |
| Deferred upgrades (ESLint 10, Zod 4, @types/node 22) and why | dev guide:54-58 and issues, reasons only in the issues |
| Railway serverless sleep, trace store off in production | RUNBOOK:311-345 |
| Conversation retention period | runtime-config.ts:161 only |

## F. Roadmap status (docs/roadmap.md, single commit 2026-03-29)

| Phase | Plan | Status on 2026-10-04 |
| --- | --- | --- |
| 1 Eval and golden dataset | 50 entries, baseline | done and exceeded: 55 entries, answer-level judge, stability tooling |
| 2 Thin UI | search box, citations, feedback, allowlist auth, hosted | done differently: Next.js + WorkOS open self-registration on Railway |
| 3 Validation | 10 users, first customer by mid-May 2026 | not started: AGENTS.md says no users; production corpus qualification is NO_GO (issues #187, #188) |
| 4 Hardening | Sonnet/Opus routing, weekly cron, reliability | routing moot (OpenAI gpt-5.6-terra); update pipeline exists twice (launchd and Railway corpus-job); rate limits, Sentry, backups built |
| 5 Scale prep | after revenue | not started |

Open decisions listed there (UI framework, hosting, Neo4j hosting, model routing, embedding model) were all made and none is recorded in docs/decisions.

## G. What checked out

- 161 relative links across 27 in-scope docs: 0 broken, all targets tracked. The 10 GitHub issue/PR links resolve (checked with `gh`); of 11 other external URLs fetched, 9 return 200 and the two npm pages return 403 to scripts. The roughly 30 vendor links inside the TypeSafe skill were not fetched.
- Every `pipeline.cli` command and option named in the operations runbooks and jev.md exists (cli/build.py, eval.py, recovery.py, release.py, jev.py), as do the crawler commands in its README.
- corpus-parser-recovery.md matches railway-corpus-job.sh (modes, 18000 / 3 / 30 defaults, summary line, lock path); corpus-release-policy.json matches the thresholds quoted in the blue-green runbook.
- answer-release-and-recovery.md matches verify.ts:97-99 (30 s, no retries, low effort) and repository.ts (15 min lease, 30 s / 120 s, two recoveries), migrations 5 and 6.
- .env.example: all 40 names are consumed; its defaults match code.
- skills-lock.json `computedHash` reproduces as SHA-256 over path + content of the sorted skill files.
