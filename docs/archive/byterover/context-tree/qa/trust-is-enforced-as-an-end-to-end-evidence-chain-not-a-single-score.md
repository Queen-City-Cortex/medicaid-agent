---
confidence: 0.95
sources: [qa/_index.md, evaluation/_index.md, agent_architecture/_index.md]
synthesized_at: '2026-07-26T18:01:44.041Z'
type: synthesis
title: Trust is enforced as an end-to-end evidence chain, not a single score
summary: QA, evaluation, and agent policy all require evidence retrieval, verification or rewrite, and final scoring on grounded output.
tags: [trust, citations, qa, evaluation, policy]
related: []
keywords: [evidence, verifier, rewrite, grounding, citations, judge, amendments, chain]
createdAt: '2026-07-26T18:01:44.041Z'
updatedAt: '2026-07-26T18:01:44.041Z'
---

# Trust is enforced as an end-to-end evidence chain, not a single score

The QA and evaluation layers both reject the idea that a single check can establish trust. qa describes a final-answer-only verifier that retrieves evidence, tests relevance and factual accuracy, and rewrites unsupported claims; evaluation scores answers only after fetching Neo4j evidence and resolving cross-references; agent_architecture adds citation-aware policy lookup and amendment checks. Together they define a chain: retrieve evidence, verify claims, then score or accept only grounded answers.

## Evidence

- **qa**: The verifier runs only for final answers, collects tool-scoped evidence, and if verification fails it applies `correctedAnswer` immediately rather than retrying.
- **evaluation**: Level 3 answer scoring fetches Neo4j evidence before `judge_answer`, and Level 2 validation measures document and section relationship coverage in the graph.
- **agent_architecture**: The agent architecture enforces tool-first policy lookup, citation duties, and amendment checks as part of its anti-hallucination constraints.
