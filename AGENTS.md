# Working in this repository

Read the [documentation index](docs/README.md), then the guide and source relevant to the task. Project knowledge is maintained in Git; BRV is no longer required. The [ByteRover archive](docs/archive/byterover/README.md) contains historical observations with no authority over current work.

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

See the [development guide](docs/development/README.md) for commands and the [operations index](docs/operations/README.md) for release procedures.
