---
title: Retrieval Quality Depends on Decontamination Plus Staged Ranking
summary: Retrieval quality relies on decontamination, topical coverage, and staged ranking with vector overscan, per-group filtering, and RRF-based merge ordering.
tags: []
related: [packages/policy_corpus/frame/coverage_selection_and_graph_fixtures.md, packages/policy_corpus/golden_dataset_de_contamination_and_retrieval_constants.md]
keywords: []
createdAt: '2026-06-12T17:28:02.891Z'
updatedAt: '2026-06-12T17:28:02.891Z'
consolidated_at: '2026-06-13T05:58:26.711Z'
consolidated_from: [{date: '2026-06-13T05:58:26.711Z', path: packages/retrieval_quality/retrieval_quality_depends_on_decontamination_plus_staged_ranking.abstract.md, reason: 'These three files are the same knowledge item at different abstraction levels: the main markdown file already contains the full structured content, while the abstract and overview restate the same retrieval-quality design, flow, dependencies, rules, and facts. They are redundant and should be consolidated into one canonical file while preserving the unique details from the summary variants.'}, {date: '2026-06-13T05:58:26.711Z', path: packages/retrieval_quality/retrieval_quality_depends_on_decontamination_plus_staged_ranking.overview.md, reason: 'These three files are the same knowledge item at different abstraction levels: the main markdown file already contains the full structured content, while the abstract and overview restate the same retrieval-quality design, flow, dependencies, rules, and facts. They are redundant and should be consolidated into one canonical file while preserving the unique details from the summary variants.'}]
---
## Reason
Curate the provided retrieval-quality context into durable knowledge.

## Raw Concept
**Task:**
Document the retrieval-quality design that couples decontamination with staged ranking and overscanned candidate selection.

**Changes:**
- Preserved hybrid policy search ordering after deduplication by sectionId.
- Captured the section-vector backend pattern and collector-side ranking flow.
- Recorded decontamination rules for HCWD and HCBS retrieval heuristics.

**Files:**
- packages/policy-corpus/src/retrieval/backends/section-vector.ts
- packages/policy-corpus/src/retrieval/collector.ts

**Flow:**
query intent -> candidate scoring -> vector overscan -> topical filtering -> group-specific ranking -> RRF merge

**Timestamp:** 2026-06-12T17:27:46.229Z

**Patterns:**
- `^vectorScanK\(profile\.perGroupK\)$` - Overscans each group using per-group K
- `^queryNodes\(k\)$` - Neo4j global top-k retrieval primitive

## Narrative
### Structure
This knowledge centers on retrieval quality: the backend overscans vector candidates per type group, the collector filters and reranks them, and final ordering uses reciprocal rank fusion after sectionId deduplication. It also captures decontamination rules that remove misleading heuristic terms while preserving legitimate domain terms.

### Dependencies
Depends on Neo4j behavior that queryNodes(k) returns a global top-k and therefore cannot satisfy group-specific coverage without overscanning first. The retrieval flow also depends on topical filtering and staged ranking to avoid contamination from irrelevant heuristics.

### Highlights
Local retrieval files mention hybrid policy search, section-vector backend behavior, collector ranking, HCWD decontamination, HCBS heuristic cleanup, and the rationale for vector overscan. As of 2026-06-12, the documented retrieval strategy emphasizes broad candidate coverage before filtering and reranking.

### Rules
Replace HCWD limit-history terms with topical HCWD income-rule terms and remove the 01-14 change-notice bonus from HCWD history retrieval. Keep WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS as legitimate HCBS domain knowledge, but remove hardcoded section-number heuristics like 5.4.3 from prior-auth quantity detection.

### Examples
Example flow: iterate profile.typeGroups, overscan with vectorScanK(profile.perGroupK), filter by document_type, then merge hits by sectionId and rerank with reciprocal rank fusion.

## Facts
- **hybrid_policy_search_ranking**: Hybrid policy search ranks by reciprocal rank fusion after deduping hits by sectionId. [project]
- **per_group_vector_search**: Per-group vector search is used when no type filters are present. [project]
- **section_vector_backend_pattern**: Section-vector backend pattern iterates profile.typeGroups, overscans each group with vectorScanK(profile.perGroupK), then filters by document_type. [project]
- **retrieval_flow_pattern**: Retrieval flow pattern is query intent -> candidate scoring -> vector overscan -> topical filtering -> group-specific ranking. [project]
- **hcwd_retrieval_decontamination**: Replace HCWD limit-history terms with topical HCWD income-rule terms and remove the 01-14 change-notice bonus from HCWD history retrieval. [project]
- **hcbs_decontamination**: Keep WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS as legitimate HCBS domain knowledge, but remove hardcoded section-number heuristics like 5.4.3 from prior-auth quantity detection. [project]
- **neo4j_vector_overscan**: Use vector overscan because Neo4j queryNodes(k) returns global top-k and cannot pre-filter by group. [project]
- **retrieval_backend_files**: Retrieval/backend files referenced are packages/policy-corpus/src/retrieval/backends/section-vector.ts and packages/policy-corpus/src/retrieval/collector.ts. [project]

## Consolidated notes from summary files
- Retrieval quality is framed as depending on three main ideas: decontamination, topical coverage, and staged ranking with overscanned candidates.
- The core retrieval flow is: query intent -> candidate scoring -> vector overscan -> topical filtering -> group-specific ranking -> RRF merge.
- The backend pattern iterates `profile.typeGroups`, overscans each group with `vectorScanK(profile.perGroupK)`, and then filters by `document_type`.
- Final ranking uses reciprocal rank fusion (RRF) after deduplicating hits by `sectionId`, preserving hybrid policy search ordering.
- A major dependency is Neo4j behavior: `queryNodes(k)` returns a global top-k, so group coverage requires overscanning before filtering.
- Decontamination rules are domain-specific: for HCWD, replace limit-history terms with income-rule terms and remove the 01-14 change-notice bonus; for HCBS, preserve `WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS` but remove hardcoded heuristics like `5.4.3`.
- Notable entities and files include `packages/policy-corpus/src/retrieval/backends/section-vector.ts` and `packages/policy-corpus/src/retrieval/collector.ts`, along with the patterns `^vectorScanK\(profile\.perGroupK\)$` and `^queryNodes\(k\)$`.
- The document’s sections cover reason, raw concept, narrative (structure, dependencies, highlights, rules, examples), and a facts list summarizing the retrieval design decisions.