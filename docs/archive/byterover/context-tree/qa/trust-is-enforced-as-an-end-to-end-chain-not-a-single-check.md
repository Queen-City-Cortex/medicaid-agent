---
confidence: 0.93
sources: [qa/_index.md, evaluation/_index.md, agent_architecture/_index.md]
synthesized_at: '2026-07-10T19:50:59.156Z'
type: synthesis
title: Trust is enforced as an end-to-end chain, not a single check
summary: Retrieval, verification, and scoring are treated as one contract that only passes grounded evidence forward.
tags: [qa, evaluation, citations, trust]
related: []
keywords: [hallucination, verifier, judge, evidence, citation, rewrite, grounded, telemetry]
createdAt: '2026-07-10T19:50:59.156Z'
updatedAt: '2026-07-10T19:50:59.156Z'
---

# Trust is enforced as an end-to-end chain, not a single check

qa, evaluation, and agent_architecture all describe trust as a chain: retrieve the right evidence, verify or rewrite unsupported claims, and score only grounded answers. The verifier emits machine-parsed telemetry, evaluation judges against Neo4j evidence, and the agent architecture requires citation-aware policy lookup and amendment checks.

## Evidence

- **qa**: Hallucination verification is final-answer only, uses fixed machine-parsed markers like ---EVIDENCE--- and ---VERIFIER---, and rewrites unsupported output instead of retrying.
- **evaluation**: Level 3 answer scoring pulls Neo4j evidence before judge_answer scoring, and Level 2 cross-reference resolution validates REFERENCES_DOCUMENT, AMENDS, and section-level REFERENCES.
- **agent_architecture**: The architecture emphasizes deterministic verification for policy outputs and citations, with tool-first policy lookup and citation duties.
