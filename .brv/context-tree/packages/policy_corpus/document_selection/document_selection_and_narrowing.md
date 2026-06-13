---
title: Document Selection and Narrowing
summary: Document selection helpers now include setting-preferred routing to protect congregate/in-home policy documents before narrowing.
tags: []
related: [packages/policy_corpus/coverage_routing.md, packages/policy_corpus/coverage_frame_assembly.md]
keywords: []
createdAt: '2026-06-12T20:47:58.206Z'
updatedAt: '2026-06-12T20:47:58.206Z'
---
## Reason
Capture document-level ranking, narrowing, and setting preference logic used by coverage routing.

## Raw Concept
**Task:**
Document-level selection and narrowing for policy corpus retrieval and routing.

**Changes:**
- Added selectSettingPreferredDocuments(queryLower, documents) to scope routing docs by the care setting named in the query.
- Applied setting preference before narrowInferredCoverageDocuments in coverage routing.
- Preserved variantReasoning fallback from the setting preference reason when no sibling variant frame exists.

**Files:**
- packages/policy-corpus/src/internal/document-selection.ts
- packages/policy-corpus/src/frame/context/routing.ts
- packages/policy-corpus/src/frame/pipelines/coverage.ts

**Flow:**
query terms -> document scoring -> optional setting preference -> narrowing -> frame assembly

**Timestamp:** 2026-06-12T20:47:11.146Z

## Narrative
### Structure
The helper module handles document coverage boosts, title expansion selection, variant scoring, HCWD coverage scoring, and narrowing of inferred coverage documents.

### Dependencies
Setting preference depends on VARIANT_SETTING_TERMS, title matching, and existing narrowing logic that otherwise keeps only the raw-score winner for non-sibling sets.

### Highlights
The new selector prevents a non-sibling distractor from outranking the setting-specific document when the query explicitly names congregate or in-home care.

### Rules
Setting preference must run BEFORE narrowing: narrowInferredCoverageDocuments keeps only the raw-score winner for non-sibling sets.
