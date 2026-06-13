---
children_hash: c3f34f7d5a9de1c94c9441f17d16eaa3c6da79ae5079e531aa5ed4fc38596d98
compression_ratio: 0.6157354618015963
condensation_order: 2
covers: [policy_corpus/_index.md, retrieval-quality-depends-on-decontamination-plus-staged-ranking.md]
covers_token_total: 1754
summary_level: d2
token_count: 1080
type: summary
---
# Policy Corpus Retrieval, Coverage, and Decontamination

This d2 summary links the policy-corpus coverage pipeline, strict graph-fixture testing, and canonical retrieval constants. The shared theme is a correctness-first retrieval stack: collect broadly, overscan, filter, then rank, while keeping the corpus decontaminated from memorized or hardcoded heuristics.

## Coverage Selection and Graph Fixtures
Drill down into **frame/_index.md** for pipeline details and fixture architecture.

- Coverage assembly is now **positional rather than score-field driven**; `SectionCandidate.score` was removed.
- The exported coverage stages are:
  1. `scoreCoverageSections`
  2. `collectCoverageSectionGroups`
  3. `buildCoverageInitialSelection`
  4. `buildCoverageAnchors`
  5. `assembleCoverageSections`
- Flow: surface candidates → score/group by coverage flags → build initial selection → assemble anchors → merge primary, supporting, and avoid sections.
- Scoring still combines `focusScore`, `clusterScore`, `requirementScore`, plus query-specific bonuses and penalties.
- Key heuristics include:
  - HCWD income premium scoring with a current-document bonus for policy number `MA-2180`
  - penalties for amendments, administrative forms, year-specific premiums, and HCWD process titles
  - grouping for general eligibility, coverage scope, and congregate PCS
  - telehealth prioritization and demotion rules
  - anchor-based reshaping for not-covered and yes/no coverage queries
  - supporting-selection rebalance when anchors are present
- Avoid sections include demoted telehealth tables/context, ambulance general exclusions, congregate workflow sections, and general-eligibility administrative or limitation sections.
- The collector uses a documented **5-stage merge pipeline**.
- The federal collector scans `federal regulation` and `federal statute` together, which can hide per-`docType` coverage gaps.
- Strict test helpers live in `packages/policy-corpus/tests/helpers/graph-fixtures.ts`:
  - strict records throw on missing field access
  - `expectAllHandlersUsed()` flushes dead handlers
  - extra scripted queries fail unless `allowExtraQueries` is set
  - `createCorpus` supports match-based handlers
  - `createCorpusWithRuns` consumes scripted runs in order
- Centralized builders and matchers include:
  - `sectionHit`
  - `sectionRecord`
  - `documentRecord`
  - `amendmentRecord`
  - `containerChildrenRecord`
  - `contextEntryRecord`
  - `referenceRecord`
  - `queries.*` matchers for vector, fulltext, concept, document, amendment, and section hydration
- `documentGraphHandlers` hydrates `lookupPolicy`, `getSection`, and `getDocument` for one document, with generated handlers marked optional.
- Current design direction favors explicit, strict, inspectable coverage assembly over implicit scoring state.

## Golden Dataset De-contamination and Retrieval Constants
Drill down into **golden_dataset_de_contamination_and_retrieval_constants.md** for the canonical merged entry.

- This entry consolidates the main markdown plus its abstract and overview variants.
- It preserves durable content while removing repetition.

### De-contamination decisions
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
- Neo4j `queryNodes(k)` returns a global top-k, so per-group coverage requires overscanning before filtering.

### Canonical constants
- `VECTOR_OVERSCAN_FACTOR = 8`
- `VECTOR_OVERSCAN_MAX = 200`
- `MAX_CONTENT_CHARS = 6000`
- `MAX_COMBINED_CHARS = 6000`
- `FRAME_PRIMARY_LIMIT = 4`
- `FRAME_SUPPORT_LIMIT = 4`
- `FRAME_AVOID_LIMIT = 3`
- `FRAME_DOCUMENT_LIMIT = 3`

## Related Retrieval Principle
The broader synthesis in **retrieval-quality-depends-on-decontamination-plus-staged-ranking.md** ties this policy-corpus work to agent retrieval architecture: both rely on staged collection, overscan, deduplication, filtering, and ranking instead of trusting a single top-k pass.