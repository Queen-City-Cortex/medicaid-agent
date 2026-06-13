---
title: Cross-Reference Resolution Evaluation
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-03T05:51:24.401Z'
updatedAt: '2026-04-03T05:51:24.401Z'
consolidated_at: '2026-06-12T03:04:49.648Z'
consolidated_from: [{date: '2026-06-12T03:04:49.648Z', path: evaluation/cross_reference_resolution/context.md, reason: These files describe the same Level 2 cross-reference resolution evaluation topic; the evaluation file contains the detailed facts and the context file is a concise summary. They should be consolidated into one canonical topic file.}]
---
## Raw Concept
**Task:**
Document the Level 2 cross-reference evaluation pipeline that inspects Neo4j relationships.

**Changes:**
- Level 2 evaluation now validates document-level REFERENCES_DOCUMENT/AMENDS relationships before falling back to section-level REFERENCES paths.
- Tracking cross-ref success moved from 0/5 to 2/5 by ensuring both document and section reference checks are covered.
- Flagged remaining failures (q-004, q-009, q-020) as needing reference extraction pipeline improvements.

**Files:**
- packages/pipeline/src/pipeline/eval/levels/cross_ref.py

**Flow:**
entries with cross_refs -> iterate through refs -> check document-level graph edges -> fallback to section-level REFERENCES path -> tally resolved/missed counts

**Timestamp:** 2026-04-03

## Narrative
### Structure
Cross-ref evaluation lives in pipeline/src/pipeline/eval/levels/cross_ref.py and iterates each golden entry to verify Neo4j relationships.

### Dependencies
Requires Neo4j sessions and the Document/Section schema with REFERENCES_DOCUMENT, AMENDS, HAS_SECTION, and REFERENCES edges.

### Highlights
Improvements raised resolved references from 0/5 to 2/5, but q-004, q-009, and q-020 still point to missing reference extraction coverage.

### Rules
Loop: if either document id is missing skip and count as missed; otherwise run graph queries for document and section-level edges.

## Facts
- **cross_ref_detection**: Cross-reference evaluation checks both DOCUMENT-level REFERENCES_DOCUMENT or AMENDS edges and section-level REFERENCES paths. [project]
- **cross_ref_metrics**: Precision and recall are computed as resolved_count divided by total cross_refs (0 if total is zero). [project]
- **cross_ref_counts**: False resolutions and extraction misses remain zero because the evaluation only counts resolved vs missed matches. [project]

# Topic: cross_reference_resolution

## Overview
Documents the Level 2 process that checks whether golden cross-references exist in the Neo4j graph before aggregating resolution metrics.

## Key Concepts
- REFERENCES_DOCUMENT/AMENDS relationships
- section-level REFERENCES fallback
- precision/recall computation