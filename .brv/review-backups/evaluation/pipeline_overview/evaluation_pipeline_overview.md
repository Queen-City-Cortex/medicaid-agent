---
title: Evaluation Pipeline Overview
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-03T05:51:39.740Z'
updatedAt: '2026-04-03T05:51:39.740Z'
---
## Raw Concept
**Task:**
Document the Level 2 and Level 3 evaluation flow for question answering and reference resolution.

**Changes:**
- Answer evaluation now marks judge errors with None scores instead of zeros and continues to exclude them from aggregates.
- Cross-reference validation now inspects DOCUMENT and section-level relationships so resolved counts moved from 0/5 to 2/5.
- Remaining q-004, q-009, and q-020 failures highlight missing reference extraction coverage.

**Files:**
- packages/pipeline/src/pipeline/eval/levels/answer.py
- packages/pipeline/src/pipeline/eval/levels/cross_ref.py

**Flow:**
golden entries -> agent invocation -> Neo4j evidence fetch -> judge scoring -> per-entry metrics plus cross-ref checks -> aggregate updates

**Timestamp:** 2026-04-03

## Narrative
### Structure
Evaluation code lives under pipeline/src/pipeline/eval/levels with separate modules for answer scoring and cross-reference verification, each iterating over dataset entries and returning structured metrics.

### Dependencies
Answer evaluation depends on HTTPX, subprocess for CLI fallbacks, Neo4j sessions, and judge_answer scoring; cross-ref checks rely on REFERENCES_DOCUMENT, AMENDS, HAS_SECTION, and REFERENCES edges in Neo4j.

### Highlights
Documenting both modules in one topic clarifies how agent invocation errors are categorized, how evidence retrieval is shared, and why judge errors omit aggregate scoring.

### Rules
Rule 1: Agent invocations time out after 180 seconds and raise if the CLI exits with a non-zero code; Rule 2: Missing document IDs in cross-reference entries count as missed without querying the graph.
