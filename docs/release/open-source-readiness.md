# Open-source release: owner decisions

Prepared on 25 October 2026 against `main` at `159755c`. The release pull request makes the documentation, licence and hygiene changes listed at the end. Everything below is a decision for the owner; each has a recommendation and the reason for it. Nothing here has been executed: no history rewrite, no issue closed, no setting changed, no visibility change.

**Status on 30 October.** Decision 1 is done: every credential found in history was rotated, along with every other key held on Railway after the Railway security incident, and the leaked values no longer work. Decision 2 is settled as recommended. On decision 3 the owner chose a new public repository from filtered history; this PR removes the details from the current files (dataset 3.7), and the filtered repository is a separate step. Decision 16 is resolved: #613 and #618 cleared the production audit and `main` is green.

Credential values and personal details are not repeated here. They are itemised in a private inventory delivered to the owner outside the repository.

## Must be settled before the repository goes public

| # | Decision | Recommendation | Reason |
| --- | --- | --- | --- |
| 1 | Rotate the three credentials found in Git history: a Voyage AI API key (committed 27 March 2026), the production Neo4j password (2 April) and the smoke-test account password (2 April) | Rotate all three now, before anything else | All three were still in the `main` working tree until this PR, issues #216 and #218 are open with no record of rotation, and no issue tracks the Voyage key. Anything that was ever committed must be treated as public. |
| 2 | Rewrite history, or rotate and move on | Rotate and move on for the Neo4j and smoke-test passwords. Let decision 3 settle the Voyage key | The Neo4j service has no public domain and the test account is disposable, so a rotated value is worthless. A rewrite of this repository cannot remove anything from GitHub anyway: `refs/pull/*` keeps every PR head commit. |
| 3 | Personal information: a golden-dataset note gives the owner's income, premium and disability-program enrollment (in the dataset, its held-out copy and one evaluation snapshot), and the March roadmap and status update describe the owner's own benefits history | Remove the income and enrollment details. If they must not exist publicly at all, publish a new repository from filtered history and transfer the open issues to it | Income and benefits enrollment cannot be taken back once public. Only a new repository removes them from GitHub; issues can be transferred between repositories, pull request discussions cannot. If the owner wants the origin story told, a short statement in the owner's own words in the README is better than notes scattered through data files. |
| 4 | The owner's personal email is the author address on 887 of 905 commits | Accept it if the existing repository is published; map it to the GitHub no-reply address if a filtered repository is published | It is already visible to anyone the repository is shared with, and is common on public GitHub. Turn on GitHub's "block command line pushes that expose my email" either way. |
| 5 | The hosted deployment | Close sign-up (issue #244) or stop the deployment before the repository is public | WorkOS sign-up is open and the agent admits every authenticated user, so publicity becomes model spend on the owner's OpenAI account. The production hostnames are written in RUNBOOK.md. |
| 6 | Enable GitHub private vulnerability reporting, secret scanning with push protection, and Dependabot alerts (#357) | Enable all three | SECURITY.md points reporters at private vulnerability reporting, which is off until enabled. |

## The release itself

| # | Decision | Recommendation | Reason |
| --- | --- | --- | --- |
| 7 | Licence | Apache-2.0, as added in this PR | Permissive with a patent grant, and compatible with every dependency (see below). |
| 8 | Copyright holder in NOTICE | Queen City Cortex LLC, as written | The design specs and the GitHub organisation both name the LLC. Change it to the owner's name if the code is personally owned. |
| 9 | Publish the golden dataset (`packages/pipeline/data/golden/`) | Publish it under the repository's Apache-2.0, after removing the personal note in decision 3 as dataset version 3.7 | It is the project's most reusable asset for anyone evaluating policy agents, and its review history (key review 3.3, the CHANGELOG) shows the method. Removing a note changes the dataset, so it needs the normal version bump. |
| 10 | Contact address in SECURITY.md and CODE_OF_CONDUCT.md | Keep `legal@queencitycortex.com` as the fallback, or replace it with a dedicated address | It is the address the product's legal pages already publish; a public repository needs a monitored one. |
| 11 | Response commitment in SECURITY.md (acknowledgement within seven days) | Keep it only if the owner will meet it | A promise in a security policy is read as a commitment. |
| 12 | Terms and privacy pages still render "Draft: pending attorney review" | Leave the banner | It is true. The pages describe a service with no users; removing the banner without review would be the dishonest option. |
| 13 | Railway project id and production hostnames in RUNBOOK.md and two operations docs | Leave them after decision 5 | They are identifiers, not credentials; access needs a Railway token. Replace them with variables if the deployment stays up. |
| 14 | The ByteRover archive (`docs/archive/byterover/`, 3.8 MB of agent memory) | Keep it | It is primary evidence of how the project was run with agents. Apart from the items in decision 3 it holds no personal information (searched for benefits, income and family references). |
| 15 | CI on a public repository: the Claude review job fails on pull requests from forks (no secret), Blacksmith runners bill fork pull requests to the owner, and a push to `main` deploys to Railway | Require approval for workflows from first-time contributors, and skip the review job on fork pull requests | Without approval, any stranger's pull request runs on paid runners and shows a red check that is not their fault. |
| 16 | The CI badge is not green as of 25 October: the project's own production-audit gate (`npm run audit:production`) now fails on unchanged `main`, with advisories published after the last green run on 12 October in 17 production packages, one critical (`next`) | Merge the pending Dependabot groups (or add dated exceptions in `security/npm-audit-exceptions.json` where no fix exists), and publish only once `main` is green | A red badge on the first screen undoes the README. The gate is doing its job; the fix is dependency updates, which this release PR deliberately does not make. |

## Claims and evidence

The README makes only claims that a command or a committed file backs. Where the brief and the record differ, the README follows the record:

- **"About 6,700 documents."** 6,725 in the serving graph, from the `/corpus-status` response recorded on 2 October 2026. The committed July corpus audit tracks 4,467 documents in the crawler registry; the README uses the graph's own count.
- **"Seven months."** Commits on `main` run from 26 March to 12 October 2026. The README says "between March and October".
- **The evaluation gate killed three bets.** Backed, with nuance: the reranker was removed after a nine-run A/B (PR #71); `voyage-4-large` was a wash against `voyage-law-2` at the same price and was not adopted (June 2026, recorded in the ByteRover archive); `gpt-5.6-luna` lost to `gpt-5.4-mini` as verifier (July 2026, same archive). The two archive notes are the only record of the latter two; a short decision record each would make them first-class.
- **De-contamination.** The held-out paraphrase set's first run scored 2.60 against a contaminated baseline of 2.61 ± 0.12. The 2.60 file is committed; the 2.61 baseline exists only in the message of commit `c9c1073`.
- **Blue-green corpus releases.** The policy and procedure exist and are tested; no blue-green release has happened in production. The README says so.
- **Why a graph.** No decision record compares the graph with alternatives. [Design tradeoffs](../architecture/tradeoffs.md#why-a-graph) says what the code relies on and says the comparison is missing. Recommendation: write decision 0003 before an interview loop that will ask.

## Reproducibility: what happened from a clean clone

Run on Linux with Node 22.22.0, npm 10.9.4 and uv, no API keys, no Docker daemon, and an egress allowlist that blocked huggingface.co and the NC government sites.

| Step | Result |
| --- | --- |
| `npm ci` | Passed in 52 seconds, with an engine warning (the repository pins Node 22.23.3 and npm 11.11.0) |
| `npm test` | **Failed at once**: the pipeline's test script needs `packages/pipeline/.venv`, and turbo stopped every package with it |
| `npx turbo run test --filter='!@nc-medicaid/pipeline'` | Passed: 2,719 tests, 21 skipped, 82 seconds |
| `npm run setup -w @nc-medicaid/pipeline` | `uv sync` passed (5.3 GB environment); the tokenizer download from huggingface.co was blocked here |
| `pytest tests/` in `packages/pipeline` | 1,171 passed, 30 skipped, 2 failed for want of the tokenizer files |
| `npm run build` | Passed in 46 seconds |
| `npm run dev -w @nc-medicaid/web`, then `/preview` | **Failed**: every route returned 500 until three WorkOS variables were set. Fixed for the quickstart with the new `npm run preview:web` script; the gallery then rendered with no errors |
| `npm run test:e2e` (mocked) | Passed: 96 tests in 2.4 minutes |
| The full system (Neo4j, keys, a corpus) | Not run: no Docker daemon, no keys, and the source sites were unreachable. The README marks this path as documented, not tested |

The honest gap for a stranger is the corpus: no snapshot is published, so "fully running" means crawling, parsing for hours and paying for embeddings. Recommendation: publish a small sample graph (one source family, for example the 12 waiver documents) as a Neo4j dump with its release manifest, so an interviewer can ask a real question in under an hour.

## Dependency licences

Production npm dependencies: 569 MIT, 81 Apache-2.0, 26 ISC, 22 BSD-2-Clause, 14 BSD-3-Clause and a handful of other permissive licences. Python: MIT, BSD and Apache-2.0 throughout, including Docling. All are compatible with Apache-2.0. Items worth knowing:

- **Mastra Enterprise code (issue #430).** `@mastra/core` is labelled Apache-2.0 but ships code under the Mastra Enterprise licence in `dist/auth/ee`, which the WorkOS auth provider imports. It does not affect this repository's licence, because dependencies are not redistributed, but anyone running the agent in production should read Mastra's `ee/LICENSE`. Recommendation: keep #430 open; the README's full-run section mentions it.
- **sharp's libvips binaries** are LGPL-3.0-or-later, used as a dynamically linked optional dependency of Next.js. No action.
- **`@sentry/cli`** is FSL-1.1-MIT (source-available, becomes MIT after two years), used only to upload source maps at build time. No action.
- **NVIDIA CUDA wheels** arrive with PyTorch on Linux under NVIDIA's licences. No action unless pipeline Docker images are published.
- **Development-only** MPL-2.0 (axe-core, lightningcss) and CC-BY-4.0 data (caniuse-lite). No action.

## Issue consolidation proposal

184 issues are open (not 197): 165 from the October review (label `review-2026-10`) and 19 others.

**Keep as individual issues (19 non-review issues plus 7 review issues):** the verifier benchmark work (#592 to #598, #600, #601), the qualification and source epics (#187, #188), the dependency migration epics (#144, #145, #147, #148, #149, #161, #162), the Node 26 move (#525), the two credential issues (#216, #218, to be closed by decision 1), open sign-up (#244), and the release blockers (#259, #554, #573, #578).

**Group the other 158 review issues under 14 area epics** using GitHub sub-issues, one epic per `area:` label, each linking its write-up in [`docs/reviews/2026-10-05-full-review/issues/`](../reviews/2026-10-05-full-review/issues/):

| Area | Review issues |
| --- | ---: |
| corpus-data | 19 |
| tests | 19 |
| retrieval-frames | 17 |
| release-ops | 16 |
| evaluation-models | 14 |
| security | 12 |
| framework-deps | 12 |
| answer-safety | 11 |
| chat-agent-loop | 10 |
| deep-research | 9 |
| crawler-sources | 9 |
| architecture-docs | 7 |
| web-ux | 6 |
| privacy-product | 4 |

The counts include the seven review issues kept individually above; they would sit under their epic as well.

**Recommendation: sub-issues, not closing.** Attaching issues to an epic is reversible, keeps every issue's "done when" checklist where its future pull request will close it, and leaves the review-to-issues process visible, which is part of what the repository demonstrates. Closing 150 issues with a pointer reads, from outside, as hiding a backlog. If the owner prefers fewer open issues, close only the review items labelled both `severity:low` and `effort:S` as "not planned" with a pointer to their epic.

## What the release pull request changes

- Revives the unmerged credential scrub from `codex/scrub-committed-secrets` (cherry-picked, authorship kept): redacts the three committed credentials from the working tree and adds the `secret-scan` CI job with `.gitleaks.toml`. History is untouched.
- Adds `LICENSE` (Apache-2.0), `NOTICE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` and issue templates.
- Rewrites `README.md` for the three audiences, with a tested quickstart and a numbers table whose every figure names its source.
- Adds [design tradeoffs](../architecture/tradeoffs.md) and a reading order at the top of the [documentation index](../README.md).
- Moves the March roadmap, the March status updates and the June refactor log to `docs/archive/early-planning/` (since removed, 1 November 2026), date-stamped as historical. Their content is unchanged apart from the personal details removed under decision 3.
- Removes the personal details in decision 3 from the current files, as golden dataset 3.7.
- Adds the `preview:web` script so the component gallery runs with no accounts.
- Records the fresh-clone failures in [project gotchas](../development/gotchas.md).
