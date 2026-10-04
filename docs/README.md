# Project documentation

This is the entry point for repository knowledge. Read the guide for your task, then inspect its linked source. These documents describe the current working tree; their presence does not establish that pending changes have shipped or passed release gates.

| Topic | Start here | What it covers |
| --- | --- | --- |
| Contributor and agent workflow | [AGENTS.md](../AGENTS.md) | Context gathering, maintenance, and essential verification rules |
| Architecture | [Architecture guide](architecture/README.md) | Package boundaries, answer verification, and research recovery |
| Development | [Development guide](development/README.md) | Setup, package checks, and evaluation |
| Jev experiments | [Jev guide](development/jev.md) | Opt-in classifiers, human review, annotation identity and bounded validation |
| Known failures | [Project gotchas](development/gotchas.md) | Recorded parser, retrieval, runtime, and deployment lessons |
| Knowledge maintenance | [Knowledge workflow](development/knowledge-workflow.md) | Local search, evidence, and updates in Git |
| Operations | [Operations index](operations/README.md) | Runbooks, release gates, and operational scripts |
| Decisions | [Decision index](decisions/README.md) | Accepted choices and their rationale |
| Historical BRV knowledge | [Archive](archive/byterover/README.md) | Original notes and summaries, preserved without rewriting |

## Search from the repository root

```bash
# Active guides and source
rg -n -i 'verifier|research recovery' AGENTS.md docs/architecture docs/development packages/agent/src

# Historical notes when active docs do not answer the question
rg -n -i 'waiver|fee.schedule' docs/archive/byterover/context-tree
```

[Design specs and plans](superpowers/) and [review findings](reviews/) are historical records. Verify their conclusions against current code before treating them as implemented behavior. The [roadmap](roadmap.md) records planned work.

The [2026-10-02 cleanup execution](reviews/cleanup-completion-2026-10-02.md) records merged replacements, preserved work and explicit follow-up gates.

The [October 3 corpus cost audit and usage sample](validation/cost-audit-sample-2026-10-03/README.md) identifies spreadsheet padding and replaces conservative context assumptions with measured diagnostic usage.
The [October 3 qualification cycle](validation/qualification-cycle-2026-10-03/README.md) records ready PR merges, bounded embedding preparation, the deployed model audit and remaining qualification gates.
