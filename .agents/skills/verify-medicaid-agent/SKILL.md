---
name: verify-medicaid-agent
description: "Launch a local, hermetic NC Medicaid Navigator web chat (Next.js in packages/web, signed in with the repo's test session, agent mocked at its HTTP boundary) and drive it like a user with Playwright to prove chat behavior with screenshots, ARIA snapshots, traces and the request the browser sent to the agent. Use when you need to verify a change to the chat UI, auth gate, verification badge, citations, feedback, refusals or public pages, or when asked to 'verify', 'prove', or 'drive' the medicaid-agent app. Never touches production, Railway or real accounts."
---

# Verify medicaid-agent (NC Medicaid Navigator)

The primary surface is the **web chat** at `/chat` (packages/web, Next.js 16). A signed-in user types a Medicaid policy question. The browser posts it straight to the agent service (`NEXT_PUBLIC_MASTRA_URL`, port 4111) and renders the streamed answer with a verification badge, footnotes and a Sources panel.

This skill runs the **real** Next.js app and its **real** auth middleware locally. It uses the repo's own hermetic auth (a minted test session plus a local JWKS stub instead of WorkOS). The agent is mocked **only at its HTTP boundary, inside the browser** (`page.route` on `localhost:4111`), using the same helpers as CI (`e2e/helpers/mock-routes.ts`, `stream-builder.ts`). No model, Neo4j or WorkOS secret is needed or used.

Hard rules:
- Never point this at production, Railway, the prod Neo4j, or a real user account. Only the local instance this skill launched.
- Never kill a process this skill did not start. `cleanup` kills only the process groups recorded at launch.
- Ports are fixed (web 3000, JWKS stub 8719) because the hermetic env and the minted cookie are bound to them. **Two instances cannot run side by side.** `launch` refuses if either port is busy (for example, someone's `npm run dev:web` or a running `npm run test:e2e`). Don't stop their process; wait or ask.

All commands run from the repo root. They need `curl`, `ss` or `lsof`, and Node matching `.nvmrc` (22.23.3) on PATH plus `npm ci` at the root and in `e2e/` (`cd e2e && npm ci && npx playwright install chromium`).

```bash
V=.agents/skills/verify-medicaid-agent/scripts/verify.sh
$V launch                # start JWKS stub + next dev with the hermetic env, wait until ready
$V doctor                # read-only health check; run first whenever anything looks off
$V drive ask-question    # drive one feature recipe (drive/<name>.verify.ts)
$V drive e2e:tests/mocked/feedback.spec.ts   # or run one of the repo's mocked specs against this instance
$V evidence              # write MANIFEST.sha256 and list the artifacts
$V cleanup               # stop what launch started, keep the evidence
```

## Launch

`$V launch`:
- Checks Node against `.nvmrc` (set `VERIFY_ALLOW_NODE_MISMATCH=1` to override) and that root and `e2e/` node_modules exist.
- Refuses if a previous run is still active, if anything listens on :3000 or :8719 (even a process whose pid it can't read, such as another user's), or if anything listens on :4111, the agent port. A real agent there could be reached by the browser and query a real Neo4j.
- Reads `HERMETIC_ENV` from `e2e/helpers/hermetic-env.ts`, the same WorkOS overrides CI uses. They point at `127.0.0.1:8719`, with a test cookie password and `NEXT_PUBLIC_MASTRA_URL=http://localhost:4111`.
- Starts, each in its own process group (`setsid`):
  - `node e2e/helpers/jwks-stub.mjs` on :8719
  - `next dev -p 3000` in `packages/web` with that env and `NEXT_TELEMETRY_DISABLED=1`
- Is **ready** when it prints `verify: ready: run <id>, web http://localhost:3000, evidence <dir>`. By then the JWKS stub answers, `GET /` returns 200, both listeners are confirmed to belong to the process groups this run started (never a foreign instance), and `/chat` has been compiled once. The timeout is `VERIFY_LAUNCH_TIMEOUT` seconds (default 240). Every readiness probe is capped by the remaining budget (`--connect-timeout`/`--max-time`), so a server that accepts connections but never answers can't hang launch past it. A cold first compile takes 10–60 s.
- On failure, read the logs in `${TMPDIR:-/tmp}/verify-medicaid-agent/<id>/web.log` and `jwks.log`, then run `$V cleanup`.

Teardown is `$V cleanup` (see Cleanup).

## Doctor

`$V doctor` is read-only and exits non-zero on any failure. It checks:
- Both recorded pids are alive.
- :3000 and :8719 are owned by **this run's** process groups.
- `GET /` returns 200 and contains `NC Medicaid Navigator`.
- The JWKS stub serves a key.
- A logged-out `/chat` redirects to `http://127.0.0.1:8719/` (proof the hermetic WorkOS env is active, not a real WorkOS config).

It also prints the checkout revision against the one launched and the evidence dir. It **fails** if anything listens on :4111, because drives would be refused. If the revision differs or the web log shows a compile error, clean up and relaunch.

## Drive

`$V drive <target> [-- <playwright args>]` runs Playwright with `drive/verify.config.ts`. That config has no webServer block (it never starts or reuses a server), runs 1 worker with 0 retries, and turns trace and screenshot on.
- First, the `session` project mints the hermetic session (`writeHermeticStorageState`, user `user_e2e_test` / `e2e@test.local`) into the run's scratch dir, never into the evidence.
- `<target>` is either:
  - a recipe name: `drive/<name>.verify.ts` (project `verify`, 1280×720 Desktop Chrome). It writes step artifacts with `drive/evidence.ts`.
  - `e2e:<path under e2e/>`, a spec from the repo's mocked suite (project `e2e-mocked`), for example `e2e:tests/mocked/abuse-ui.spec.ts`. Extra args go to Playwright, such as `-- -g "429"`.
- The exit code is Playwright's.

Stable handles to drive with (from `packages/web`, also wrapped by `e2e/helpers/chat-page.ts`):
- **Composer:**
  - `chat-input` and `send-button` (labelled `Ask`). Enter sends.
  - `example-card` (inside `example-persona`) fills the input.
  - `deep-research-toggle`
- **Transcript:**
  - `user-message`, `assistant-message` (use `.last()`)
  - `verification-badge` with `data-outcome` `passed|corrected`. The text is `Verified against cited sources` or `Corrected and verified against cited sources`.
  - `citation-footnote` with `data-source-number`, then `sources-panel` and `source-item`
  - `withheld-answer` and `verification-retry`
  - `blocked-message`, `chat-error-rate-limited`
- **Sidebar:** `thread-item`, `new-thread-button` (`+ New`)
- **Feedback:** the `Rate helpful` and `Rate unhelpful` buttons, the `What went wrong?` box and `Submit comment`.
- **Public pages:** `/`, `/terms`, `/privacy`, `/get-help` (testid `get-help`, footer link `Get help`).

Mocking the agent (only at this boundary):
- `mockMastraAPI(page, { streamResponse, threads, threadMessages, feedbackEntries })` covers `POST /chat`, `GET /api/memory/threads…` and feedback.
- Recipes import `test`/`expect` from `drive/agent-boundary.ts`, not `@playwright/test`. It sits under every page mock and answers `GET /corpus-status` with a contract-shaped fixture (`CORPUS_STATUS`, 1,234 documents, last updated Oct 1 2026). It aborts any other unmocked agent call and fails the test, and it logs every request to the agent port in `artifacts/agent-boundary.json`.
  - The page's first corpus poll fires before the access token is ready, and the next comes 60 s later. Recipes that need it call `page.clock.install()` before `goto` and `page.clock.fastForward('01:01')` (see `ask-question`).
  - The repo's `e2e:` specs don't use this fixture. They rely on the :4111 refusal, so an unmocked call fails to connect rather than reaching an agent.
- `/research/runs/current` answers 204.
- Build streams with `new AISdkStreamBuilder().start().toolCall(...).toolResult(...).textDelta(...).dataPart('data-verification-status', {status, passCount}).stepFinish().finish()`.
- To record what the browser sent, register your own `page.route('**/chat', …)` **after** `mockMastraAPI`. Playwright uses the last matching route first. See `drive/ask-question.verify.ts`.

To add a recipe:
1. Copy `drive/ask-question.verify.ts` to `drive/<feature>.verify.ts`.
2. Keep the `Evidence` calls (`capture` after each user action, `json` for side effects, `write` at the end).
3. Add or extend the matching `features/<feature>.md`.

`drive/package.json` marks the dir as ESM (like `e2e/`). `drive` symlinks `drive/node_modules` to `e2e/node_modules` (gitignored) so `@playwright/test` resolves.

### Not driveable locally (documented, unverified)

These are other surfaces, and the real-model path. This skill does not exercise any of them, and proofs must not claim them:
- **Agent HTTP API** (`packages/agent`, Mastra, :4111; `npm run dev:agent`). It needs `OPENAI_API_KEY`, `VOYAGE_API_KEY` (optionally `ANTHROPIC_API_KEY`) and a local Neo4j via `docker compose` (`npm run dev:infra`; see `.env.example`).
  - `/livez` should answer without the graph; `/readyz` needs Neo4j.
  - **Unverified:** no keys or Docker on the verification box.
- **Real end-to-end chat / Deep Research** (`e2e/tests/smoke/*`, project `smoke`, which only exists without `HERMETIC_AUTH`). It needs a real WorkOS app (`WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, `WORKOS_REDIRECT_URI`), `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` for a dedicated test account, and the agent above with real keys. **Unverified.**
  - Never use `npm run smoke:prod`: it targets production.
- **Crawler / pipeline CLIs** (`packages/crawler`, `packages/pipeline`). They need network access to NC DHHS, Docling, Neo4j and Voyage. **Unverified.**
- **Corpus job** (Railway). **Never drive.**

## Evidence

Evidence for each run lives in `${VERIFY_EVIDENCE_ROOT:-<repo>/.verify-evidence}/<run-id>/` (gitignored). It survives `cleanup`.
- `run-info.txt`: git revision, dirty flag, Node version, base URL, launch and cleanup times.
- `<target>/` for each drive:
  - `runner.log` and `exit-code`
  - `report.json` (Playwright JSON)
  - `playwright-output/` (trace.zip and final screenshot per test; open with `npx playwright show-trace`)
- Recipes also write `<target>/artifacts/`:
  - numbered `NN-<step>.png` and `NN-<step>.aria.yml` (ARIA snapshot of `main`)
  - side-effect JSON (for example `agent-request.json`)
  - `agent-boundary.json`: every browser request to :4111, labelled `recipe-mock`, `corpus-status-mock` or `aborted-unmocked`
  - `summary.json`: feature, entry point, steps with URL and time, result
- `server-logs/` holds the web and JWKS logs, copied at cleanup.
- `MANIFEST.sha256` is written by `evidence` and again at `cleanup`.

Proof standards:
- Drive the real user path: real routes, real middleware, real React UI, clicks and typing. Don't use internal setters or test-only endpoints.
- Capture the action **and** the resulting state: a screenshot and ARIA snapshot after each user step, not only the final screen.
- Check side effects alongside what's visible. The side effect a web-chat action has is the request the browser sends to the agent: method, bearer auth, body (`messages` holds only the new turn, `memory.thread`/`memory.resource`). Record it as JSON.
- Mocks are allowed only where a production boundary already isolates the external system: the browser→agent HTTP API and the WorkOS JWKS. Everything a mock decides (answer text, verification status, stored history) is fixture data. Report it that way.
  - "Survives reload" proves the UI re-fetches and re-renders the thread. It does not prove the agent persisted anything.
- Report a path you couldn't reach with the attempted command and the unmet precondition. Never report it as verified through a different path.

## Cleanup

`$V cleanup`:
- Sends TERM to each process group recorded at launch, then KILL after a grace period. It never kills by name or port.
- Copies the logs into the evidence and removes the scratch state dir (`${TMPDIR:-/tmp}/verify-medicaid-agent/<id>`, which holds the minted session) and the `current` pointer.
- Warns if :3000 or :8719 are still in use. Something else owns them: report it, don't kill it.
- Rewrites `MANIFEST.sha256`.

It never touches `.verify-evidence/`. Run it after every run, including failed launches. Delete old evidence by hand when no longer needed.

## Helpers

- `scripts/verify.sh {launch|doctor|drive|evidence|cleanup}`: the controller above. It is executable; `$V help` prints usage.
  - Port ownership checks use `ss` (iproute2), falling back to `lsof -nP -iTCP:<port> -sTCP:LISTEN -t`. On Linux, a `/proc` socket lookup covers processes lsof can't see, such as `next-server (v…)`. If neither tool is on PATH, `launch` and `doctor` fail with a message naming both. `cleanup` still stops its process groups and keeps the evidence, then exits non-zero because it could not confirm the ports are free.
  - `launch` records each server's pid and start-time identity (`/proc/<pid>/stat` starttime on Linux, `ps -o lstart=` elsewhere). `cleanup` stops a process group only if the pid still has that identity. Otherwise it prints `NOT stopping <svc>: pid … is no longer the process this run started` and leaves the process alone (PID-reuse guard).
- `drive/verify.config.ts`: the Playwright config the controller uses. Don't run it directly; it needs `VERIFY_EVIDENCE_DIR` and `VERIFY_AUTH_FILE`.
- `drive/session.setup.ts`: mints the hermetic session with `e2e/helpers/test-auth.ts`.
- `drive/evidence.ts`: `new Evidence(feature, entryPoint)`, with `.capture(page, step, note)`, `.json(name, value)` and `.write(extra)`.
- `drive/agent-boundary.ts`: the agent-port guard fixture described under Drive.
- `drive/ask-question.verify.ts`: the reference recipe.
- Run ids: every command accepts only a launch-generated id (`YYYYMMDDTHHMMSS-<pid>`) from `current` or `VERIFY_RUN_ID`, and rejects paths. Before reading pid files, writing evidence or running `rm -rf`, it refuses if the run's state or evidence dir is a symlink or resolves outside `${TMPDIR:-/tmp}/verify-medicaid-agent` or `.verify-evidence`.
- `features/`: the feature map. Start at `features/README.md`.

Keep the map honest as the app changes with `/maintain-verification-skill`.
