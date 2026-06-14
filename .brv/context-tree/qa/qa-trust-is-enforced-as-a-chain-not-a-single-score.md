---
confidence: 0.92
sources: [qa/_index.md, evaluation/_index.md, qa/_index.md]
synthesized_at: '2026-06-14T19:24:47.072Z'
type: synthesis
title: QA trust is enforced as a chain, not a single score
summary: Evidence retrieval, verifier rewrite, and evaluation scoring are all part of the same trust pipeline.
tags: [qa, evaluation, citations, trust]
related: []
keywords: [hallucination, verifier, grounding, evidence, scoring, rewrite, citation, pipeline]
createdAt: '2026-06-14T19:24:47.072Z'
updatedAt: '2026-06-14T19:24:47.072Z'
---

# QA trust is enforced as a chain, not a single score

Across qa and evaluation, trustworthiness is treated as an end-to-end chain: retrieve the correct evidence, verify or rewrite the answer against that evidence, then score only grounded outputs; breaking any link weakens the whole system.

## Evidence

- **qa**: The hallucination verifier is final-answer only, uses tool-scoped evidence gathering, and applies `correctedAnswer` immediately via `writer.custom` when verification fails.
- **evaluation**: Level 3 answer evaluation fetches Neo4j evidence, runs `judge_answer`, and Level 2 cross-reference evaluation checks `REFERENCES_DOCUMENT`, `AMENDS`, and section-level `REFERENCES`.
- **qa**: End-to-end citation fidelity is enforced from retrieval to evaluation, including section-level evidence and amendment links through retrieval, verification, and scoring.
