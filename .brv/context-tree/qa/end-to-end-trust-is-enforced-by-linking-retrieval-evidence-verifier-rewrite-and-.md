---
confidence: 0.96
sources: [agent_architecture/_index.md, evaluation/_index.md, qa/_index.md]
synthesized_at: '2026-06-13T05:58:43.647Z'
type: synthesis
title: End-to-end trust is enforced by linking retrieval evidence, verifier rewrite, and evaluation
summary: The same citation/evidence chain appears in QA, evaluation, and agent policy so unsupported answers can be scored, rejected, or rewritten.
tags: [qa, citations, retrieval, evaluation]
related: []
keywords: [hallucination, verifier, evidence, judge, citation, trust, rewrite]
createdAt: '2026-06-13T05:58:43.647Z'
updatedAt: '2026-06-13T05:58:43.647Z'
---

# End-to-end trust is enforced by linking retrieval evidence, verifier rewrite, and evaluation

The qa, evaluation, and agent_architecture domains all enforce trustworthiness by moving evidence through the full pipeline. agent_architecture supplies tool-first policy lookup and citation duties, evaluation scores answers and cross-references against Neo4j evidence, and qa’s hallucination verifier rewrites unsupported final answers while preserving a strict stdout/evidence contract. This means trust is not a single check; it is an end-to-end contract from retrieval through final answer handling.

## Evidence

- **agent_architecture**: The agent prompt and runtime guidance require tool-first policy lookup and citation duties, with anti-hallucination rules.
- **evaluation**: Answer quality scoring and cross-reference validation both use Neo4j evidence and judge logic, with judge errors excluded from aggregation.
- **qa**: The hallucination verifier verifies only the final assistant response, assembles source text from Neo4j-backed tools, and applies `correctedAnswer` immediately when unsupported.
