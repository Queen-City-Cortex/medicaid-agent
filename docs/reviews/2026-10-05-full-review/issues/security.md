# Security and access control: all issues

The authentication boundary holds for direct access: a binding middleware ties each request to the verified WorkOS user, and a positive-list gateway answered 404 on 344 of 351 built-in Mastra routes in a reviewer's in-process run. The main risk is credential hygiene, not application code. The production Neo4j password and the smoke-test account's password sit in tracked files, nine GitHub Apps can read them and push to an unprotected branch that deploys to production, and no scanner would have caught either. Rotate both passwords first, then narrow the app installations. In the application, two Mastra memory routes fail their ownership checks and thread metadata bypasses the input guards; both need small gateway or store changes and two-user tests before real users arrive. Production also appears to run on a WorkOS staging environment, which is cheapest to correct while there are no users.

## What is working

- `packages/agent/src/execution-gateway.ts:20-35` is a positive allowlist. In a reviewer's in-process assembly, 344 of 351 built-in Mastra routes received its 404; the other seven are the memory operations the app adopted.
- `packages/agent/src/auth-middleware.ts:59-71` clears the client-mergeable `user` key and binds the owner from the verified token on every request; `packages/agent/tests/auth-middleware.test.ts` covers forged POST, GET and base64 request contexts.
- `packages/agent/src/rate-limit/repository.ts:64-81` checks and records each run start in one atomic statement (its test shows 3 allowed and 7 denied under contention), and `packages/agent/src/rate-limit/middleware.ts:114-124` fails closed in production.
- `packages/agent/src/runtime-config.ts:117-134` refuses to start in production with the verifier disabled, non-persistent storage, a localhost Neo4j address or allowed origin, or the development Neo4j password.
- Graph queries in `packages/policy-corpus` use parameters throughout; `packages/policy-corpus/src/internal/base.ts:19` escapes full-text input, and relationship types are checked against the list at `packages/policy-corpus/src/types.ts:241`. Reviewers found no query injection.
- `.github/workflows/ci.yml` pins every action except the Claude action to a commit hash, runs with a read-only default token and uses no secrets. `packages/agent/Dockerfile:1` and `packages/web/Dockerfile:1` pin base images by digest, and both images drop root.

## High severity

### SEC-1 · The production Neo4j password is committed in two tracked files and Git history

**high** · effort S · security, wrong-answer risk, data quality

`docs/archive/byterover/context-tree/database_operations/neo4j_auth/railway_neo4j_auth_handling.md` (lines 17 and 39) and `docs/archive/byterover/dream-log/drm-1781233424044.json` (lines 442 and 469) contain a 32-character string that an in-memory comparison found identical to `NEO4J_PASSWORD` in four captures of the production agent environment, the latest from 2026-10-03. Six older blobs under `.brv/context-tree` hold it too. The graph is otherwise reachable only on Railway's private network, but `scripts/ops/railway-tcp-proxy.sh` publishes it on a public port during a data deploy, and the Saturday launchd job that does so is still loaded, though it currently fails earlier.

**Impact.** Anyone with repository read access, including nine installed GitHub Apps, could alter policy text during a proxy window. Altered text would be retrieved, cited and pass the verifier, misleading attorneys and beneficiaries.

**Fix.** Confirm no TCP proxy is open, then rotate the password from a shell inside the Neo4j service without opening the proxy, and update `NEO4J_PASSWORD` and `NEO4J_AUTH`; accept only when `/readyz` reports Neo4j connected. Rotate any blue or green graph sharing the value, delete unpromoted activation checkpoints and `.local-recovery` copies holding it, then replace the literals with `<redacted>` and update the two hashes in `docs/archive/byterover/snapshot-manifest.json`. Do not rewrite history. Treat this review's session transcript as containing the value.

*What is and is not established: Match established against the 2026-10-03 capture, not a live sign-in. Tampering needs a public proxy window; none was observed open. Containment in pull-request refs was not re-scanned.*

Where: `docs/archive/byterover/context-tree/database_operations/neo4j_auth/railway_neo4j_auth_handling.md:17`, `docs/archive/byterover/dream-log/drm-1781233424044.json:442`, `scripts/ops/railway-tcp-proxy.sh`, `docs/archive/byterover/snapshot-manifest.json:146`

### SEC-2 · A signed-in user can seize or read another user's conversation given its id

**high** · effort M · security, privacy, test gap, dependency

`packages/agent/src/execution-gateway.ts:31-34` exposes Mastra's built-in memory routes and relies on their ownership checks, two of which fail in the installed `@mastra/server` 1.45.0 and `@mastra/libsql` 1.14.0. `POST /api/memory/threads` with an existing thread id replaces that thread's owner, because the handler skips the ownership check and the store writes with `INSERT OR REPLACE`. `GET /api/memory/threads/:id/messages` with `include` and no known `agentId` returns messages from any thread. Offline reproductions against the real routes and the app's middleware confirmed both. Three reviewers reported this one defect.

**Impact.** After a takeover the owner gets 403 on their own conversation, and the other user can read it by cloning it and then delete it. Conversations hold attorneys' and case managers' pasted client facts.

**Fix.** Wrap `saveThread` beside `installMemoryReleaseGate` in `packages/agent/src/answer-release.ts` to reject a write that changes an existing thread's `resourceId`. Return 400 for `include` in the gateway, or raise `@mastra/libsql` to 1.20 through 1.22, which scope it by owner. Add two-user tests for both gaps to `packages/agent/tests/chat-memory-http.test.ts`. Reviewers disagreed on one point the owner must decide: whether also to remove the `POST /api/memory/threads` rule and its client call, which requires server-set thread titles.

*What is and is not established: Reproduced offline, not in production. Exploitation needs another user's random 122-bit thread or message id, which no product surface exposes, and there are no users yet.*

Where: `packages/agent/src/execution-gateway.ts:31`, `packages/agent/src/answer-release.ts:56`, `packages/agent/package.json:26`, `packages/agent/tests/chat-memory-http.test.ts:196`

## Medium severity

### SEC-3 · Client-written thread metadata reaches the model as system messages, bypassing the input guards

**medium** · effort S · security, cost, reliability, test gap

`packages/agent/src/execution-gateway.ts:31-32` passes thread create and update requests to Mastra without inspecting bodies, and `@mastra/server` 1.45.0 stores a free-form `metadata` record. Once a thread has active observations, `@mastra/memory` 1.26.1 emits `metadata.mastra.om.currentTask` and `suggestedResponse` as system messages on every model step. The length, scope and prompt-injection guards never see that text; a reproduction stored 20,027 characters against the 10,000-character cap. Separately, the sidebar rename in `packages/web/src/components/ThreadSidebar.tsx` sends back cached metadata, which replaces the stored observation block with a stale copy or wipes it.

**Impact.** A user can inject only into their own conversation and the output verifier still gates answers, but the text inflates token spend on every turn. An ordinary rename can degrade a conversation's memory.

**Fix.** Accept only `title` on `PATCH /api/memory/threads/:id` and no `metadata` on `POST /api/memory/threads`, enforced in the gateway or a middleware beside it. Do not strip metadata in a store wrapper, because observational memory writes that block through the store. Change `handleRename` to send only `{ title }`. Add tests to `packages/agent/tests/chat-memory-http.test.ts` that a `PATCH` carrying `metadata.mastra.om` is refused and absent from the next prompt, and that a title-only rename leaves the block intact.

*What is and is not established: Reproduced offline with a mock model. Injection needs active observations, roughly one large tool result plus a later turn; the effect on live answers and spend was not measured.*

Where: `packages/agent/src/execution-gateway.ts:31`, `packages/agent/src/answer-release.ts:57`, `packages/web/src/components/ThreadSidebar.tsx`, `packages/agent/tests/chat-memory-http.test.ts`

### SEC-4 · The production smoke-test account's email and password are committed in a plan document

**medium** · effort S · security, reliability, release gate

`docs/superpowers/plans/2026-03-29-chat-ui-features.md:633` carries the synthetic test account's email and 16-character password in a command line, in Git since commit f27085c (2026-04-02). An in-memory comparison found the password identical to `TEST_USER_PASSWORD` in the workstation `.env` and to `SYNTHETIC_USER_PASSWORD` in the production corpus-job captures of 2026-10-02 and 2026-10-03, so it is the credential behind `npm run smoke:prod` and `scripts/ops/release-smoke.mjs`. `SYNTHETIC_RESOURCE_ID` is unset in both captures, so the account check at `scripts/ops/release-smoke.mjs:74` does nothing.

**Impact.** The account has no privilege beyond open sign-up, but a repository reader could exhaust its rate limit so the operator's release smoke and corpus activation fail with 429, or tamper with its smoke threads.

**Fix.** Reset the synthetic user's password in the WorkOS dashboard, then set the new value on the corpus-job service and in the local `.env`, preferably as two distinct accounts. Set `SYNTHETIC_RESOURCE_ID` on corpus-job to that user's WorkOS id so the check binds the expected account. Replace the literal at line 633 with placeholders. Do not rewrite history.

*What is and is not established: No sign-in was attempted, so whether WorkOS still accepts the password is unconfirmed; equality was checked against stored environment captures.*

Where: `docs/superpowers/plans/2026-03-29-chat-ui-features.md:633`, `scripts/ops/release-smoke.mjs:74`, `e2e/scripts/smoke-production.mjs:21`, `RUNBOOK.md:383`

### SEC-5 · No secret scanning runs, and default gitleaks would miss both live committed passwords

**medium** · effort S · security, cost, documentation

The repository has no secret scanner, Git hook or scanner configuration, and GitHub's scanner is unavailable on the organisation's Free plan. Default gitleaks 8.30.1 reported 45 findings on an exported HEAD tree and 78 over 983 commits. The only true positives were four lines holding an old Voyage-format key in `docs/superpowers/plans/2026-03-27-ecfr-ingestion.md` and `docs/superpowers/plans/2026-03-27-eval-harness.md`. It reported nothing in the three files that hold the current Neo4j and test-account passwords, which are prose and shell text. Both passwords arrived through agent session notes and a bulk commit.

**Impact.** The owner would see a clean scan while live passwords stay in HEAD, and the next rotated value could leak too. If the old Voyage key is still live, repository readers can spend that budget.

**Fix.** Write a pre-commit script, installed through a tracked `core.hooksPath` directory, that fails when any value of a secret-named variable from local `.env` files or `.local-recovery` captures appears in tracked or staged content, printing names and locations only; run it before each release. Add a pinned gitleaks step to `.github/workflows/ci.yml` for vendor-format keys only. Confirm the old Voyage key is deleted and replace its four literals. Add one line to `AGENTS.md` forbidding credential values in notes.

*What is and is not established: The 78-finding history scan is the reviewer's stored report and was not re-run. Revocation of the old Voyage key is unconfirmed.*

Where: `.github/workflows/ci.yml:116`, `docs/superpowers/plans/2026-03-27-ecfr-ingestion.md:907`, `docs/superpowers/plans/2026-03-27-eval-harness.md:1300`, `docs/development/knowledge-workflow.md:26`

### SEC-6 · Nine GitHub Apps and the Claude workflows can write to unprotected, auto-deploying main

**medium** · effort S · security, dependency

The organisation has nine GitHub App installations, each covering all 11 repositories with `contents: write`; seven also hold `workflows: write`. `main` is unprotected, which the Free plan cannot change, and Railway deploys it (`RUNBOOK.md:297`). Two apps, graphite-app and devin-ai-integration, show no activity here. `.github/workflows/claude.yml:22-26` and `.github/workflows/claude-code-review.yml:27-30` declare read-only permissions but pass no `github_token`, so the action obtains a Claude App token; write scope is explicit for the mention workflow and inferred for the review workflow. That action alone uses a moving tag. The organisation's two-factor requirement is off.

**Impact.** A compromised vendor key or action tag, or instructions planted in text the Claude agent reads, could read committed secrets and push code that reaches production users.

**Fix.** Suspend graphite-app and devin-ai-integration, and kilo-code-bot if abandoned. Restrict each remaining installation to selected repositories and turn on the two-factor requirement. Delete `.github/workflows/claude.yml`, which succeeded twice in 565 runs. In `claude-code-review.yml`, pass `github_token: ${{ secrets.GITHUB_TOKEN }}`, set permissions to `contents: read` and `pull-requests: write`, remove `id-token: write`, and pin the action to a commit hash. Keep blacksmith-sh and railway-app, which run continuous integration and deployment.

*What is and is not established: No push was attempted and no compromise is known. Installations were listed through the GitHub API on 2026-10-05; the idle apps may serve other repositories.*

Where: `.github/workflows/claude.yml:35`, `.github/workflows/claude-code-review.yml:40`, `RUNBOOK.md:297`, `.github/dependabot.yml:82`

### SEC-7 · Production appears to authenticate through a WorkOS staging environment shared with the workstation

**medium** · effort M · security, reliability, documentation

All seven captures of the production agent, web and corpus-job environments (2026-10-02 and 2026-10-03) hold a `WORKOS_API_KEY` of the `sk_test_` form. That key, `WORKOS_CLIENT_ID` and `WORKOS_COOKIE_PASSWORD` are identical to the workstation `.env`, which has mode 0644; `OPENAI_API_KEY` and `VOYAGE_API_KEY` also match on the agent service. `packages/agent/src/runtime-config.ts:120-121` checks only that the WorkOS variables are present. WorkOS states that staging is not for customer-facing traffic and that its users cannot be copied to production.

**Impact.** Migrating later recreates users with new ids, orphaning every thread, memory profile and feedback row. Until then, exposure of the laptop `.env` exposes production's WorkOS key and session-sealing password.

**Fix.** Confirm in the WorkOS dashboard which environment the deployed client belongs to. If it is staging, before the first real user create production credentials and a new cookie password, register the Railway redirect and sign-out addresses, set them on the web and agent services, and recreate the synthetic account. Then reject `sk_test_` keys at startup when `PUBLIC_PRODUCTION=true`, with a case in `packages/agent/tests/startup-validation.test.ts`. Run `chmod 600` on `.env` and correct `docs/development/gotchas.md:57`.

*What is and is not established: Inferred from the key prefix and localhost redirect behaviour; the WorkOS dashboard was not inspected. Migration cost is zero until real users exist.*

Where: `packages/agent/src/runtime-config.ts:120`, `packages/agent/tests/startup-validation.test.ts:42`, `docs/development/gotchas.md:57`, `.env.example:55`

### SEC-8 · Open self-registration with only per-user limits leaves the shared model budget uncapped

**medium** · effort M · security, cost, reliability, documentation

WorkOS sign-up is open self-registration (`RUNBOOK.md:102`), and `packages/agent/src/index.ts:256-258` admits every authenticated user. The allowlist planned in `docs/roadmap.md:56` was not built. The only volume control is per user: 30 run starts an hour and 150 a day (`packages/agent/src/rate-limit/repository.ts:64-81`). No service-wide request or spend ceiling exists, so each scripted account adds up to 150 chat runs a day against one OpenAI balance. Deep research is bounded separately at two starts per user per day and two concurrent runs service-wide.

**Impact.** Throwaway accounts could exhaust the owner's OpenAI balance, after which chat fails for every user. The size of the bill depends on provider recharge settings that the repository does not record.

**Fix.** Turn off sign-up in the WorkOS dashboard, admit validation users by invitation, confirm email verification is on, and record the setting as a release check in `RUNBOOK.md:102`. Only then add a service-wide count predicate to the insert in `RateLimitRepository.checkAndRecord`, indexed on `created_at`; while sign-up is open, a shared cap lets an attacker lock out users. Keep OpenAI on prepaid credit with automatic recharge off or capped.

*What is and is not established: Inferred from code and documents; no abuse was observed, and neither the WorkOS dashboard nor the provider's recharge settings were inspected.*

Where: `packages/agent/src/index.ts:257`, `packages/agent/src/rate-limit/repository.ts:74`, `RUNBOOK.md:102`, `docs/roadmap.md:56`

### SEC-9 · Mastra parses request bodies of any size before authentication and the 2 MB cap

**medium** · effort M · security, reliability, documentation

The body-size guard at `packages/agent/src/rate-limit/middleware.ts:26-42`, listed as an abuse protection in `RUNBOOK.md:106`, says oversized payloads are refused before they are parsed. They are not: the context middleware in the installed `@mastra/deployer` 1.45.0 runs before authentication and the app's middleware, and parses every `application/json` `POST` or `PUT` body, including chunked bodies without `Content-Length`. A reviewer's in-process run saw 12,582,972 bytes of an unauthenticated chunked `/chat` request read before the 401. Railway's documentation lists no body-size limit.

**Impact.** An unauthenticated caller can force the public agent to buffer large bodies, risking out-of-memory restarts; sustained abuse could use up the ten-restart policy and leave chat down until the operator intervenes.

**Fix.** Add a header-only gate on Node's `http.Server` request event at the top of `packages/agent/src/index.ts` that answers 413 for write requests whose `Content-Length` is missing, non-decimal or above a ceiling set over `MAX_BODY_BYTES`. It read 0 bytes in a mimic test, so confirm it once against real `mastra build` output. Keep the existing guard for its readable error, correct its comments and `RUNBOOK.md:106`, and report the parse upstream; `@mastra/deployer` 1.74.0 still has it.

*What is and is not established: Measured once in a reviewer's in-process run; verifiers confirmed the code path without repeating it. Behaviour behind Railway's edge and any memory exhaustion were not observed.*

Where: `packages/agent/src/rate-limit/middleware.ts:27`, `packages/agent/src/index.ts:264`, `RUNBOOK.md:106`, `packages/agent/railway.json:18`

### SEC-10 · Ignore rules for secrets and databases miss nested and variant file names

**medium** · effort S · security, privacy

The secret and database rules at `.dockerignore:39-48` lack the `**/` prefix used elsewhere in the file, so they match only at the context root. Throwaway builds with dummy files showed nested `packages/agent/.env`, `packages/web/.env.local` and `mastra.db*` files entering the context, and `packages/pipeline/Dockerfile:42` copies all of `packages` into a single-stage image. The root `.gitignore:18-19` ignores only the exact names `.env` and `.env.local`, so variants such as `.env.production`, `*.env.private` and `*.private.json` are unignored outside `packages/web`; production captures with those names stay out of Git only through the `/.local-recovery/` rule.

**Impact.** The operator could bake provider and sign-in credentials into a locally built corpus image, or commit a production environment capture saved outside `.local-recovery` in the next bulk commit.

**Fix.** Prefix the eight `.dockerignore` rules with `**/` (for example `**/.env`, `**/.env.*`, `!**/.env.example`, `**/*.db`), leaving the `packages/pipeline/data` exceptions untouched; do not convert the file to an allowlist. Add `.env*`, `!.env.example`, `*.env`, `*.env.private`, `*.private`, `*.private.*`, key-file, database-backup, `*.dump` and `*.age` patterns to the root `.gitignore`, and mirror them in `.dockerignore`. Amend `docs/operations/blue-green-corpus-releases.md` near line 312 to require a clean detached worktree.

*What is and is not established: Latent: nothing is currently untracked and unignored, and the one local pipeline image inspected held no secrets. Only local builds from a working checkout are exposed.*

Where: `.dockerignore:39`, `.gitignore:18`, `packages/pipeline/Dockerfile:42`, `docs/operations/blue-green-corpus-releases.md:311`

## Low severity

### SEC-11 · Token checks call WorkOS on every request yet pin no issuer or algorithm

**low** · effort M · security, reliability, dependency, needless complexity

`packages/agent/src/index.ts:256-258` builds the route-level verifier without `trustJwtClaims`, so each protected request calls WorkOS `getUser` and gets 401 if that fails. `@mastra/auth` 1.1.0 passes no issuer, audience or algorithm options. No bypass was shown.

**Impact.** A WorkOS user-lookup outage would reject valid sessions for every user, and a token issued by this WorkOS client for another purpose would be accepted as an identity.

**Fix.** Create one `new MastraAuthWorkos({ trustJwtClaims: true })` and pass it to both `server.auth` and `createResourceBindingMiddleware`. In the same change, verify tokens with `jose` `jwtVerify` using `algorithms: ['RS256']` and the issuer confirmed from a real token, and test that a wrong-issuer token is rejected. Drop the `authorizeUser` subclass after testing the library default. Record in `docs/development/gotchas.md` that a deleted WorkOS user keeps access until token expiry.

*What is and is not established: Inferred from code and a stubbed run of the installed library; no outage or forged token was reproduced, and signing keys are scoped to this WorkOS client.*

Where: `packages/agent/src/index.ts:256`, `packages/agent/src/index.ts:267`, `packages/agent/src/auth-middleware.ts:8`, `docs/development/gotchas.md:57`

### SEC-12 · The deep-research web-search tool ignores the plan's corpus-only flag once Exa is enabled

**low** · effort S · security, privacy

When `EXA_API_KEY` is set, `packages/agent/src/deep-research/agents.ts:30` gives every research worker the Exa web-search tool; the plan's `useWeb` flag changes only a prompt sentence at `packages/agent/src/deep-research/workflow.ts:170`.

**Impact.** Once Exa is enabled, text derived from a user's research question could go to a third party for sub-questions planned as corpus-only. Chat history and secrets are not in the worker's context.

**Fix.** Pass `activeTools` listing only the corpus tool names to `deepResearchWorkerAgent.generate` in `researchOne` (`packages/agent/src/deep-research/workflow.ts:207`) unless `sq.useWeb && WEB_SEARCH_ENABLED`. Add a unit test that a `useWeb=false` sub-question runs without `webSearch`. Do not add `PromptInjectionDetector` to the worker; it screens only the initial prompt. Record a decision on sending question text to Exa before setting the key.

*What is and is not established: Latent: the key is absent from local and tracked configuration, and Railway variables were not inspected.*

Where: `packages/agent/src/deep-research/agents.ts:30`, `packages/agent/src/deep-research/workflow.ts:170`, `packages/agent/src/deep-research/workflow.ts:207`, `packages/agent/src/deep-research/config.ts:37`

### SEC-13 · Feedback routes take the user's identity from a different source than every other route

**low** · effort S · security, needless complexity

`packages/agent/src/feedback/routes.ts:7-11` reads the owning user from the legacy `user` request-context key, which `docs/development/gotchas.md:40` warns is client-mergeable; all other routes use `getBoundUserId`. The middleware clears the key and route authentication rewrites it.

**Impact.** No user is affected today. If a Mastra upgrade stops writing the legacy key or reorders route authentication, feedback reads and deletes would key off an untrusted or missing value.

**Fix.** Delete `getResourceId` from `packages/agent/src/feedback/routes.ts` and use `getBoundUserId(c)` in the post, get and delete handlers and the invalid-JSON log line, keeping the `resource_id` filters. Update the feedback route tests to set `MASTRA_RESOURCE_ID_KEY` instead of `user`, and add a test that a forged `user` value with no bound id returns 401. Do this before the Mastra upgrade tracked in issue #145.

*What is and is not established: Latent: no bypass exists today; it can bite only if a Mastra upgrade changes the legacy key or middleware order.*

Where: `packages/agent/src/feedback/routes.ts:7`, `packages/agent/src/auth-middleware.ts:75`, `docs/development/gotchas.md:40`

### SEC-14 · The web app sets no security headers while page scripts hold the access token

**low** · effort M · security

`packages/web/next.config.ts:5-8` defines no `headers()` and `packages/web/src/proxy.ts:21-23` adds none, so the app sets no `Content-Security-Policy`, `Strict-Transport-Security`, framing or content-type headers. Page JavaScript holds the WorkOS access token by design.

**Impact.** No exploit path exists today. The headers would limit what a future script injection or compromised dependency could do with a user's tokens and conversations, and would block framing.

**Fix.** Add static headers in `packages/web/next.config.ts` first: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, a minimal `Permissions-Policy`, and `poweredByHeader: false`. Then set a nonce-based `Content-Security-Policy` in `packages/web/src/proxy.ts` before calling AuthKit, with `frame-ancestors 'none'`, `style-src 'unsafe-inline'` and `connect-src` limited to the agent and Sentry origins. Check one production build before enforcing.

*What is and is not established: No exploit path was shown, and production response headers were not observed; Railway's edge may add some.*

Where: `packages/web/next.config.ts:5`, `packages/web/src/proxy.ts:21`, `packages/web/src/app/layout.tsx:28`, `packages/web/src/app/layout.tsx:41`
