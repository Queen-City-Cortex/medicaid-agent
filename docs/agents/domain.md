# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: the project glossary.
- **`docs/decisions/`**: the decision records (ADRs). Read the ones that touch the area you're about to work in. The [index](../decisions/README.md) lists them with status.

If `CONTEXT.md` doesn't exist yet, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates it lazily when terms or decisions actually get resolved.

## File structure

This is a single-context repo. The npm workspaces under `packages/` are layers of one pipeline over one domain (NC Medicaid policy answering), not separate bounded contexts, so there is one glossary and one decision log.

```
/
├── CONTEXT.md                 ← glossary (created lazily)
├── docs/decisions/            ← ADRs, numbered 0001-… with a README index
└── packages/
```

Where a skill or template says `docs/adr/`, use `docs/decisions/` here. Follow the existing record format: problem, decision, alternatives, consequences, and a row in the index. Mark a superseded record and link its replacement.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing decision record, surface it explicitly rather than silently overriding:

> _Contradicts decision 0001 (knowledge in Git), but worth reopening because…_
