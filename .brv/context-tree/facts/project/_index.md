---
children_hash: 4778c9af5f3ed8ce0208f1836ec16c59cd79cfa7e52239cd0d0fe3f47b2a7476
compression_ratio: 0.3965120105297795
condensation_order: 1
covers: [context.md, curated_context_snippet.abstract.md, curated_context_snippet.overview.md, dependency_upgrade_migration_fixes.md, policy_corpus_coverage_scoring.md]
covers_token_total: 3039
summary_level: d1
token_count: 1205
type: summary
---
# Project Knowledge Summary

## Scope
This level captures the project’s curation rules and two concrete policy-corpus knowledge areas:
- **curated context preservation and workflow**
- **coverage-section scoring behavior**
- **dependency-upgrade migration fixes**

## Core Project Curation Model
Referenced by **context.md** and **curated_context_snippet.overview.md**.

### Main structural rules
- Use **UPSERT-first** curation into the ByteRover context tree.
- Organize knowledge as **domain → topic → subtopic**.
- Preserve the **two-part context model**:
  - `rawConcept` for task, changes/files/flow, timestamps, patterns
  - `narrative` for structure, dependencies, highlights, rules, examples
- Keep durable facts in the **facts domain** when they do not belong to a specific topic.
- Verify curation by checking `result.summary.failed === 0` and applied file paths.

### Required preservation behaviors
- Retain exact **rule text**, **regex patterns**, and **timestamps**.
- Extract and store factual statements explicitly.
- Preserve temporal information and absolute dates when possible.
- Avoid vague context entries; each entry should be specific and structurally useful.

### Drill-down entries
- **context.md** — top-level operational guidance for durable knowledge curation.
- **curated_context_snippet.abstract.md** — concise statement of the same curation rules.
- **curated_context_snippet.overview.md** — fuller workflow and preservation requirements.

## Policy Corpus Coverage Scoring
Referenced by **policy_corpus_coverage_scoring.md**.

### Purpose
Documents how coverage sections are scored and ranked for policy corpus retrieval.

### Scoring flow
- Input: section list
- Process: `scoreCoverageSections`
- Output: ranking by `primaryScore` and `supportScore`
- Adjustments: weighted phrase matching plus flag-gated bonuses and penalties

### Structural behavior
- The scorer builds text from `combineText(section.title, section.content)`.
- It applies shared text normalization and term matching helpers.
- Tests are organized into:
  - structural invariants
  - exact-score anchors
  - property/behavior tests

### Key numeric decisions
- Empty section: **0 / 0**
- Numbered section bonus: **+0.5** to both scores
- Attachment title penalty: **-3** to both scores
- Limitation bonus: **+3** to `supportScore` only
- MA-2180 bonus: **+1.5** to `primaryScore` only
- Phrase matches use **PHRASE_MATCH_WEIGHT = 1.8**
- LOW_SIGNAL terms are scaled by **0.35**

### Flag-gated behaviors
- Telehealth bonuses and avoid-term penalties depend on `telehealthQuery`
- Certification bonuses depend on the relevant flag
- HCWD behavior is also flag-sensitive

### Test design
- Uses **real shared helpers and term lists**
- No mocks
- Ensures deterministic output and one result per input section

### Drill-down entry
- **policy_corpus_coverage_scoring.md** — detailed scoring formula, anchors, and test coverage

## Dependency Upgrade Migration Fixes
Referenced by **dependency_upgrade_migration_fixes.md**.

### Main migration outcomes
- Added `expect.extend(matchers)` for **Vitest 4** runtime matcher registration.
- Added explicit Node types in `packages/policy-corpus/tsconfig.json`.
- Switched Mastra route/middleware typing to **`ContextWithMastra`**.
- Pinned `@types/node` to **^22** for the Node 22 runtime.
- Deferred major upgrades for **eslint 10** and **zod 4** due to compatibility and memory constraints.

### Compatibility issues addressed
- Vitest 4 no longer auto-registers jest-dom matchers at runtime.
- TypeScript 6 no longer auto-includes Node globals in nested package resolution.
- `@mastra/core` 1.45 requires server-specific context typing.
- `eslint 10` remains blocked by peer dependency constraints.
- `zod 4` remains blocked by agent TS build memory usage and graph unification issues.

### Drill-down entry
- **dependency_upgrade_migration_fixes.md** — concrete fixes, blockers, and file references

## Notable entity names and paths
- `rawConcept`, `narrative`, `changes`, `files`, `flow`
- `UPSERT`
- `scoreCoverageSections`
- `combineText`, `normalizeSearchText`, `scoreTermMatches`
- `PHRASE_MATCH_WEIGHT = 1.8`, `LOW_SIGNAL = 0.35`
- `ContextWithMastra`
- `expect.extend(matchers)`
- `packages/policy-corpus/tests/frame/coverage-sections/scoring.test.ts`
- `packages/policy-corpus/src/frame/coverage-sections/selection/scoring.ts`
- `packages/web/tests/setup.ts`
- `packages/policy-corpus/tsconfig.json`

## Relationship summary
- The **project curation guidance** defines how durable knowledge should be structured and verified.
- The **coverage scoring** entry is an example of a tightly specified, test-backed project behavior note.
- The **dependency upgrade fixes** entry records compatibility work and clearly separates resolved issues from deferred blockers.