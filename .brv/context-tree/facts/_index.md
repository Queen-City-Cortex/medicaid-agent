---
children_hash: 1d4d00852b5ac93180e8e7853a6350b65407d3c8fe2b29b91019b0ca60f155df
compression_ratio: 0.7398513436249285
condensation_order: 2
covers: [conventions/_index.md, project/_index.md]
covers_token_total: 1749
summary_level: d2
token_count: 1294
type: summary
---
# d2 Structural Summary

## Scope
This level captures two related knowledge clusters:
- **`facts/conventions`** — durable curation guardrails and workflow discipline for the context tree.
- **`project`** — project-specific curation rules plus concrete implementation/compatibility knowledge.

## Shared curation model
Both entries reinforce the ByteRover knowledge model:
- **UPSERT-first** curation into the **domain → topic → subtopic** hierarchy.
- Preserve the two-part context model:
  - **`rawConcept`** for task, changes/files/flow, timestamps, patterns
  - **`narrative`** for structure, dependencies, highlights, rules, examples
- Keep durable standalone facts in the **facts** domain when they do not belong to a specific topic.
- Verify curation by checking **`result.summary.failed === 0`** and the applied file paths.

## `facts/conventions`
This entry is the operational guardrail layer for durable knowledge curation.

### Core workflow
- Standard sequence: **recon → extraction → curate → verify**
- Prefer **single-pass** mode when recon indicates it.
- Use **`tools.curation.mapExtract()`** for chunked extraction only when needed.

### Preserved rules
- Do **not print raw context** during curation.
- Do **not** re-run **`tools.curation.recon()`** if recon is already available.
- Use **`result.applied[].filePath`** for verification rather than rereading files.
- Pass **`taskId`** as a bare variable, not a quoted string.

### Drill-down
- **`context.md`** — broader conventions summary
- **`curation_workflow_guardrails.md`** — exact execution constraints and verification rules

## `project`
This entry contains project-level curation guidance and two concrete knowledge areas.

### Project curation rules
- Preserve exact **rule text**, **regex patterns**, and **timestamps**.
- Extract factual statements explicitly.
- Preserve temporal markers and resolve relative dates when possible.
- Avoid vague entries; each context must be structurally useful and specific.

### 1) `policy_corpus_coverage_scoring.md`
Documents how coverage sections are scored and ranked for retrieval.

#### Scoring model
- Input: section list
- Process: **`scoreCoverageSections`**
- Output ranking by **`primaryScore`** and **`supportScore`**
- Uses weighted phrase matching plus flag-gated bonuses and penalties.

#### Key behavior
- Builds text with **`combineText(section.title, section.content)`**
- Relies on shared normalization and term matching helpers
- Tests cover:
  - structural invariants
  - exact-score anchors
  - property/behavior cases

#### Important numeric decisions
- Empty section: **0 / 0**
- Numbered section bonus: **+0.5** to both scores
- Attachment title penalty: **-3** to both scores
- Limitation bonus: **+3** to `supportScore`
- MA-2180 bonus: **+1.5** to `primaryScore`
- **`PHRASE_MATCH_WEIGHT = 1.8`**
- **`LOW_SIGNAL = 0.35`**

#### Flag-sensitive behavior
- Telehealth bonuses and avoid-term penalties depend on **`telehealthQuery`**
- Certification bonuses depend on the relevant flag
- HCWD behavior is also flag-sensitive

#### Drill-down
- **`policy_corpus_coverage_scoring.md`** — formula, anchors, and tests

### 2) `dependency_upgrade_migration_fixes.md`
Records compatibility fixes and deferred blockers from dependency upgrades.

#### Main outcomes
- Added **`expect.extend(matchers)`** for Vitest 4 runtime matcher registration.
- Added explicit Node types in **`packages/policy-corpus/tsconfig.json`**.
- Switched Mastra route/middleware typing to **`ContextWithMastra`**.
- Pinned **`@types/node`** to **`^22`** for Node 22 runtime.
- Deferred **eslint 10** and **zod 4** due to compatibility and memory constraints.

#### Compatibility issues
- Vitest 4 no longer auto-registers jest-dom matchers at runtime.
- TypeScript 6 no longer auto-includes Node globals in nested package resolution.
- `@mastra/core` 1.45 requires server-specific context typing.
- `eslint 10` is blocked by peer dependency constraints.
- `zod 4` is blocked by agent TS build memory usage and graph unification issues.

#### Drill-down
- **`dependency_upgrade_migration_fixes.md`** — fixes, blockers, and file references

## Key entity names and paths
- `rawConcept`, `narrative`, `changes`, `files`, `flow`
- `UPSERT`
- `recon → extraction → curate → verify`
- `tools.curation.mapExtract()`
- `result.applied[].filePath`
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
- **`facts/conventions`** defines the durable curation workflow and verification guardrails.
- **`project`** applies those rules to concrete project knowledge: one entry for retrieval scoring behavior and one for dependency-migration fixes.
- Together they show the pattern of preserving both **process discipline** and **implementation-specific facts** in structured, drill-down-ready form.