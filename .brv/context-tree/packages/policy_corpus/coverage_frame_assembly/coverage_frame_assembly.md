---
title: Coverage Frame Assembly
summary: Coverage frame assembly now uses setting-preferred routing documents as authoritative candidates and fallback variant reasoning.
tags: []
related: [packages/policy_corpus/coverage_routing.md, packages/policy_corpus/document_selection.md]
keywords: []
createdAt: '2026-06-12T20:47:58.210Z'
updatedAt: '2026-06-12T20:47:58.210Z'
---
## Reason
Document how coverage frames combine authoritative documents with setting preference and variant reasoning.

## Raw Concept
**Task:**
Assemble the final coverage answer frame from routing documents and evidence candidates.

**Changes:**
- Coverage frames use selectSettingPreferredDocuments to scope preferredRoutingDocuments when no sibling variant frame takes precedence.
- Authoritative candidates include the scoped routing documents with a policy-number lookup reason.
- variantReasoning falls back to the setting preference reason when no variant frame exists.

**Files:**
- packages/policy-corpus/src/frame/pipelines/coverage.ts
- packages/policy-corpus/src/frame/context/routing.ts
- packages/policy-corpus/src/internal/document-selection.ts

**Flow:**
search hits -> route documents -> choose preferred routing documents -> build candidates -> finalize frame

**Timestamp:** 2026-06-12T20:47:11.146Z

## Narrative
### Structure
The coverage pipeline merges base hits, HCWD history hits, routed documents, and section candidates into primary, supporting, and avoid evidence sets.

### Dependencies
Depends on route selection, wildcard widening policy, sibling policy variant detection, and document-scoped preference logic.

### Highlights
The pipeline now preserves setting-specific routing even when non-sibling documents would otherwise dominate raw scores.

### Rules
The variant frame takes precedence for sibling sets; otherwise settingPreference.documents become preferredRoutingDocuments.
