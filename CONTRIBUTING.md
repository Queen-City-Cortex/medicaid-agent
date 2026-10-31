# Contributing

Thanks for looking. This is a one-person research project with no users, so the most useful contributions are bug reports with a reproduction, questions about a design choice, and small focused fixes.

## Before you start

- Read [AGENTS.md](AGENTS.md). Its rules apply to every change, whoever or whatever writes it. The review rules about answer release, verifier bounds, inference providers and route ownership are enforced in review.
- Read the [project gotchas](docs/development/gotchas.md) before changing parsing, retrieval, deployment or verification.
- For anything larger than a bug fix, open an issue first. Changes to retrieval, prompts or models are decided by the evaluation harness, and most of those runs need paid API keys and a built corpus.

## Setting up

Follow the [quickstart](README.md#quickstart-running-something-in-ten-minutes-no-secrets). The [development guide](docs/development/README.md) lists which checks each kind of change needs. In short:

| You changed | Run |
| --- | --- |
| A TypeScript package | `npm test -w <package>` and `npm run build -w <package>` |
| The agent's schemas or API | Both of the above for `@nc-medicaid/agent`; passing tests alone does not prove the types compile |
| The web app | The above for `@nc-medicaid/web`, and `npm run test:e2e` |
| The Python pipeline | From `packages/pipeline`: `uv run --extra dev python -m pytest tests/`; then `npm run lint -w @nc-medicaid/pipeline` |

## Pull requests

- Keep each pull request to one change, with a description of what changed and why.
- Add or update tests with the change. Do not skip, disable or loosen a test to get CI green.
- Never commit credentials, `.env` files, browser session state or personal data. CI runs a secret scan over the working tree.
- Contributions are accepted under the [Apache-2.0 licence](LICENSE).
