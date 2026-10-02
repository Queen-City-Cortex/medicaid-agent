# Cleanup execution — 2026-10-02

The original 13 PRs have explicit dispositions. Published feature history was refreshed with normal merge commits. No production corpus promotion was performed. The private recovery directory retains the original Git refs and pending-work snapshots; do not publish it because some saved untracked files contain credentials.

## Landed replacements

| Replacement | Result | Superseded proposals |
| --- | --- | --- |
| [#141](https://github.com/Queen-City-Cortex/medicaid-agent/pull/141) | Git documentation replaces unavailable BRV; obsolete branches archived and removed | Original cleanup draft |
| [#142](https://github.com/Queen-City-Cortex/medicaid-agent/pull/142) | SHA-pinned actions, full stacked CI and explicit Dependabot review policy | #88–#91 closed |
| [#143](https://github.com/Queen-City-Cortex/medicaid-agent/pull/143) | Focused security updates and enforced production audit | #129 closed; remaining migrations tracked |
| [#152](https://github.com/Queen-City-Cortex/medicaid-agent/pull/152) | Repo, CI and all three images aligned on Node 22.23.3 with npm 11.11.0 | #139/#140 and generated #146/#150/#151 closed |
| [#160](https://github.com/Queen-City-Cortex/medicaid-agent/pull/160) | Aligned Vitest/coverage 4.1.10, jest-dom 7 + DOM peer, Tailwind/PostCSS 4.3.3 | #95–#97 closed |

Each replacement requires full tests/builds, mocked browser checks, production Docker builds and completed review on its exact published head. Local development verification additionally ran all owning coverage suites and test typechecks. Security audit changed from 1 critical / 11 high / 8 moderate / 11 low to 0 critical / 0 high / 0 moderate / 11 low. The remaining low findings are not represented as a vulnerability-free result. Expired audit exceptions were removed.

## Retained drafts and acceptance gates

- [#113](https://github.com/Queen-City-Cortex/medicaid-agent/pull/113): refreshed to main, preserving current cache-integrity/audit/graph/picture-text fixes. Local pipeline **646 passed, 4 skipped**, plus Ruff and Vulture; fresh full GitHub technical CI and both reviews pass on `1c44542`. Trusted digital PDFs require v7 reparse rather than blessing pre-v7 output. The known mixed-document and 310-page runtime failures remain blockers.
- [#114](https://github.com/Queen-City-Cortex/medicaid-agent/pull/114): refreshed onto updated #113, preserving its pinned OCR runtime, immutable evaluator boundaries and descriptor provenance. Default Ruff/Vulture pass after adding only tested public APIs to the source-only whitelist. The refreshed Docker base required a newer Debian snapshot while preserving exact OCR hashes. Full OCR execution needs Linux `/proc/self/fd`, so fresh Linux CI is authoritative for that suite.
- [#161](https://github.com/Queen-City-Cortex/medicaid-agent/issues/161): bounded runtime, raster completeness, entire benchmark/object/document gates, independent fresh attempts, durable receipts and final-revision CI. Historical receipts cited under `/tmp` are absent; cleanup did not remove them. Unit tests and reviews do not clear these production-adoption gates.

## Deferred maintenance

| Follow-up | Acceptance scope |
| --- | --- |
| [#144](https://github.com/Queen-City-Cortex/medicaid-agent/issues/144) | TypeScript 7 with supported lint/framework tooling, all workspaces and browser builds; #101 closed |
| [#145](https://github.com/Queen-City-Cortex/medicaid-agent/issues/145) | Coordinated AI SDK/Mastra core, memory, storage, CLI and web client; verify release gate and recovery |
| [#147](https://github.com/Queen-City-Cortex/medicaid-agent/issues/147) | Zod 4 schema/tool contracts and runtime payloads |
| [#148](https://github.com/Queen-City-Cortex/medicaid-agent/issues/148) | SQLite/native ABI and persistence on pinned runtime and images |
| [#149](https://github.com/Queen-City-Cortex/medicaid-agent/issues/149) | Remaining compatible runtime/development updates in cohesive reviewed groups |
| [#162](https://github.com/Queen-City-Cortex/medicaid-agent/issues/162) | Vitest 5/coverage, jsdom 30 and DOM peer migrations |

Dependabot generated five further proposals during execution. #155–#157 were closed with #162 acceptance gates; #158/#159 were closed with #149/#145 links. These are deliberate deferrals, not claims that every current upstream release has been adopted. Coupled SDK and test-runner updates now have dedicated groups; their major migrations remain explicit work.

## Preservation

The original repository bundle retains 97 audited refs. The pending-draft bundle retains snapshot `37853ad`; saved worktree manifests verified 648 files and two symlinks. Regenerable dependency/build caches were excluded. New refresh and maintenance commits are retained in the completion bundle before removing preparation branches/worktrees. No claim is made that missing historical `/tmp` qualification artifacts were recovered.
