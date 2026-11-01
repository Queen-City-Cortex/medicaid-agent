# NC Medicaid Navigator verification map

This directory is the maintained source for verifying the user-facing behavior of NC Medicaid Navigator. The primary surface is the web chat. Read this index before driving the app, then use the matching feature file as the recipe. Every command below assumes `V=.agents/skills/verify-medicaid-agent/scripts/verify.sh`, run from the repo root.

## Baseline preconditions

- Node matches `.nvmrc`, and `npm ci` has been run at the repo root and in `e2e/`. The Playwright Chromium is installed.
- Ports 3000 and 8719 are free. `$V launch` printed `verify: ready: run <id> ...`.
- `$V doctor` prints `doctor: OK`. That includes a logged-out `/chat` redirecting to `http://127.0.0.1:8719/`.
- The signed-in user is the hermetic test user `e2e@test.local` (`user_e2e_test`), minted per drive. No real account is used.
- The agent (`localhost:4111`) is mocked in the browser by each recipe or spec. Nothing may listen on 4111: `launch` and `drive` refuse and `doctor` fails otherwise. Recipes also go through `drive/agent-boundary.ts`, which serves `/corpus-status` and aborts any unmocked agent call.
- Never drive an instance this run did not start. Never point a drive at production, Railway or a real WorkOS tenant.

## Driving conventions

- Start every recipe from a fresh page on `/chat` with the baseline state. Mocked threads and history come from the recipe's fixtures, so there is no seeded data to restore.
- Prefer `data-testid` handles and accessible names (`Ask`, `Rate helpful`, `Get help`) over CSS or DOM position. The handle list is in `SKILL.md` under Drive.
- Run skill recipes with `$V drive <name>` (files in `drive/<name>.verify.ts`).
- Run the repo's mocked specs against the same instance with `$V drive e2e:tests/mocked/<spec>.spec.ts [-- -g "<test title>"]`.
- Treat commands as literal. Keep quoted titles unchanged.
- Run `$V cleanup` when done, including after failures. It keeps `.verify-evidence/<run-id>/`.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen. Recipes write a numbered PNG plus an ARIA snapshot per step under `<target>/artifacts/`. Specs leave a trace and a final screenshot under `<target>/playwright-output/`.
- UI proof shows the app identity (`NC Medicaid Navigator` header) and the asserted handle (badge, footnote, notice).
- Side-effect proof is the request the browser sent to the agent: method, bearer auth present, body. Record it as JSON. For refusals, the proof is that no answer was rendered and the user's text was kept.
- Persistence claims are limited to "the UI re-fetches and re-renders the thread". The agent's memory is mocked.
- Record the feature ID and entry point with every artifact (`summary.json`, or the spec title in `report.json`).
- Report an unreachable path with the attempted command and the unmet precondition (for example, "needs `OPENAI_API_KEY` + Neo4j"). Never report it as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify.sh` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Ask a question](./ask-question.md) covers the composer (Send, Enter, example cards), the streamed answer, the verification badge, citations and Sources, and reopening the thread. **Proven end to end by `$V drive ask-question`.**
- [Refused and withheld answers](./refused-answers.md) covers the guard tripwire notice, rate-limit and payload errors, withheld or corrected verification outcomes, and the client-identifier guard.
- [Rate an answer](./feedback.md) covers thumbs up and down, the comment box, the identifier refusal on comments, and rehydration on thread reopen.
- [Sign-in gate and public pages](./sign-in-and-public-pages.md) covers the landing page, terms, privacy, Get help, and the logged-out `/chat` redirect.
- [Deep Research](./deep-research.md) covers the toggle, plan approval and the cited report. **Real-model only: unverified locally.**
