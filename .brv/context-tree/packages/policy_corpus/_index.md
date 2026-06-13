---
children_hash: 96a94567093d12cdd1bddc1b0afc065dd75bf406b587646ba3e42487ff3c18f2
compression_ratio: 0.8450889914304548
condensation_order: 1
covers: [frame/_index.md, golden_dataset_de_contamination_and_retrieval_constants.md]
covers_token_total: 1517
summary_level: d1
token_count: 1282
type: summary
---
# Policy Corpus Coverage and Retrieval Constants

This level-1 summary captures two tightly related areas: the coverage-selection pipeline plus strict graph-fixture test helpers, and the canonical golden dataset / retrieval-constants knowledge. Together they describe how policy-corpus coverage is assembled, validated, and kept decontaminated.

## Coverage Selection and Graph Fixtures
Reference **frame/_index.md** for the main pipeline and fixture architecture.

- Coverage assembly is now **positional rather than score-field driven**: `SectionCandidate.score` was removed.
- The five exported stages are:
  1. `scoreCoverageSections`
  2. `collectCoverageSectionGroups`
  3. `buildCoverageInitialSelection`
  4. `buildCoverageAnchors`
  5. `assembleCoverageSections`
- The flow is:
  - surface candidate sections
  - score and group by coverage flags
  - build the initial selection
  - assemble anchors
  - merge primary, supporting, and avoid sections
- Scoring still uses multiple signals, including `focusScore`, `clusterScore`, `requirementScore`, and query-specific bonuses/penalties.
- Notable heuristics include:
  - HCWD income premium scoring with a current-document bonus for policy number `MA-2180`
  - penalties for amendments, administrative forms, year-specific premiums, and HCWD process titles
  - grouping for general eligibility, coverage scope, and congregate PCS
  - telehealth prioritization and demotion rules
  - anchor-based reshaping for not-covered and yes/no coverage queries
  - supporting-selection rebalance when certain anchors are present
- Avoid sections include demoted telehealth tables/context, ambulance general exclusions, congregate workflow sections, and general-eligibility administrative or limitation sections.

### Collector and Federal Authority
Also covered in **frame/_index.md**.

- The collector uses a documented **5-stage merge pipeline**.
- The federal collector currently scans `federal regulation` and `federal statute` together.
- This combined scan is a known rough edge because it can hide per-`docType` coverage gaps and may silently drop one side in stubs.

### Graph Fixtures and Test Helpers
Also covered in **frame/_index.md**.

- `packages/policy-corpus/tests/helpers/graph-fixtures.ts` centralizes strict Neo4j test helpers.
- Strict records throw on missing field access instead of returning `undefined`.
- `expectAllHandlersUsed()` is required to flush dead handlers.
- Unexpected extra scripted queries throw unless `allowExtraQueries` is explicitly set.
- `createCorpus` provides match-based handlers.
- `createCorpusWithRuns` consumes scripted runs in order.

#### Centralized Builders and Matchers
The fixture layer standardizes construction and matching:

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

### Design Direction
- The coverage frame layer now uses:
  - `packages/policy-corpus/src/frame/coverage/candidates.ts`
  - `packages/policy-corpus/src/frame/coverage/selection.ts`
  - `packages/policy-corpus/src/frame/federal-authority.ts`
- The overall direction is toward explicit, strict, and inspectable coverage assembly rather than implicit scoring state.

## Golden Dataset De-contamination and Retrieval Constants
Reference **golden_dataset_de_contamination_and_retrieval_constants.md** for the canonical merged entry.

- This entry is the canonical consolidation of the main markdown plus its abstract and overview variants.
- It preserves the full durable content while merging repeated summary wording.

### Preserved de-contamination decisions
- Replace HCWD limit-history terms with **HCWD income-rule terms**.
- Remove the `01-14` change-notice bonus from HCWD history retrieval.
- Remove the hardcoded `5.4.3` prior-auth quantity-detection heuristic.
- Preserve `WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS` as legitimate HCBS domain knowledge.

### Retrieval flow and ranking
- Retrieval follows:
  - query intent
  - candidate scoring
  - vector overscan
  - topical filtering
  - group-specific ranking
- Neo4j `queryNodes(k)` returns a global top-k, so per-group coverage requires overscanning first and then filtering.

### Canonical constants
The merged entry explicitly retains these constants:

- `VECTOR_OVERSCAN_FACTOR = 8`
- `VECTOR_OVERSCAN_MAX = 200`
- `MAX_CONTENT_CHARS = 6000`
- `MAX_COMBINED_CHARS = 6000`
- `FRAME_PRIMARY_LIMIT = 4`
- `FRAME_SUPPORT_LIMIT = 4`
- `FRAME_AVOID_LIMIT = 3`
- `FRAME_DOCUMENT_LIMIT = 3`

## Drill-down map
- **frame/_index.md**: coverage-selection pipeline, collector behavior, strict Neo4j fixtures, builders, and matchers
- **golden_dataset_de_contamination_and_retrieval_constants.md**: de-contamination rules, retrieval flow, Neo4j overscan rationale, and canonical constants