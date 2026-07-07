---
children_hash: 8e8402a1e3fbea6c53df967dcf0bcbdda24df2266c8074e106d8d85f49ce34d9
compression_ratio: 0.3082010582010582
condensation_order: 1
covers: [context.md, curated_context_snippet.abstract.md, curated_context_snippet.overview.md, dependency_upgrade_migration_fixes.md, environment_parsing_helpers_and_verifier_toggle.md, policy_corpus_coverage_scoring.md]
covers_token_total: 3780
summary_level: d1
token_count: 1165
type: summary
---
## Project Curation and Knowledge Preservation

This level captures operational guidance for turning source material into durable context-tree knowledge, along with several concrete project facts and implementation notes. The central pattern is **UPSERT-first curation** into the ByteRover context tree, using a structured `rawConcept` + `narrative` model and verifying applied results after each update.

### Core curation workflow
- `context.md` and `curated_context_snippet.*` define the project-wide curation discipline:
  - recon → extract facts/context → curate with UPSERT → verify applied files
  - preserve exact rule text, regex patterns, timestamps, and file references
  - keep knowledge organized as `domain / topic / subtopic`
  - require at least a task plus one operational detail and one descriptive narrative field
- Key fields and concepts to drill into:
  - `rawConcept`, `narrative`, `changes`, `files`, `flow`
  - standalone `facts` domains for uncategorized facts
  - verification via `result.summary.failed` and `result.applied`

### Environment parsing and verifier toggles
- `environment_parsing_helpers_and_verifier_toggle.md` documents consolidation of agent env handling in `packages/agent/src/env.ts`.
- Important decisions:
  - shared helpers: `strEnv`, `intEnv`, `boolEnv`, `isVerifierEnabled`
  - env values are read at call time to preserve timing semantics
  - `boolEnv` only treats `'1'` and `'true'` as true
  - `isVerifierEnabled()` is intentionally different: verifier stays enabled unless `VERIFIER_ENABLED === 'false'`
  - `intEnv` rejects malformed integers with `Number.isFinite`
- Related config defaults:
  - policy corpus rerank: enabled by default, `gpt-5-mini`, `1500` ms timeout, `20` candidates, debug off
  - Voyage defaults: `voyage-4` model and `https://api.voyageai.com/v1/embeddings`
- Outcome note: `215` agent tests pass after consolidation.

### Dependency upgrade migration fixes
- `dependency_upgrade_migration_fixes.md` records the 2026-06-23 upgrade-pass compatibility fixes.
- Key fixes:
  - add `expect.extend(matchers)` for Vitest 4 runtime matcher registration
  - add explicit `types: ['node']` in `packages/policy-corpus/tsconfig.json`
  - switch Mastra handlers to `ContextWithMastra` from `@mastra/core/server`
  - pin `@types/node` to `^22`
- Deferred blockers:
  - `eslint 10` blocked by `eslint-config-next` / `eslint-plugin-react` peer caps
  - `zod 4` blocked by `tsc -p tsconfig.tests.json` memory limits and graph unification issues
- Drill-down entry names: `dependency_upgrade_migration_fixes.md`, plus related `facts/project/context.md` and `agent_architecture/context/mastra_upgrade_type_and_runtime_boundaries.md`.

### Policy corpus coverage scoring
- `policy_corpus_coverage_scoring.md` documents the scoring behavior for coverage-section ranking in `packages/policy-corpus`.
- Architecture:
  - scorer: `scoreCoverageSections` in `packages/policy-corpus/src/frame/coverage-sections/selection/scoring.ts`
  - tests: `packages/policy-corpus/tests/frame/coverage-sections/scoring.test.ts`
  - imports use the direct `selection/scoring.js` path, not the `selection.ts` barrel
- Scoring model:
  - build text from `combineText(section.title, section.content)`
  - use shared text helpers and internal term lists
  - compute primary/support scores with weighted phrase matching plus bonuses/penalties
- Anchored behaviors:
  - empty section → `0/0`
  - attachment titles → `-3` on both axes
  - numbered sections → `+0.5` to both
  - limitation text → `+3` support only
  - MA-2180 under `hcwdIncomePremiumQuery` → `+1.5` primary only
  - focus-term hit example anchors at `2.16 / 1.08`
- Flag-gated paths include telehealth, certification, and HCWD-specific scoring behavior.
- The suite is contamination-free: it uses real helpers and term lists with no mocks.

### Structural patterns across these entries
- Most notes share the same durable-knowledge shape:
  - **Raw Concept**: task, changes, files, flow, timestamp
  - **Narrative**: structure, dependencies, highlights, rules, examples
  - **Facts**: concrete recall items with stable names and values
- The project emphasizes:
  - preserving exact technical constraints
  - keeping runtime/type boundaries explicit
  - using tests to lock down behavior with real implementation paths
  - documenting defaults, blockers, and flag-gated logic as first-class knowledge

### Drill-down entry map
- `context.md`
- `curated_context_snippet.abstract.md`
- `curated_context_snippet.overview.md`
- `dependency_upgrade_migration_fixes.md`
- `environment_parsing_helpers_and_verifier_toggle.md`
- `policy_corpus_coverage_scoring.md`