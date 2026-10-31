# Project documentation

**New to the project?** The [README](../README.md) says what this is in two minutes. Then read, in this order:

1. [Design tradeoffs](architecture/tradeoffs.md): the choices that shape the system, what each one costs and how each gets revisited.
2. [Decision 0002](decisions/0002-verifier-model-family.md): a decision written with its bounds fixed as inputs and its outcome left to a measurement.
3. [The October 2026 project review](reviews/2026-10-05-full-review/README.md): a full review of the system, including everything it found wrong.

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
| Design tradeoffs | [Tradeoffs](architecture/tradeoffs.md) | Why a graph, why the verifier is bounded and same-family for now, why withholding is the safe failure |
| Decisions | [Decision index](decisions/README.md) | Accepted choices and their rationale |
| Historical BRV knowledge | [Archive](archive/byterover/README.md) | Original notes and summaries, preserved without rewriting |

## Search from the repository root

```bash
# Active guides and source
rg -n -i 'verifier|research recovery' AGENTS.md docs/architecture docs/development packages/agent/src

# Historical notes when active docs do not answer the question
rg -n -i 'waiver|fee.schedule' docs/archive/byterover/context-tree
```

[Design specs and plans](superpowers/) and [review findings](reviews/) are historical records. Verify their conclusions against current code before treating them as implemented behavior. The March roadmap, the March status updates and the June refactor log are [archived as historical](archive/early-planning/README.md).

The [2026-10-02 cleanup execution](reviews/cleanup-completion-2026-10-02.md) records merged replacements, preserved work and explicit follow-up gates.

The [October 3 corpus cost audit and usage sample](validation/cost-audit-sample-2026-10-03/README.md) identifies spreadsheet padding and replaces conservative context assumptions with measured diagnostic usage.
The [October 4 spreadsheet corpus repair](validation/spreadsheet-corpus-repair-2026-10-04/README.md) records an unmerged cache-v7 repair candidate, superseded by fee-schedule compaction, with its cell-preservation receipts and full-corpus embedding-input measurements.
The [October 3 qualification cycle](validation/qualification-cycle-2026-10-03/README.md) records ready PR merges, bounded embedding preparation, the deployed model audit and remaining qualification gates.

The [October 4 Jev integration](validation/jev-integration-2026-10-04/README.md) records source-attested checks and preserved diagnostic evidence with runtime adoption disabled.

The [Jev activation readiness assessment](validation/jev-readiness-2026-10-04/README.md) records the safeguards, preserved diagnostic findings and a gated qualification proposal without further inference.
