# Working in this repository

Read the [documentation index](docs/README.md), then the guide and source relevant to the task. Project knowledge is maintained in Git; BRV is no longer required. The [ByteRover archive](docs/archive/byterover/README.md) contains historical observations with no authority over current work.

Use the [TypeSafe skill](.agents/skills/typesafe-ai/SKILL.md) when working on this project. Follow its live documentation guidance for relevant AI design and integration work.

## Greenfield project

This project has no users or real customer data yet. Remove unnecessary complexity and tech debt rather than maintaining compatibility for hypothetical users.

## Knowledge maintenance

When something surprises you, tell the developer and update this file or the [project gotchas](docs/development/gotchas.md) so future contributors avoid it. Keep this entry point concise; record detailed lessons in the document that owns the subject. Follow the [knowledge workflow](docs/development/knowledge-workflow.md).

## Essential verification

- Read the relevant [gotchas](docs/development/gotchas.md) before changing parser, retrieval, deployment, or verification behavior.
- Agent schema/API changes require both agent tests and an agent build; passing Vitest alone does not establish type safety.
- Pipeline lint runs Ruff and Vulture. Provision its environment before root checks and run `uv` from `packages/pipeline`.
- Chat answer release is enforced on the server: draft prose stays private until the verifier passes the exact final text. Signed memory guards recall and cloning.
- Research recovery uses private checkpoints, original approved limits, reserved steps, matching corpus/configuration, and at most two recovery claims. Do not publish unchecked drafts.
- Policy-family routing belongs in `PolicyCorpus`, not prompt patches. Validate live evidence identities before interpreting evaluation scores.
- Use isolated observability storage for answer evals, and check repeated full runs before treating a single score as a regression.
- Keep source retirement evidence, availability accounting, and audit artifacts durable. A missing payload or DNS failure is not proof of withdrawal.
- Work from current main for new tasks. Preserve pending files and Git refs before removing old branches or worktrees; see the [repository audit](docs/development/repository-audit-2026-10-02.md).

## Code Review Rules

### Answer release

- Model-written prose must not reach the browser, the history endpoints or stored message rows unless the verifier passed that exact text. This includes observer notes, classifier reasons and raw tool or storage errors.
  Safe path: text reaches the client only through the release gate in `packages/agent/src/answer-release.ts`, which rebuilds each stream chunk from named fields; a new chunk type or field is dropped unless it is added there deliberately.
- Withholding is always acceptable; releasing unverified text never is. Flag any change that turns a failure into a pass, treats missing evidence as support, or lets the verifier judge text it was not shown.

### Verifier bounds

- Do not raise the verifier's 30-second deadline or its two-pass ceiling, and do not add verifier retries (issue #18).
  Exception: a change for deep-research reports only, when it cites the owner's decision in issue #18.

### Inference providers

- Text that may contain user input goes only to OpenAI, Anthropic, Groq or Cerebras. Flag any other inference endpoint, and any new OpenAI call site built outside `packages/agent/src/model.ts`, where provider settings such as response storage are set once.

### Ownership

- Every route that reads or writes a conversation, research run or feedback row takes the user from the verified token, never from the request body or query. Flag a handler that trusts a client-supplied owner or thread id without checking the stored owner.

See the [development guide](docs/development/README.md) for commands and the [operations index](docs/operations/README.md) for release procedures.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on this repo, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `CONTEXT.md`, decision records in `docs/decisions/`. See `docs/agents/domain.md`.
