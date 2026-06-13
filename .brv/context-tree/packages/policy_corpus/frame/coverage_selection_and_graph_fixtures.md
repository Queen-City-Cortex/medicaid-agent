---
title: Coverage Selection and Graph Fixtures
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-12T07:14:58.711Z'
updatedAt: '2026-06-12T07:14:58.711Z'
---
## Raw Concept
**Task:**
Document the policy-corpus coverage frame selection pipeline and graph fixture test helpers.

**Changes:**
- Frame layer now uses coverage/candidates.ts, coverage/selection.ts, and federal-authority.ts.
- SectionCandidate.score was removed and selection is positional.
- Collector follows a documented 5-stage merge pipeline.
- Policy-corpus tests use shared strict Neo4j graph fixtures and handler stubs.

**Files:**
- packages/policy-corpus/src/frame/coverage/candidates.ts
- packages/policy-corpus/src/frame/coverage/selection.ts
- packages/policy-corpus/src/frame/federal-authority.ts
- packages/policy-corpus/tests/helpers/graph-fixtures.ts

**Flow:**
surface candidate sections -> score and group by coverage flags -> build initial selection -> assemble anchors -> merge primary/supporting/avoid sections

**Timestamp:** 2026-06-12

## Narrative
### Structure
Coverage selection is split into five exported stages: scoring, grouping, initial selection, anchors, and final assembly. The graph-fixtures helper centralizes strict record builders, query matchers, and corpus/session stubs.

### Dependencies
Relies on shared constants and helpers from internal/shared.js, plus Neo4j session stubs for policy corpus tests.

### Highlights
Selection is positional rather than score-field driven. The federal collector currently scans federal regulation and federal statute together, which can hide per-docType test coverage gaps. Test fixtures fail loudly on missing fields and unexpected queries.

### Rules
Strict records prevent silent undefined access in tests. `expectAllHandlersUsed()` must be used to flush dead handlers. Unexpected extra scripted queries throw unless explicitly allowed.

## Facts
- **frame_layer_files**: The frame layer uses coverage/candidates.ts, coverage/selection.ts, and federal-authority.ts. [project]
- **section_candidate_scoring**: SectionCandidate.score was removed and selection is positional. [project]
- **collector_pipeline**: Collector is a documented 5-stage merge pipeline. [project]
- **coverage_selection_exports**: Coverage selection exports scoreCoverageSections, collectCoverageSectionGroups, buildCoverageInitialSelection, buildCoverageAnchors, and assembleCoverageSections. [project]
- **coverage_scoring_signals**: Selection scoring uses focusScore, clusterScore, requirementScore, and query-specific bonuses and penalties. [project]
- **hcwd_scoring**: HCWD income premium scoring gives a current-document bonus for policy number MA-2180 and penalizes amendments, administrative forms, year-specific premiums, and HCWD process titles. [project]
- **general_eligibility_grouping**: General eligibility grouping targets section numbers 2.1.1, 3.1, and 3.2.1 plus specific general-provisions language. [project]
- **coverage_scope_grouping**: Coverage scope grouping targets section numbers 1.0 and 2.1.1 plus scope and description language. [project]
- **congregate_pcs_grouping**: Congregate PCS grouping targets criteria, service, room-and-board, workflow, and general limitation sections. [project]
- **initial_primary_selection**: Initial primary selection prefers HCWD current sections first, then preferred primary sections, then all non-limitation sections. [project]
- **telehealth_selection**: Telehealth queries prioritize telehealth primary sections and demote telehealth tables and avoid-term sections unless the query is a telehealth service list query. [project]
- **coverage_anchor_selection**: Not-covered and yes/no coverage queries use limitation anchors and coverage scope anchors to reshape primary selection. [project]
- **supporting_rebalance**: Supporting selection may merge initial primary into supporting when telehealth anchors, limitation anchors, or not-covered anchors are present. [project]
- **avoid_sections**: Avoid sections include demoted telehealth tables, telehealth context, ambulance general exclusions, congregate workflow sections, and general eligibility administrative or limitation sections. [project]
- **strict_records**: Strict records in graph-fixtures throw on missing field access instead of returning undefined. [project]
- **create_corpus**: createCorpus provides match-based handlers and expectAllHandlersUsed to flush dead handlers. [project]
- **create_corpus_with_runs**: createCorpusWithRuns consumes scripted runs in order and throws on unexpected extra queries unless allowExtraQueries is set. [project]
- **typed_record_builders**: sectionHit, sectionRecord, documentRecord, amendmentRecord, containerChildrenRecord, contextEntryRecord, and referenceRecord are centralized typed record builders. [project]
- **query_matchers**: queries.* centralizes matchers for vector, fulltext, concept, document, amendment, and section hydration queries. [project]
- **document_graph_handlers**: documentGraphHandlers hydrates lookupPolicy, getSection, and getDocument for one document and marks generated handlers optional. [project]
- **federal_collector_rough_edge**: Known rough edge: the federal collector issues one combined federal_regulation plus federal_statute scan, so per-docType test stubs may silently drop one side. [project]
