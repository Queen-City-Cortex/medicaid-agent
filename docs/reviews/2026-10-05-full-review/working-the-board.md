# Goal: work through the October 2026 review board

This is the standing prompt for an agent session that works the review cards. Hand it to a fresh session as its goal.

Work the open cards on the review board for Queen-City-Cortex/medicaid-agent until
every card in the phases "This week" and "Before first customer" is merged, closed,
or explicitly parked with a reason. Then stop and report. Do not start "Later" or
"Parked" cards.

## What exists

- Each card is a GitHub issue labelled `review-2026-10`, titled `[ID] action`
  (for example `[SAFE-2] Order verifier evidence so cited section text is never dropped`).
  The body has the problem, the fix, a "Done when" checklist, where to start, and
  what the evidence does and does not establish.
- Board: https://github.com/orgs/Queen-City-Cortex/projects/1 with fields Phase,
  Severity, Effort, Area and Status.
- The full review is in `docs/reviews/2026-10-05-full-review/`. `issues/<area>.md`
  has every write-up and `findings/<area>.md` the evidence. `issue-index.md` maps
  ids to issue numbers. Read a card's findings before changing code when the fix is
  terse.
- Owner decisions are recorded as comments on the cards. Read the comments, not
  just the body.

## What to work on, in order

1. Phase "This week", then "Before first customer". Within a phase: high severity
   first, then cards that unblock others, then small ones.
2. Skip, and list in your report:
   - cards labelled `needs-decision` that have no decision comment. Collect their
     questions and ask the owner in one batch, with your recommendation for each;
   - #216 and #218 (credential rotation; the owner has deferred them);
   - any card whose "Blocked by" issue is still open. Do the blocker first if it
     is in scope.
3. Cards labelled `needs-corpus-release` can be coded and merged, but say in the
   pull request that the change has no effect in production until a corpus release
   completes. The release path does not work yet; OPS-2, OPS-3, OPS-7 and OPS-9 are
   the cards that fix it, so give them priority within their phase.

## How to parallelise

The account hit its usage limit during the review, and the GitHub API allowance is
5,000 requests an hour shared across everything. Stay well inside both.

- Run at most 4 lanes at once, each in its own git worktree under `.worktrees/`,
  branched from current `main`. One lane is one card, or two or three cards that
  touch the same files and are best reviewed together.
- Plan lanes by file overlap, not by area label. Before starting a batch, list the
  files each candidate card will touch (the card's "Where" line and the fix text)
  and never run two lanes that edit the same file. These files are contended and
  must be serialised: `packages/agent/src/index.ts`, `prompt.ts`, `answer-release.ts`,
  `chat-route.ts`, `processors/verifier/*`, `packages/policy-corpus/src/internal/query-intent.ts`,
  `term-lists.ts`, `packages/pipeline/src/pipeline/graph/loader.py`,
  `release.py`, `scripts/ops/corpus-release.sh`, `RUNBOOK.md`.
- Good parallel splits are across packages: one lane each in agent, web,
  policy-corpus, pipeline or crawler, and ops scripts.
- After a pull request merges, rebase the remaining lanes on `main` before they
  open theirs. Remove a worktree once its branch is merged.
- If you delegate lanes to sub-agents, give each the card number, the worktree
  path, the verification commands below and the standing rules. Review each diff
  yourself before opening the pull request; do not merge work you have not read.

## For each card

1. Branch from `main` (`fix/<id>-<slug>`, or `docs/`, `test/`, `ops/` as fits).
   Never commit to `main`.
2. Make the smallest change that satisfies the "Done when" list. Add the
   regression test the card names. The project is greenfield with no users, so
   prefer deleting machinery to adding it and do not keep compatibility shims.
3. Verify before pushing, on Node 22 (the system Node is 26 and breaks
   `better-sqlite3`): `export PATH=/Users/jkh/.hermes/node/bin:$PATH`. Run tests
   with API keys blanked so nothing reaches a provider:
   `OPENAI_API_KEY= VOYAGE_API_KEY= ANTHROPIC_API_KEY= NEO4J_URI=bolt://127.0.0.1:1`.
   - agent: `npx vitest run`, `npm run build`, `npm run typecheck:tests`
     (passing tests alone does not prove the types compile)
   - policy-corpus, crawler, contracts: tests and build
   - web: `npx vitest run`, `npx tsc --noEmit`, lint; relevant mocked e2e for
     changed user flows
   - pipeline: from `packages/pipeline`, `uv run --extra dev python -m pytest tests/`
     and `npm run lint -w @nc-medicaid/pipeline`
   - parser changes need a `PARSE_CACHE_VERSION` bump; read
     `docs/development/gotchas.md` before touching parser, retrieval, deployment
     or verification code
4. Open a pull request with `Closes #<n>` for each card it finishes. Describe the
   problem, the change, the tests, and anything left out.
5. Wait for CI and both review bots. Fix real findings. Where a bot is wrong or
   the point is a deliberate trade-off, reply on the comment with the reason and
   leave the code. If two bot findings contradict each other, choose the safer
   behaviour and say so.
6. Squash-merge when checks are green and bot threads are answered. Confirm the
   issue closed. Merging to `main` deploys to Railway, so do not merge anything
   you would not want live.
7. If a card turns out to be wrong, already fixed, or not worth doing, close it
   with a comment that says why. If it is bigger than the card says, split it and
   say so on the card.

## Standing rules

- Do not raise the verifier's 30-second deadline, its two-pass ceiling, or add
  verifier retries (issue #188). The one exception the owner approved: if report
  verification still cannot fit after #238's measurement, raise it in #188 for
  reports only.
- No request-time reranker. No inference provider outside OpenAI, Anthropic, Groq
  or Cerebras for text that may contain user input. ESLint 10 and Zod 4 in the
  agent stay deferred. `@types/node` stays on ^22.
- Observational memory is being turned off (#249). Do not build on it.
- No paid model calls, no `pipeline eval`, no embedding runs, nothing under
  `scripts/ops` executed, no `railway` commands, no production smoke tests, no
  writes to the local Neo4j graph and no integration tests against it. If a card
  cannot be finished without one of these, do everything else, then stop and ask.
- Never print or commit a credential value. Never write the string that triggers
  the repository's Claude workflow (an at-sign followed by "claude") in an issue,
  comment or pull request.
- Anything that changes production settings, credentials, Railway, WorkOS, the
  GitHub organisation or the owner's machine is the owner's to do. Write the exact
  steps on the card and move on.

## Reporting

Keep the board honest as you go: set a card's Status to "In Progress" when a lane
starts. After each batch of merges, post a short status: cards merged (with pull
request numbers), cards skipped and why, decisions needed, and what the next batch
is. If you hit the usage limit or the GitHub rate limit, wait for the reset instead
of retrying, and resume from the board, which is the source of truth for what is
done.

Stop when both phases are finished or blocked, and give a final report: merged,
closed without change, blocked on the owner, and blocked on a corpus release.
