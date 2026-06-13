---
title: Coverage Routing
summary: Coverage routing now applies setting-scoped document preference before inferred narrowing and uses it as fallback variant reasoning.
tags: []
related: [packages/policy_corpus/document_selection.md, packages/policy_corpus/coverage_frame_assembly.md]
keywords: []
createdAt: '2026-06-12T20:47:58.209Z'
updatedAt: '2026-06-12T20:47:58.209Z'
---
## Reason
Document the coverage routing behavior and where setting preference is applied.

## Raw Concept
**Task:**
Route coverage questions to the correct policy documents.

**Changes:**
- collectCoverageRoutingDocuments now applies selectSettingPreferredDocuments before narrowInferredCoverageDocuments for inferred documents.
- The routing layer returns only setting-matching documents when the query names a care setting and matches document titles.
- The setting preference reason is propagated into variantReasoning when no sibling policy variant frame exists.

**Files:**
- packages/policy-corpus/src/frame/context/routing.ts
- packages/policy-corpus/src/internal/document-selection.ts

**Flow:**
lookup documents -> infer documents from hits -> apply setting preference -> narrow -> return routing documents

**Timestamp:** 2026-06-12T20:47:11.146Z

## Narrative
### Structure
Coverage routing first tries exact lookup documents, then inferred documents from search hits, and finally narrows with HCWD and setting-specific preference logic.

### Dependencies
Depends on collectPolicyDocumentsFromHits, narrowHcwdCoverageDocuments, narrowInferredCoverageDocuments, and the new selectSettingPreferredDocuments helper.

### Highlights
The fix blocks CAP/DA or other distractors from replacing the congregate PCS document on adult-care-home questions.

### Rules
Setting preference must run BEFORE narrowing: narrowInferredCoverageDocuments keeps only the raw-score winner for non-sibling sets.
