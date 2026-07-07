---
children_hash: 690d40b2ace98c6509ac96e6c30a16838252e608e1a6f3c451e8d0beb2dd374f
compression_ratio: 0.7427409988385598
condensation_order: 2
covers: [conventions/_index.md, project/_index.md]
covers_token_total: 1722
summary_level: d2
token_count: 1279
type: summary
---
# facts

This level preserves durable curation rules and project-specific operational knowledge. The entries share a consistent knowledge model: **Raw Concept + Narrative + Facts**, organized as `domain / topic / subtopic`, with verification after curation.

## Curation conventions and guardrails
- **`conventions/_index.md`** centers on the recon → extraction → curate → verify workflow for durable knowledge curation.
- Core discipline:
  - **UPSERT-first** curation is the default.
  - Use **single-pass** mode when recon recommends it.
  - Avoid printing raw context.
  - Use **`tools.curation.mapExtract()`** for chunked extraction.
  - Pass **`taskId` as a bare variable**, not a quoted string.
  - Verify using **`result.applied[].filePath`** and **`result.summary.failed`**.
  - Do not rerun recon if it has already been computed.
- Drill down to:
  - **`context.md`** for the broader conventions summary
  - **`curation_workflow_guardrails.md`** for execution constraints and verification rules

## Project curation and durable knowledge patterns
- **`project/_index.md`** captures project-wide curation guidance plus concrete implementation notes.
- The curation model emphasizes:
  - exact rule text, regex patterns, timestamps, and file references
  - `rawConcept` fields such as `task`, `changes`, `files`, `flow`
  - `narrative` fields such as `structure`, `dependencies`, `highlights`, `rules`, `examples`
  - standalone `facts/` domains for uncategorized facts
  - verification via `result.summary.failed` and `result.applied`
- The project-level notes also document:
  - environment parsing helpers and verifier toggles
  - dependency upgrade migration fixes
  - policy corpus coverage scoring
- Drill down to:
  - **`context.md`**
  - **`curated_context_snippet.abstract.md`**
  - **`curated_context_snippet.overview.md`**
  - **`dependency_upgrade_migration_fixes.md`**
  - **`environment_parsing_helpers_and_verifier_toggle.md`**
  - **`policy_corpus_coverage_scoring.md`**

## Environment parsing helpers and verifier toggle
- **`environment_parsing_helpers_and_verifier_toggle.md`** describes consolidation of agent env handling in `packages/agent/src/env.ts`.
- Key helpers and rules:
  - `strEnv`, `intEnv`, `boolEnv`, `isVerifierEnabled`
  - env values are read at call time to preserve timing semantics
  - `boolEnv` treats only `'1'` and `'true'` as true
  - `isVerifierEnabled()` remains enabled unless `VERIFIER_ENABLED === 'false'`
  - `intEnv` rejects malformed integers with `Number.isFinite`
- Related defaults:
  - policy corpus rerank: enabled by default, `gpt-5-mini`, `1500` ms timeout, `20` candidates, debug off
  - Voyage defaults: `voyage-4` and `https://api.voyageai.com/v1/embeddings`
- Outcome note: **215 agent tests pass** after consolidation.

## Dependency upgrade migration fixes
- **`dependency_upgrade_migration_fixes.md`** records compatibility fixes from the 2026-06-23 upgrade pass.
- Main changes:
  - add `expect.extend(matchers)` for Vitest 4 runtime matcher registration
  - add explicit `types: ['node']` in `packages/policy-corpus/tsconfig.json`
  - switch Mastra handlers to `ContextWithMastra` from `@mastra/core/server`
  - pin `@types/node` to `^22`
- Deferred blockers:
  - `eslint 10` blocked by `eslint-config-next` and `eslint-plugin-react` peer caps
  - `zod 4` blocked by `tsc -p tsconfig.tests.json` memory limits and graph unification issues
- Related drill-down:
  - `facts/project/context.md`
  - `agent_architecture/context/mastra_upgrade_type_and_runtime_boundaries.md`

## Policy corpus coverage scoring
- **`policy_corpus_coverage_scoring.md`** documents ranking behavior for coverage sections in `packages/policy-corpus`.
- Architecture:
  - scorer: `scoreCoverageSections` in `packages/policy-corpus/src/frame/coverage-sections/selection/scoring.ts`
  - tests: `packages/policy-corpus/tests/frame/coverage-sections/scoring.test.ts`
  - imports use `selection/scoring.js` directly, not the `selection.ts` barrel
- Scoring model:
  - build text with `combineText(section.title, section.content)`
  - use shared text helpers and internal term lists
  - compute primary/support scores with weighted phrase matching plus bonuses and penalties
- Anchored behaviors:
  - empty section → `0/0`
  - attachment titles → `-3` on both axes
  - numbered sections → `+0.5` to both
  - limitation text → `+3` support only
  - MA-2180 under `hcwdIncomePremiumQuery` → `+1.5` primary only
  - focus-term hit example anchors at `2.16 / 1.08`
- Flag-gated behavior includes telehealth, certification, and HCWD-specific scoring paths.
- The suite is contamination-free and uses real helpers and term lists with no mocks.

## Shared structural pattern across entries
- These entries consistently preserve:
  - **Raw Concept**: task, changes, files, flow, timestamp
  - **Narrative**: structure, dependencies, highlights, rules, examples
  - **Facts**: concrete recall items with stable names and values
- The broader pattern is to capture exact technical constraints, runtime/type boundaries, defaults, blockers, and flag-gated logic as durable knowledge.