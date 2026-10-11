# Deep Research

A signed-in user turns on Deep Research, asks a question, reviews and approves a research plan, then waits (minutes) for a long cited report with its own verification result.

## Sub-features

- `dr-toggle` switches the composer between modes with `deep-research-toggle` (`Deep Research off` / on).
- `dr-plan` makes the agent propose a plan (`deep-research-plan`), and the user approves it (`approve-plan`).
- `dr-report` renders the report (`deep-research-report`) with citations and a verification result (`deep-research-verification`).

## How to get to it (user POV)

- In `/chat`, choose the Deep Research toggle above the input, ask, then choose approve on the proposed plan.

## Driving it with verify.sh

Preconditions:

- **Unmet on this box. Unverified.** The only existing harness is `e2e/tests/smoke/deep-research.spec.ts`. It needs:
  - the real-login `smoke` project (no `HERMETIC_AUTH`) with a WorkOS app (`WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, `WORKOS_REDIRECT_URI`) and a dedicated test account (`TEST_USER_EMAIL`, `TEST_USER_PASSWORD`)
  - a local agent (`npm run dev:agent`) with `OPENAI_API_KEY` and `VOYAGE_API_KEY`
  - a local Neo4j corpus (`npm run dev:infra`, Docker)

- **Toggle only (local).** After `$V launch`, a recipe may click `deep-research-toggle` and capture the composer state. That proves the toggle UI only.
- **Full flow (needs the preconditions above, and never production).** With the env set and the local agent and Neo4j up, run `cd e2e && npx playwright test --project=smoke tests/smoke/deep-research.spec.ts`. Screenshots go to `deep-research-shots/`. This runs outside `verify.sh`, because `verify.sh` is hermetic by design.
- **Proof.** Report the plan, the approval and the report with `deep-research-verification` visible, plus the agent log. Until that run happens, report Deep Research as **unverified**.

## Gotchas

- `npm run smoke:prod` targets production. Never use it for verification.
- In hermetic mode the `smoke` project does not exist, by design (`project not found`). Don't patch around it with the test cookie: that would claim real login was verified when it wasn't.
- No mocked spec covers the plan and report yet. A mocked recipe would need plan and report stream fixtures modelled on `packages/contracts`.
