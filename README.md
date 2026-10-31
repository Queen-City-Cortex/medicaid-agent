# NC Medicaid Navigator

[![CI](https://github.com/Queen-City-Cortex/medicaid-agent/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Queen-City-Cortex/medicaid-agent/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

A research agent that answers questions about North Carolina Medicaid policy from a corpus of state and federal policy documents, and shows an answer only after a verifier has checked that exact text against the sources it cites.

It was built by one engineer between March and October 2026, with coding agents doing much of the typing and the engineering governance described below deciding what shipped.

## Status

**This project has no users.** It is a research-grade system, not a product. It was deployed for testing, never launched, and the October 2026 [project review](docs/reviews/2026-10-05-full-review/README.md) concluded it was not ready for a first customer. That review is published here in full.

Nothing it says is legal advice or a benefits determination.

## What is different about it

- **No model prose reaches a user unverified.** Draft answers stay on the server. Text reaches the browser, the history endpoints or storage only through a release gate that passes text the verifier approved, word for word. Stored answers are signed at release. ([how](docs/architecture/tradeoffs.md#withholding-is-always-acceptable-releasing-unverified-text-never-is))
- **Cheap checks before expensive ones.** Every link and quotation in an answer is checked against the retrieved sources in code before any model is asked whether the answer is supported. ([how](docs/architecture/tradeoffs.md#deterministic-checks-run-before-any-model-call))
- **The verifier is bounded on purpose.** 30-second deadline, two passes, no retries. Withholding an answer is always acceptable; releasing unverified text never is. ([why](docs/architecture/tradeoffs.md#the-verifier-is-bounded-30-seconds-two-passes-no-retries))
- **An evaluation harness from day two, used to say no.** It rejected an LLM reranker after about three months in the codebase, `voyage-4-large` embeddings, and a candidate verifier model. ([the record](docs/architecture/tradeoffs.md#evaluation-decides-and-it-has-said-no))
- **Decisions fix their bounds first and let a measurement choose.** [Decision 0002](docs/decisions/0002-verifier-model-family.md) sets up how the verifier's model family will be chosen: three arms, a win rule written in advance, noise thresholds and a spend cap.
- **Corpus releases are governed by a written policy.** A [release policy](corpus-release-policy.json) sets minimum document counts, embedding coverage and evaluation floors, and the [blue-green procedure](docs/operations/blue-green-corpus-releases.md) rebuilds an inactive graph and keeps the old one for rollback. The procedure has not yet completed in production; the deployment still serves a legacy graph built in July 2026.

## Numbers

Each figure was produced by the command or file named beside it, on 25 October 2026, at commit `159755c`.

| | Figure | Source |
| --- | --- | --- |
| Documents in the serving graph | 6,725 | `/corpus-status` response recorded on 2 October 2026 in [`health-checks.json`](docs/validation/chat-acceptance-2026-10-02/health-checks.json) |
| Golden questions (dataset 3.6) | 56, plus 50 held-out paraphrases | `packages/pipeline/data/golden/dataset.json`, `heldout-paraphrase.json` |
| Held-out answer score, three runs, June 2026 | 2.82 mean of 2.86, 2.78, 2.82 (0 to 3 judge scale) | `aggregate.overall` in the `2026-06-12T23:32`, `2026-06-13T00:11` and `2026-06-13T00:39` files under `packages/pipeline/data/eval-results/milestones/` |
| Reranker A/B that removed it | 9 runs, 150 scored answers per arm | `git show 1329d4f` |
| TypeScript unit tests | 2,719 passed, 21 skipped | `npx turbo run test --filter='!@nc-medicaid/pipeline'` from a clean clone |
| Python pipeline tests | 1,171 passed, 30 skipped, 2 need tokenizer files | `pytest tests/` in `packages/pipeline` |
| Browser tests against a mocked backend | 96 passed | `npm run test:e2e` |
| Commits on `main` | 715, of which 492 credit a coding agent as co-author | `git rev-list --count main`; commit trailers |

The scores are from a judge model on this project's own questions. The October review found problems with some reference answers and with how withheld answers were scored; read [the evaluation caveats](docs/architecture/tradeoffs.md#evaluation-decides-and-it-has-said-no) before comparing them with anything.

## Read next

1. [Design tradeoffs](docs/architecture/tradeoffs.md): why a graph, why a same-family verifier for now, why the verifier's bounds are fixed, and what each choice costs.
2. [Decision 0002](docs/decisions/0002-verifier-model-family.md): choosing the verifier's model by measurement.
3. [The October 2026 project review](docs/reviews/2026-10-05-full-review/README.md): 256 issues, what is strong, and why it was not ready.

## How it works

```
crawler ──► pipeline ──────────► Neo4j graph ◄── policy-corpus ◄── agent ◄── web
(TypeScript) (Python, Docling)   documents,       retrieval,        input gates
 discovers,   parses, loads,     sections,        answer frames     model + tools
 downloads    embeds (Voyage)    amendments,                        verifier
                                 cross-references                   release gate ──► browser
```

| Package | Does |
| --- | --- |
| [`crawler`](packages/crawler) | Discovers and downloads policy documents from NC and federal sites into a SQLite registry |
| [`pipeline`](packages/pipeline) | Parses documents with Docling, loads the graph, embeds sections, runs the evaluation harness |
| [`policy-corpus`](packages/policy-corpus) | Hybrid retrieval and answer frames: which documents govern which question |
| [`contracts`](packages/contracts) | Shared API schemas |
| [`agent`](packages/agent) | Mastra server: input gates, the agent loop, the verifier, the release gate, deep research |
| [`web`](packages/web) | Next.js chat and research interface |
| [`e2e`](e2e) | Playwright tests, mocked and live |

The [architecture guide](docs/architecture/README.md) covers the boundaries in detail.

## Quickstart: running something in ten minutes, no secrets

Tested from a clean clone on Linux. You need Node 22 (the repository pins 22.23.3 in `.nvmrc`; 22.22 works with an engine warning) and npm.

```bash
git clone https://github.com/Queen-City-Cortex/medicaid-agent.git
cd medicaid-agent
npm ci                                                     # about 1 minute

# The UI component gallery, with fixtures and no backend
npm run preview:web                                        # then open http://localhost:3000/preview

# The TypeScript test suites (skips the Python pipeline, which needs its own setup)
npx turbo run test --filter='!@nc-medicaid/pipeline'       # about 1.5 minutes

# Production builds of every package
npm run build                                              # about 1 minute

# The browser tests against a mocked agent (stop preview:web first: they start
# their own server on port 3000 and will not reuse one)
(cd e2e && npm ci && npx playwright install chromium)
npm run test:e2e                                           # about 2.5 minutes, 96 tests
```

`npm run preview:web` sets placeholder WorkOS values that let the sign-in middleware start; no WorkOS account is involved and `/preview` never calls it. The landing page also loads; anything behind sign-in redirects to WorkOS and will not work without a real account.

Plain `npm test` fails from a clean clone until the Python pipeline is set up, because it runs the pipeline's tests too. To set that up you need [uv](https://docs.astral.sh/uv/) and Python 3.11; expect a large download (the environment is about 5 GB, mostly PyTorch):

```bash
npm run setup -w @nc-medicaid/pipeline   # creates packages/pipeline/.venv and fetches tokenizer files from Hugging Face
npm test
```

## Running the whole system

This path needs paid API keys and a corpus you build yourself. It was not run during release preparation, so treat it as documented rather than tested.

1. **Services and keys.** Docker for Neo4j (`npm run dev:infra`), an OpenAI key (agent, verifier and input classifiers) and a Voyage AI key (embeddings). Copy `.env.example` to `.env`. [RUNBOOK.md](RUNBOOK.md#environment-variables) lists every variable.
2. **A corpus.** No corpus snapshot is published. Crawl the sources (`cd packages/crawler && npx tsx src/index.ts crawl --source clinical_policy` for one family; a full crawl takes about 40 minutes), then build the graph with `.venv/bin/python -m pipeline.cli run-all` from `packages/pipeline`. Parsing thousands of PDFs takes hours, and embedding the full corpus was estimated at about $115 in October 2026.
3. **Ask a question** from the command line, without the web app or WorkOS: `npm run cli -w @nc-medicaid/agent -- "Does NC Medicaid cover speech therapy by telehealth?"`.
4. **The web app** additionally needs a WorkOS AuthKit project (`WORKOS_*` variables) and `npm run dev`.

Before running the agent for real users, read Mastra's `ee/LICENSE`: the WorkOS auth provider imports code that `@mastra/core` ships under its Enterprise licence (issue #430).

## Built with coding agents

Most commits were written with coding agents, mainly Claude, with some Codex and Cursor work. The controls on that are part of the design, not an afterthought:

- **[AGENTS.md](AGENTS.md)** carries code review rules any reviewer, human or model, applies: the release-gate rule, the verifier bounds, the approved inference providers, and route ownership.
- **Evaluation gates** decide changes to retrieval, models and prompts; a passing test suite alone does not.
- **Recorded mistakes.** [Project gotchas](docs/development/gotchas.md) records what went wrong and how to avoid it, so the next session does not repeat it.
- **Review into issues.** The October 2026 review produced 415 verified findings, merged into 256 issues with severity, effort and a "done when" checklist each, and they are being worked as normal issues.

## Repository guide

- [Documentation index](docs/README.md): every guide, runbook and decision.
- [RUNBOOK.md](RUNBOOK.md): operating the deployed system.
- [CONTEXT.md](CONTEXT.md): glossary.

## Contributing, security and licence

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Licensed under [Apache-2.0](LICENSE); policy document excerpts in fixtures and evaluation data belong to their publishers ([NOTICE](NOTICE)).
