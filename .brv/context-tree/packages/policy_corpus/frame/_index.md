---
children_hash: bb8e1bfbb782327c5ac5a332ede1849908098871dded48847cfcab51f5d1594c
compression_ratio: 0.7313432835820896
condensation_order: 0
covers: [coverage_selection_and_graph_fixtures.md]
covers_token_total: 1340
summary_level: d0
token_count: 980
type: summary
---
# Coverage Selection and Graph Fixtures

This entry set documents the policy-corpus coverage selection pipeline and the strict Neo4j graph fixture utilities that support it. The core theme is a move from score-field-driven selection to positional assembly, with test infrastructure hardened to fail on missing data and unexpected queries.

## Coverage Selection Pipeline
See **coverage_selection_and_graph_fixtures.md** for the main pipeline details.

- Coverage selection is split into five exported stages:
  1. `scoreCoverageSections`
  2. `collectCoverageSectionGroups`
  3. `buildCoverageInitialSelection`
  4. `buildCoverageAnchors`
  5. `assembleCoverageSections`
- The selection flow is:
  - surface candidate sections
  - score and group by coverage flags
  - build initial selection
  - assemble anchors
  - merge primary, supporting, and avoid sections
- `SectionCandidate.score` was removed; selection is now positional rather than score-field driven.
- Scoring still uses multiple signals, including `focusScore`, `clusterScore`, `requirementScore`, and query-specific bonuses/penalties.
- Known heuristics include:
  - HCWD income premium scoring with a current-document bonus for policy number `MA-2180`
  - penalties for amendments, administrative forms, year-specific premiums, and HCWD process titles
  - grouping logic for general eligibility, coverage scope, and congregate PCS
  - telehealth-specific prioritization and demotion rules
  - anchor-based reshaping for not-covered and yes/no coverage queries
  - supporting selection rebalance when certain anchors are present
- Avoid sections include demoted telehealth tables, telehealth context, ambulance general exclusions, congregate workflow sections, and general eligibility administrative or limitation sections.

## Collector and Federal Authority
Also covered in **coverage_selection_and_graph_fixtures.md**.

- The collector follows a documented 5-stage merge pipeline.
- The federal collector currently scans `federal regulation` and `federal statute` together.
- This combined scan is a known rough edge because it can hide per-`docType` test coverage gaps and may silently drop one side in stubs.

## Graph Fixtures and Test Helpers
See **coverage_selection_and_graph_fixtures.md** for the fixture architecture.

- `packages/policy-corpus/tests/helpers/graph-fixtures.ts` centralizes strict Neo4j test helpers.
- Strict records throw on missing field access instead of returning `undefined`.
- `expectAllHandlersUsed()` is required to flush dead handlers.
- Unexpected extra scripted queries throw unless `allowExtraQueries` is explicitly set.
- `createCorpus` provides match-based handlers.
- `createCorpusWithRuns` consumes scripted runs in order.

### Centralized Builders and Matchers
The fixture layer standardizes test data construction and query matching:

- Typed record builders:
  - `sectionHit`
  - `sectionRecord`
  - `documentRecord`
  - `amendmentRecord`
  - `containerChildrenRecord`
  - `contextEntryRecord`
  - `referenceRecord`
- Query matchers under `queries.*` cover:
  - vector
  - fulltext
  - concept
  - document
  - amendment
  - section hydration
- `documentGraphHandlers` hydrates `lookupPolicy`, `getSection`, and `getDocument` for one document, with generated handlers marked optional.

## Dependencies and Design Notes
- The coverage frame layer now uses:
  - `packages/policy-corpus/src/frame/coverage/candidates.ts`
  - `packages/policy-corpus/src/frame/coverage/selection.ts`
  - `packages/policy-corpus/src/frame/federal-authority.ts`
- The test helpers rely on shared constants and helpers from `internal/shared.js` plus Neo4j session stubs.
- The overall direction is toward explicit, strict, and inspectable coverage assembly rather than implicit scoring state.

## Drill-Down Points
- **coverage_selection_and_graph_fixtures.md**: full pipeline, scoring heuristics, anchor rules, and fixture behavior