---
title: Repo-wide Refactoring Audit
tags: []
related: [architecture/refactoring_audit/repo_wide_refactoring_audit.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-06T02:03:10.384Z'
updatedAt: '2026-07-06T02:03:10.384Z'
---
## Raw Concept
**Task:**
Document a repo-wide refactoring audit covering duplicate builders, latent bugs, dead code, and test infrastructure gaps.

**Changes:**
- Identified repeated rules-as-code builder patterns in policy-corpus and agent processors
- Identified duplicate crawler discover flows and divergent local path normalization
- Identified write-boundary bypass risk, dead code, and missing fixture builders

**Files:**
- packages/policy-corpus/src/frame/coverage-sections/candidates.ts
- packages/agent/src/processors/answer-frame-planning.ts
- packages/pipeline/src/pipeline/audit.py
- packages/pipeline/src/pipeline/graph/corpus_writer.py

**Flow:**
audit -> identify repeated builders -> identify latent bugs -> identify dead code -> identify test gaps -> recommend extraction and unification

**Timestamp:** 2026-07-05

**Author:** Repo-wide refactoring audit

## Narrative
### Structure
The audit groups findings into dominant pattern, latent bugs, dead code, test infrastructure gaps, and file notes. It emphasizes a rules-as-data transformation for repeated builder logic, then calls out path normalization drift and graph write-boundary bypasses.

### Dependencies
The policy-corpus candidate builder should preserve concatenation order and uniqueBy first-wins behavior. The answer-frame planner should use canonical types from policy-corpus/src/types.ts instead of local copies. The pipeline audit and graph writer need consistent local path handling and write-boundary usage.

### Highlights
The audit highlights three recurring refactor targets: declarative profile tables, shared helper extraction for crawler flows, and canonical type reuse. It also flags dead code, missing conftest-style fixtures, and a stray .venv artifact.

### Examples
Examples include buildCoverageDocumentCandidateProfiles, buildCoveragePrimaryProfiles, buildCoverageSupportingProfiles, and buildCoverageQueryFlags on the policy-corpus side; buildCoverageChecklist and buildPriorAuthChecklist on the agent side; and duplicated discover() implementations in crawler modules.

## Facts
- **refactoring_theme**: Rules-as-code should become rules-as-data. [project]
- **policy_corpus_coverage_profiles**: policy-corpus has 20 near-identical coverage profile builders, with 18 reduced to a single makeSectionProfile call behind a gate. [project]
- **agent_checklist_builders**: agent answer-frame-planning has 6 parallel buildXxxChecklist functions that can be table-driven. [project]
- **crawler_discover_duplicates**: crawler has byte-identical discover() bodies across clinical-policies.ts, nctracks.ts, and dhhs-policies.ts. [project]
- **normalize_local_path_variants**: Pipeline has 3 divergent _normalize_local_path implementations. [project]
- **corpus_graph_writer_boundary**: CorpusGraphWriter is the single write-side boundary for corpus graph mutations. [project]
- **mark_document_status_callers**: mark_document_status is whitelisted but has zero callers. [project]
- **stray_venv**: The repository audit notes a stray untracked 13MB venv at packages/crawler/packages/pipeline/.venv. [project]
