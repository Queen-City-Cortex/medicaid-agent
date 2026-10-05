# Mastra, AI SDK and dependencies: all issues

Installs from source are reproducible: both lockfiles are complete and hashed, and base images and tools are pinned by digest. Nothing in this section fails for a user of the deployed product today; the one live failure is the laptop's scheduled jobs. The weakness lies outside the locks. The Mastra family is half pinned across two release trains, the single-core override is ignored by the pinned npm, and the agent image is built from a second install that no lockfile or audit governs. Parser model weights and Python advisories are unwatched. The main risk is an upgrade that passes every check and still breaks chat; the open, green pull request #190 is one. First close #190 and #164 and pin the Mastra family exactly behind a lockfile check, then make the image ship the locked tree. Refresh both AI SDK providers before any GPT-6 comparison.

## What is working

- Both lockfiles are complete: every registry entry in `package-lock.json` carries sha512 integrity and `packages/pipeline/uv.lock` hashes all 131 third-party packages. The workflow installs with `npm ci` and runs `uv lock --check` (`.github/workflows/ci.yml:93`, `.github/workflows/ci.yml:109-111`).
- Base images are pinned by tag and digest in all three Dockerfiles, uv by digest and the Railway command-line tool by checksum (`packages/pipeline/Dockerfile:18-29`); workflow actions in `.github/workflows/ci.yml` are pinned to commit hashes.
- The verifier and scope gate call the AI SDK directly rather than through the Mastra agent loop (`packages/agent/src/processors/verifier/verify.ts:94`, `packages/agent/src/processors/scope-gate.ts:51`), so upstream agent-loop changes do not alter those model calls.
- The execution gateway is a positive allowlist (`packages/agent/src/execution-gateway.ts:22-35`). Against server 1.45.0 (351 routes) and a static extraction of 1.74.0 (419 routes) it exposes the same seven stock memory routes and none of the 68 added.
- The answer-release boundary is tested with real Mastra objects rather than mocks (`packages/agent/tests/answer-release-mastra.test.ts`, `packages/agent/tests/chat-memory-http.test.ts`), and `packages/agent/src/chat-memory.ts:17-22` fails at start-up on an incompatible storage adapter.
- Risky major upgrades are held deliberately under tracking issues (#144, #145, #147, #148, #162), and `docs/development/gotchas.md:186-188` records the Mastra coupling lessons behind the current pins.

## Medium severity

### DEPS-1 · Mastra packages span two release trains, and the single-core override does not hold

**medium** · effort M · dependency, reliability, test gap

`packages/agent/package.json` pins three August releases exactly (`@mastra/core` 1.58.0, `@mastra/memory`, `@mastra/observability`) and leaves five others plus the `mastra` command-line tool on carets. That tool selects the June `@mastra/server` and `@mastra/deployer` 1.45.0, declared nowhere and bundled as the production server. Peer ranges give no protection: `@mastra/loggers` 1.3.x, inside its caret, failed at import in pull request #164. The pinned npm 11.11.0 ignores the `package.json:19` override on workspace dependencies, so pull request #190 passed every check with core 1.72.0 over server 1.45.0.

**Impact.** Merging #190 would run an untested framework pairing for chat users, because the build workflow never boots the agent image. Regenerating that lockfile under the workstation's npm 11.19.1 yields three copies of core.

**Fix.** Close pull requests #164 and #190. In `packages/agent/package.json`, replace every Mastra caret with the locked version and declare `@mastra/deployer` exactly; in web, drop the unused `@mastra/core` and pin `@mastra/client-js`. Add a lockfile check beside `scripts/check-production-audit.mjs`: one `@mastra/core` (or a documented `@mastra/client-js` exemption), server and deployer equal to it. Verifications split on deleting or keeping the root override; the owner decides, and the check is the real control. Upgrade the family in one pull request under issue #145.

*What is and is not established: The current pairing runs today without an observed fault. That the image bundles server 1.45.0 is read from the Dockerfile and deployer source; no image was inspected.*

Where: `package.json:19`, `packages/agent/package.json:24`, `packages/agent/package.json:44`, `packages/web/package.json:34`

### DEPS-2 · Agent image ships a second dependency tree outside the lockfile and audit

**medium** · effort M · dependency, security, reliability

`packages/agent/Dockerfile:25` runs `npx mastra build`, which writes its own manifest into `.mastra/output` and runs a fresh `npm install` there; line 47 copies only that directory into the runner. The root `package-lock.json` and `overrides` are not consulted, and `npm run audit:production` audits the root tree only. The latest green main build log shows 707 packages from `npm ci`, then a separate 299-package install. Deployer 1.45.0 writes exact versions for direct dependencies, so only transitive packages float today; from deployer 1.58.0 the manifest keeps the declared ranges.

**Impact.** Users run a dependency tree resolved separately from the one tested and audited: transitive versions are chosen fresh at each image build, and the advisory overrides for `fast-uri` and `probe-image-size` do not apply.

**Fix.** Add a `prod-deps` stage to `packages/agent/Dockerfile` that runs `npm ci --omit=dev` for the contracts, policy-corpus and agent workspaces, and have the runner copy those `node_modules` plus the bundle from `.mastra/output` without its own `node_modules`, `package.json` and lockfile. Move `hono` to `dependencies`. Add a final build step that resolves every external the bundle imports and fails on a miss. Build the image and check `/livez` before merging.

*What is and is not established: Read from the Dockerfile, deployer source and one build log; no image was built or inspected, no harmful transitive version was observed, and the proposed Dockerfile change is untested.*

Where: `packages/agent/Dockerfile:25`, `packages/agent/Dockerfile:47`, `scripts/check-production-audit.mjs:7`, `packages/agent/package.json:43`

### DEPS-3 · Parser model weights are fetched unpinned at run time and never recorded

**medium** · effort M · data quality, reliability, dependency, security

`create_converter()` (`packages/pipeline/src/pipeline/parse/converter.py:67`) sets no artifacts path, so the locked Docling 2.115.0 downloads its layout model from the `main` branch of the Hugging Face repository `docling-project/docling-layout-heron` when a fresh container parses a document. That branch moved on 2025-07-02 and 2026-02-09. The text-recognition fallback fetches RapidOCR weights from modelscope.cn, and nothing checks the downloaded bytes. `.github/dependabot.yml:68` freezes these packages pending issue #161, yet the weights escape it, and parse sidecars record only the Docling package version.

**Impact.** When upstream moves that branch, new and changed PDFs get a different model from the rest of the corpus: sections and tables can shift with no repository change and no record of which documents.

**Fix.** Bake the weights into `packages/pipeline/Dockerfile` after `uv sync`: `snapshot_download` both Docling repositories at pinned commits and fetch the RapidOCR torch set selected today, checking its five files with `sha256sum --check`. Set `DOCLING_ARTIFACTS_PATH` and `HF_HUB_OFFLINE=1`, and add an offline build check that initialises the converter with and without text recognition. Write the pins beside `docling_version` in the sidecar, not into the cache key. Change them only with a Docling upgrade under issue #161.

*What is and is not established: No changed parse was observed; the impact is inferred from the download path. Railway variables could not be inspected, so a production-only artifacts path is not excluded.*

Where: `packages/pipeline/src/pipeline/parse/converter.py:67`, `packages/pipeline/src/pipeline/parse/converter.py:991`, `packages/pipeline/Dockerfile:46`, `.github/dependabot.yml:68`

### DEPS-4 · Installed AI SDK providers mishandle GPT-6 and Claude 5.5 model identifiers

**medium** · effort S · evaluation validity, dependency, cost

The lockfile holds `@ai-sdk/openai` 3.0.74 and `@ai-sdk/anthropic` 3.0.85. The first treats only `o1`, `o3`, `o4-mini` and `gpt-5` identifiers as reasoning models: for `gpt-6.1-sol` a fake-fetch capture showed it dropping the verifier's `reasoningEffort: 'low'` (`packages/agent/src/processors/verifier/verify.ts:99`) with only a warning. The second sends Claude 5.5 requests with a 4,096-token output cap and, for `generateObject`, a forced tool choice Anthropic documents as an error. The 2026-10-03 model audit names Sol as a verifier candidate.

**Impact.** A Sol verifier comparison would run at the model's default medium effort under the unchanged 30-second deadline; slower passes and extra withheld answers would be blamed on the model, wasting paid evaluation runs.

**Fix.** Run `npm update @ai-sdk/openai @ai-sdk/anthropic -w packages/agent` (3.0.124 and 3.0.127, in range) before any GPT-6 or Claude 5.5 run; one verification would instead defer every AI SDK update to issue #145, so the owner must choose. Leave `ai` untouched. Check `npm ls @ai-sdk/provider @ai-sdk/provider-utils`, then run the agent tests and build. Add a fake-`fetch` Vitest test asserting `reasoning.effort` is `low` for every OpenAI identifier in `packages/agent/src/usage/pricing.ts`.

*What is and is not established: Latent: no GPT-6 or Claude 5.5 identifier is configured today. Observed with a fake fetch, not a live model; only the OpenAI verifier part was fully confirmed.*

Where: `packages/agent/package.json:20`, `packages/agent/src/processors/verifier/verify.ts:99`, `packages/agent/src/usage/pricing.ts:22`, `docs/validation/qualification-cycle-2026-10-03/model-audit.md:8`

### DEPS-5 · Node and Python pins disagree and are unenforced; laptop scheduled jobs now fail

**medium** · effort S · deadline 2027-04-30 · reliability, documentation, dependency

`package.json:9`, both workflow jobs and all three Dockerfiles pin Node 22.23.3, but `.nvmrc` says 22.22.0, `RUNBOOK.md:6` says 22.12 or later, and nothing binds a workstation. The laptop's scheduled jobs put Homebrew first on the path, which now resolves to Node 26.9.0: the daily check has failed every day since 2026-10-02, and the weekly refresh failed on 2026-10-03, loading a `better-sqlite3` binary built for Node 22. Python drifts too: tests run on 3.11.14, the corpus image on Debian's unpinned 3.11, the local environment on 3.13.2. Node 22 support ends on 2027-04-30.

**Impact.** Only the owner's laptop fallback is affected; the Railway corpus job runs in the pinned image. Pipeline tests never run on the interpreter that executes that job, and nothing will propose leaving Node 22.

**Fix.** Unload the Saturday `com.ncmedicaid.weekly-refresh` job first: as reported in another section, this Node failure is among the accidents stopping it wiping the production graph. Then put Node 22 first on the path in `scripts/ops/lib.sh` with a version guard, set `.nvmrc` to 22.23.3 and have both `setup-node` steps read it, add `packages/pipeline/.python-version` with an exact patch, and correct `RUNBOOK.md:6`. Do not add `engine-strict` while `engines` holds exact pins. Open an issue for Node 26.

*What is and is not established: The laptop job failures were observed in logs and carry the medium rating; the version disagreement alone is low. No difference in parser output between Python versions was shown.*

Where: `.nvmrc:1`, `RUNBOOK.md:6`, `scripts/ops/launchd/com.ncmedicaid.daily-check.plist:26`, `packages/pipeline/Dockerfile:15`

### DEPS-6 · Nothing watches for vulnerable dependencies outside the npm production tree

**medium** · effort M · security, dependency

The only vulnerability check is `npm audit --omit=dev` on pushes and pull requests (`.github/workflows/ci.yml:96`). Dependabot alerts and security updates are disabled, and nothing audits `packages/pipeline/uv.lock`, `e2e` or npm development packages, which the corpus-job image installs. A query of the Open Source Vulnerabilities database matched 54 advisories in 12 of the 131 locked Python packages (1 critical, 31 high), including 14 in `pypdf` and 18 in `pillow`; in-range upgrades fix all but eight.

**Impact.** The owner learns of new advisories in the Python parser stack or development packages only by accident. The corpus job runs those parsers on downloaded documents; exploitation would need a compromised upstream source.

**Fix.** Enable the dependency graph, Dependabot alerts and Dependabot security updates in the repository settings; the existing `.github/dependabot.yml` entries then cover all three lockfiles. Run `uv lock -P` for `pypdf`, `pillow`, `urllib3`, `lxml`, `anyio`, `idna`, `soupsieve` and `pygments` in `packages/pipeline`, then the pipeline tests and a fresh uncached parse of a few PDFs, one encrypted. Run `npm update shell-quote`. Reword the success line at `scripts/check-production-audit.mjs:45` to say it covers the root npm production tree only.

*What is and is not established: Advisory counts are version matches only; reachability was not assessed and no exploit was shown. The `pypdf` advisories are all denial-of-service class.*

Where: `.github/workflows/ci.yml:96`, `scripts/check-production-audit.mjs:7`, `.github/dependabot.yml:75`, `packages/pipeline/pyproject.toml:19`

### DEPS-7 · Dependabot groups split coupled package families across separate pull requests

**medium** · effort S · dependency, cost

`.github/dependabot.yml:7-9` says runtime libraries and their command-line and client packages must move together, but the four open Dependabot pull requests split them. #164, from the dedicated group, carries only `ai` and `mastra`; #190, from the generic production group, carries the scoped `@mastra/*` and `@ai-sdk/*` packages plus `ai`, `react` and `react-dom`; #181 carries `mastra` and `vitest`. #164, #181 and #184 fail their checks, and #190 passes with a mismatched Mastra set. The groups were introduced on 2026-10-02.

**Impact.** The owner's update queue produces work without results: in-range fixes such as `vitest` 4.1.11 stay trapped in failing grouped pull requests, and every rebase reruns three workflow jobs per pull request.

**Fix.** Ignore `@mastra/*`, `mastra`, `ai` and `@ai-sdk/*` for major, minor and patch updates in `.github/dependabot.yml`, leaving security updates unaffected, so the family moves only under issue #145; one verification would keep the dedicated group instead, which is the owner's choice. Ignore React minor and major updates and `@sentry/*` majors, and exclude `vitest` and `@vitest/*` from both generic groups. Close #164, #181 and #190. By hand, pin `vitest` 4.1.11 in all six manifests and run `npm update shell-quote body-parser`.

*What is and is not established: The pull requests were observed, but why Dependabot assigned packages this way was not established, so the proposed configuration is untested. The cost is the owner's time, not user harm.*

Where: `.github/dependabot.yml:7`, `.github/dependabot.yml:9`, `.github/dependabot.yml:14`, `docs/development/gotchas.md:186`

## Low severity

### DEPS-8 · Memory release gate patches nine methods by name and cannot notice new ones

**low** · effort M · wrong-answer risk, release gate, test gap, dependency

`installMemoryReleaseGate` (`packages/agent/src/answer-release.ts:56-96`) reassigns nine named methods on the LibSQL memory store and enumerates nothing else. From `@mastra/memory` 1.30.0 cloning calls an unwrapped `copyThread`, bypassing the clone wrapper while the tests still pass.

**Impact.** No unverified text is returned today or on those versions, because reads stay wrapped. The next upstream method that reads or writes message text would be unguarded and untested.

**Fix.** Classify every function on the store's whole prototype chain as guarded or reviewed pass-through and fail on any unknown name. The owner must choose where: inside `installMemoryReleaseGate`, failing at start-up, or in one Vitest test. Do this before adding the further wrappers that the memory-route fixes in the security section propose. Make the clone test in `packages/agent/tests/answer-release-mastra.test.ts` call `Memory.cloneThread` and then read, and add a case where a cloned unsigned assistant row reads back as unverified history.

*What is and is not established: Latent: no bypass exists on installed versions. The 1.30.0 behaviour comes from one reviewer's upstream probe that verification did not re-run.*

Where: `packages/agent/src/answer-release.ts:56`, `packages/agent/src/answer-release.ts:79`, `packages/agent/tests/answer-release-mastra.test.ts:57`, `packages/agent/src/index.ts:74`

### DEPS-9 · Unlogged duplicate-item workaround runs every model step but changed nothing in replays

**low** · effort S · needless complexity, test gap

`OpenAIResponsesDedupProcessor` (`packages/agent/src/processors/openai-responses-dedup.ts:141`), written in April 2026 against `@mastra/core` 1.17, can drop message parts on every step without logging. Offline replays of completed multi-step runs on installed versions showed no rewrite in eight invocations.

**Impact.** No user-visible effect was observed. If it fires, message parts are removed without trace, plausibly from saved history; `docs/development/gotchas.md:62` points debugging at request shapes the installed provider no longer produces for tool calls.

**Fix.** Add a Vitest canary first: fake `fetch` on `createOpenAI`, one thread, a multi-step turn with parallel tool calls plus a follow-up turn, asserting no request repeats an item identifier or `call_id`. Extend the replay to aborted and regenerated turns. If it stays clean, delete the processor, its test and both registrations in `packages/agent/src/index.ts`, and rewrite the gotcha as history. One finding would log removals before deleting; the owner chooses. Rerun the canary during the Mastra upgrade.

*What is and is not established: Eight offline replay invocations of completed runs only; aborted and regenerated turns were untested, and no live model was called.*

Where: `packages/agent/src/processors/openai-responses-dedup.ts:141`, `packages/agent/src/index.ts:145`, `packages/agent/src/index.ts:166`, `docs/development/gotchas.md:62`

### DEPS-10 · Production has no tracing; enabling it would export user identity and questions unredacted

**low** · effort S · privacy, test gap

`TRACE_STORE` defaults to off in production (`packages/agent/src/runtime-config.ts:100`), a documented choice. On `@mastra/observability` 1.16.6 each span copies the request context, which `SensitiveDataFilter` skips: a probe showed the bearer token redacted but the WorkOS user object and question in clear.

**Impact.** Nothing is exported today. Switching tracing on with these versions would write each caller's email, name and question to the trace store. Meanwhile a disputed answer leaves only logs and the opt-in private capture.

**Fix.** Add a span output processor ahead of `SensitiveDataFilter` at `packages/agent/src/index.ts:247` that sets `span.requestContext` to undefined; the app never reads it. Add a unit test with `TestExporter` asserting no exported span contains a token string or the user's email, since processor errors are swallowed. Replace the deprecated `DefaultExporter` with `MastraStorageExporter`. Treat production tracing as a separate decision needing a new `TRACE_STORE` value, sampling and a US-hosted or self-hosted backend.

*What is and is not established: Latent: tracing is off in production, so nothing leaks today. The exposure was shown by a local probe on the installed versions.*

Where: `packages/agent/src/runtime-config.ts:100`, `packages/agent/src/index.ts:246`, `packages/agent/src/index.ts:247`

### DEPS-11 · Internal packages use an npm scope nobody has registered

**low** · effort S · security, dependency

The `@nc-medicaid/*` packages are referenced with `*` ranges (`packages/agent/package.json:30-31`) under an npm scope unregistered on 2026-10-05. `mastra build` falls back to `latest` from the public registry when a workspace is missing from the build context; today's Dockerfile avoids that.

**Impact.** If someone registers the scope and a later Dockerfile change omits a workspace, the build would install that party's code into the agent image, which holds provider and sign-in secrets.

**Fix.** Register the `nc-medicaid` organisation on npmjs.com with two-factor authentication and publish nothing; if the name is taken, rename the workspace scope. Add `"private": true` to `packages/agent/package.json` and `packages/crawler/package.json`. After `RUN npx mastra build --dir src` in `packages/agent/Dockerfile`, add `RUN ! grep -nE '@nc-medicaid/|latest' .mastra/output/package.json` as a backstop. Do not rely on an `.npmrc` scope mapping; the install runs from `.mastra/output`, where it is not read.

*What is and is not established: Latent: needs both a third party registering the scope and a future Dockerfile change that omits a workspace. Neither has happened.*

Where: `packages/agent/package.json:30`, `packages/web/package.json:18`, `packages/agent/Dockerfile:25`, `docs/development/gotchas.md:116`

### DEPS-12 · Audit gate accepts exceptions with a missing or malformed expiry date

**low** · effort S · security, test gap

`scripts/check-production-audit.mjs:33` compares `expires` as text, so a missing field or a value such as "next quarter" never expires, and exceptions are keyed by package, not advisory. The file is empty today; until 2026-10-02 it held eleven entries, all expired.

**Impact.** Nothing is hidden now. The next exception added in a hurry can become permanent through a typo and will cover any later moderate advisory on that package. High and critical findings always fail.

**Fix.** Validate every entry in `security/npm-audit-exceptions.json` before the loop: `expires` must be a real `YYYY-MM-DD` date within about 90 days, and `owner` and `reason` non-empty strings. Fail on entries whose package has no current moderate finding. Export the evaluation as a pure function of report, exceptions and date, and add a `node:test` file with fixtures for missing, malformed, expired, too-far-future and stale entries. Advisory-level scoping is optional.

*What is and is not established: Latent: the exceptions file is empty today, so the defect cannot bite until an entry is added.*

Where: `scripts/check-production-audit.mjs:33`, `scripts/check-production-audit.mjs:31`, `security/npm-audit-exceptions.json:1`

### DEPS-13 · Root npm overrides are mostly redundant, and one forces an undeclared major version

**low** · effort S · dependency, needless complexity

Five of the six overrides at `package.json:12-27` are redundant or removable by an in-range update. The `ajv` override forces `fast-uri` 4.2.1 under a validator declaring 3.x, including the copy inside `@mastra/core`. No root code imports the three root dependencies.

**Impact.** No user effect has been observed; agent tests and builds pass. The owner must hand-edit two places for the next advisory on these packages, because Dependabot does not edit overrides.

**Fix.** Remove every override except `@mastra/core`, which the Mastra pinning decision settles, and delete the root `dependencies` block, in one pull request under npm 11.11.0. Run `npm update fast-uri undici ws postcss probe-image-size express qs` and confirm `fast-uri` moves to 3.1.8, `express` collapses to a single 5.2.1 and nothing else moves. Run `npm run audit:production`, then the agent tests and build. Do not add `npm ls` to the workflow; unrelated Tailwind entries keep it failing.

*What is and is not established: No fault was observed from the forced `fast-uri` major; the removal sequence was reasoned from the lockfile and not executed.*

Where: `package.json:12`, `package.json:28`, `scripts/check-production-audit.mjs:7`

### DEPS-14 · Mastra's Apache-labelled packages contain Enterprise-licensed code that the auth provider imports

**low** · effort S · dependency, documentation

`MastraAuthWorkos` (`packages/agent/src/index.ts:38`) imports from `@mastra/core/auth/ee`, which Mastra's licence (version 2.0, effective 2026-09-22) excludes from Apache-2.0 and bars from unlicensed production use. Mastra disables these features when `NODE_ENV` is `production`; the agent also accepts `staging`.

**Impact.** Nothing indicates a breach as deployed. The owner carries a licence question the code cannot settle; a `staging` environment serving real users would be unlicensed production use; Mastra may redesignate features in any release.

**Fix.** Record in a decision note which Mastra features the product uses (WorkOS bearer-token authentication only; no role-based access control or single sign-on), and add re-reading `ee/LICENSE` to the issue #145 upgrade checklist. Document that any environment serving real users runs with `NODE_ENV=production` and `MASTRA_DEV` unset. Ask Mastra in writing whether token authentication through `MastraAuthWorkos` is an Enterprise feature before the first paying customer.

*What is and is not established: A reading of the licence text, not legal advice; whether bearer-token authentication counts as an Enterprise feature is unresolved.*

Where: `packages/agent/src/index.ts:38`, `packages/agent/src/runtime-config.ts:82`, `packages/agent/Dockerfile:34`

### DEPS-15 · Four dependencies add install and image weight the product does not use

**low** · effort S · needless complexity, dependency

`shadcn` is installed for one stylesheet (`packages/web/src/app/globals.css:3`): 91 build-only lockfile entries carrying four of the full audit's twelve high findings. Web's `@mastra/core` is unused; `exa-js` installs the 12 MB `openai` package without loading it; `@mastra/duckdb` is a production dependency.

**Impact.** No runtime effect on users. The owner installs, audits and patches more packages than needed, and the agent image probably carries a 70 MB native library for a trace store that production turns off.

**Fix.** Delete web's `@mastra/core` devDependency. Add `EXA_API_KEY` to `.env.example`, described as enabling supplementary web search in Deep Research, or delete `packages/agent/src/tools/web-search.ts` and `exa-js` if web search is not wanted. Optionally copy `shadcn/dist/tailwind.css` into `packages/web/src/app` and drop `shadcn`. Move `@mastra/duckdb` to devDependencies or optionalDependencies and confirm with one `mastra build` that it leaves the output manifest.

*What is and is not established: The image-size effect is inferred; no image was inspected. The `shadcn` packages are build-stage only and do not reach the production web image.*

Where: `packages/web/package.json:50`, `packages/web/src/app/globals.css:3`, `packages/agent/src/tools/web-search.ts:3`, `packages/agent/src/index.ts:120`
