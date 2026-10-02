# Repository audit — 2026-10-02

This is a dated cleanup record, not a live branch dashboard. The audit fetched origin and inspected all local branches, remote branches, PR states and exact head commits, seven worktrees, pending changes, and ignored local artifacts. Current main was `dc81a973b032107830523596c8dac46efaaf12da` (PR #138).

## Result

- Updated local main and started `codex/repository-cleanup` from it.
- Removed 30 obsolete local feature branches and six auxiliary worktrees after verified backups.
- Removed 41 remote branches whose exact tips matched merged PR heads. Atomic deletion used per-branch leases, so a changed remote tip would reject the batch.
- Removed the archived, closed PR #70 branch. Its only change selected Groq for an LLM reranker that current main subsequently removed; heuristic retrieval reranking remains.
- Preserved all 13 open PR branches. No parser or dependency PR was merged by cleanup.
- Migrated local project knowledge into Git-backed documentation and an immutable ByteRover archive. Current main's verifier/recovery guidance and operational runbooks take precedence over the older draft docs.
- Preserved the old working-tree implementation in a separate recovery snapshot instead of mixing it into current main. No runtime code or production service was changed by cleanup.

Squash merges explain why many old branches appeared ahead of main. Matching the merged PR head is stronger evidence than treating an ahead/behind count as unfinished work. The detached baseline's single verifier telemetry edit was already present in main.

See the [subsequent PR triage](../reviews/pr-triage-2026-10-02.md) for individual dispositions, CI failure causes, compatibility constraints, and qualification evidence gaps.

## Remaining work

| PR | State at audit | Next step |
| --- | --- | --- |
| [#113](https://github.com/Queen-City-Cortex/medicaid-agent/pull/113) | Single-pass PDF routing; conflicts with current main | Rebase and resolve against the current parser/cache/retirement implementation, then rerun pipeline checks and representative PDF/release evidence |
| [#114](https://github.com/Queen-City-Cortex/medicaid-agent/pull/114) | General chart recovery; based on #113 | Refresh after #113, verify chart/transcript evidence, and run fresh CI |
| #88, #89, #90, #91, #95, #96, #97, #101, #129, #139, #140 | Eleven dependency update PRs | Review compatible updates together where practical; evaluate major toolchain changes separately against the pinned Node/npm and deployment images |

Start future implementation branches from updated main. Old green checks on stacked PRs do not validate them against today's main. Production readiness still depends on current corpus/release evidence, not branch cleanup.

## Preserved unmerged draft

The foundation branch was squash-merged as PR #87, but its dirty working tree contained a later alternative implementation. Of 147 non-archive pending files, 124 differed from main and 23 were new. Do not assume these are all redundant merely because the branch tip was merged.

The recovery snapshot retains generic answer-plan work, alternate account/thread and readiness/privacy APIs, ingestion changes, CI hardening, and proposed operational docs. Review any useful idea as a targeted change against current main. In particular, wholesale restoration would replace newer server answer-release guards, checkpoint recovery, corpus retirement/audit handling, and CI operational checks with older alternatives.

## Local recovery

Private recovery files live in `.local-recovery/cleanup-2026-10-02/`, ignored by Git. The directory is mode 0700; artifact archives are mode 0600. Keep these local: ignored browser authentication state and environment symlinks are included in the worktree artifact inventories. Regenerable dependencies, compiled output, caches, and coverage were excluded.

- `repository.bundle`: verified complete bundle of all 97 pre-cleanup refs, including local/remote branches and checkpoint refs.
- `pending-draft.bundle`: verified complete history of snapshot commit `37853ad07c413e9730374a5849f838fb2c25c497` on `archive/pre-cleanup-2026-10-02`.
- `worktree-0` through `worktree-6`: status, patches, pending file archives, SHA-256 inventories, and ignored non-regenerable artifacts where present. All saved file hashes and symlink targets were checked before worktree removal.
- `branch-audit.json`, PR inventories, `refs.txt`, and `pending-vs-main.json`: detailed decision evidence.

Recover the unmerged draft into a separate worktree, leaving current work intact:

```bash
git fetch .local-recovery/cleanup-2026-10-02/pending-draft.bundle refs/heads/archive/pre-cleanup-2026-10-02:refs/heads/recovery/pre-cleanup
git worktree add .worktrees/pre-cleanup recovery/pre-cleanup
```

Recover a retired branch from `repository.bundle` by fetching its original `refs/heads/...` or `refs/remotes/origin/...` name into a new `refs/heads/recovery/...` ref. Consult `refs.txt` first. Worktree archives also preserve local files that were not in Git. Bundles are local safety copies, not a claim that offsite backups exist.

## Retired branch inventory

`Local` and `Remote` indicate the refs removed. Every merged PR entry matched its recorded head SHA exactly before cleanup; remote deletions used that full SHA as a lease.

| Branch | Tip | Evidence | Removed refs |
| --- | --- | --- | --- |
| `add-claude-github-actions-1782239634432` | `fce87bdb3aeb` | Merged PR #56 | Remote |
| `blacksmith-migration-af1fad7` | `64e51602940a` | Merged PR #5 | Remote |
| `chore/brv-kb-refresh` | `382549718486` | Merged PR #16 | Remote |
| `chore/byterover-artifacts-2026-07-10` | `3deb3e96fbf9` | Merged PR #75 | Remote |
| `chore/refresh-memory-and-graph-artifacts` | `eeb66ef35866` | Merged PR #64 | Remote |
| `codex/add-libgl-corpus-image` | `01ace932cf22` | Merged PR #109 | Local, Remote |
| `codex/corpus-bootstrap` | `bb37a9046865` | Merged PR #134 | Local, Remote |
| `codex/corpus-release-completion` | `6f2ba9e2282f` | Merged PR #136 | Local, Remote |
| `codex/create-release-audit-dir` | `a047eb6ec8b4` | Merged PR #106 | Local, Remote |
| `codex/fix-parse-worker-import` | `0383ee76dfb8` | Merged PR #107 | Local, Remote |
| `codex/isolate-parse-worker-bootstrap` | `782c5ca217fc` | Merged PR #108 | Local, Remote |
| `codex/production-hardening-corpus-identity` | `e14197bef5cd` | Merged PR #100 | Local, Remote |
| `codex/production-hardening-corpus-release` | `44076aa9fca1` | Merged PR #103 | Local, Remote |
| `codex/production-hardening-durable-research` | `3c68135c1dcc` | Merged PR #99 | Local, Remote |
| `codex/production-hardening-execution-gateway` | `ccb09a01428d` | Merged PR #98 | Local, Remote |
| `codex/production-hardening-foundation` | `5a5d2c55355c` | Merged PR #87 | Local, Remote |
| `codex/production-hardening-ingestion` | `9cc3d49d480c` | Merged PR #102 | Local, Remote |
| `codex/production-hardening-staging` | `e3a1d4c6c63e` | Ancestor of main | Local |
| `codex/railway-corpus-bootstrap` | `068d0eccc63e` | Merged PR #104 | Local, Remote |
| `codex/railway-graph-redeploy-wait` | `0802e9d60fb6` | Merged PR #105 | Local, Remote |
| `codex/source-audit-blue-release` | `3e6dbd258b95` | Merged PR #137 | Local, Remote |
| `codex/source-gates-closure` | `35c2e77b059d` | Merged PR #138 | Local, Remote |
| `codex/verification-label` | `22d045520e3a` | Merged PR #135 | Local, Remote |
| `codex/verified-recovery` | `0e198bdd36f8` | Merged PR #133 | Local, Remote |
| `customer-readiness/ws1-legal-surface` | `50e8d351a7c9` | Merged PR #76 | Local, Remote |
| `customer-readiness/ws2-monitoring-health` | `dbe2cb12bdb3` | Merged PR #77 | Local, Remote |
| `customer-readiness/ws3-privacy-retention` | `d79a62c67663` | Merged PR #83 | Local, Remote |
| `customer-readiness/ws4-eval-corpus` | `f117babd5f39` | Merged PR #78 | Local, Remote |
| `customer-readiness/ws5-usage-tracking` | `903415002877` | Merged PR #81 | Local, Remote |
| `customer-readiness/ws6-backups` | `bf525d9b19b3` | Merged PR #79 | Local, Remote |
| `customer-readiness/ws7-refresh-automation` | `6a9c245c1525` | Merged PR #80 | Local, Remote |
| `customer-readiness/ws8-hermetic-e2e` | `f4b46aca66c6` | Merged PR #82 | Local, Remote |
| `eval/gpt-5.6-terra-agent` | `19df9244e9f8` | Merged PR #73 | Remote |
| `feat/groq-reranker-default` | `8de12dc9d3fe` | Closed PR #70; obsolete LLM reranker | Remote |
| `fix/backup-mastra-cli-quoting` | `96e313bdd71e` | Merged PR #85 | Local, Remote |
| `fix/backup-mastra-lock` | `87a5f93c30fe` | Merged PR #86 | Local, Remote |
| `fix/healthz-openai-probe-classification` | `04170186a7fd` | Merged PR #84 | Local, Remote |
| `fix/neo4j-idle-close` | `770a86a5b2d8` | Merged PR #131 | Remote |
| `fix/sentry-dev-skip-and-tracing` | `797e779789d4` | Merged PR #74 | Remote |
| `refactor/checklist-rule-table` | `3bf78a5bff88` | Merged PR #62 | Remote |
| `refactor/crawler-source-factories` | `e7dec6b55bba` | Merged PR #61 | Remote |
| `refactor/policy-corpus-query-analysis` | `135a8dba8296` | Merged PR #8 | Remote |
| `tests/policy-corpus-coverage-and-helpers` | `67a18ec84164` | Merged PR #18 | Remote |

## Verification

Both Git bundles verified, the 464 historical knowledge file hashes matched, active guide links were checked, and `git diff --check` passed for active changes (the immutable archive retains historical whitespace). CI's main-branch trigger and existing runtime/operational gates were preserved; archive exclusions apply only to PR events.

The 16 Node operational-script tests passed. The shell portion of `npm run test:ops` passed its first two checks, then stopped because this macOS machine lacks `flock`; the full Linux operational suite was not validated locally. Cleanup changes documentation and archive handling only, so model, browser, production deployment, and full runtime suites were not run.
