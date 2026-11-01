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

The [October 2026 review](reviews/2026-10-05-full-review/README.md) is a historical record. Verify its conclusions against current code before treating them as implemented behavior. Earlier design specs, plans, reviews and status updates were removed from this repository on 1 November 2026; they remain in the archived private repository.

Dated evidence from validation runs, cost audits and qualification cycles is under [validation/](validation/). Each folder's README says what was checked and what it does not establish.

## Issue and commit numbers in older documents

The repository was republished with a cleaned history on 31 October 2026. Commit ids changed, and open issues were renumbered when they moved. Issue, pull request and commit references in dated records (reviews, validation reports, plans and the archive) written before then point at the private archived repository, not at this one. The guides linked in the table above use current numbers.
