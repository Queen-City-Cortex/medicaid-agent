---
confidence: 0.94
sources: [evaluation/_index.md, qa/_index.md]
synthesized_at: '2026-06-12T17:22:51.307Z'
type: synthesis
title: Trustworthiness is enforced from retrieval through final answer evaluation
summary: QA, evaluation, and launch blockers all harden the answer pipeline so unsupported claims are caught or rewritten.
tags: [qa, evaluation, hallucination, citations, trust]
related: []
keywords: [judge_answer, verification, rewrite, unsupported-claims, citation-fidelity, cross-reference, metrics, blockers]
createdAt: '2026-06-12T17:22:51.307Z'
updatedAt: '2026-06-12T17:22:51.307Z'
---

# Trustworthiness is enforced from retrieval through final answer evaluation

Across qa and evaluation, the system treats answer trust as an end-to-end contract: evaluation measures answer quality and cross-reference resolution against Neo4j evidence, while qa adds hallucination verification that can rewrite unsupported final answers and launch blockers that prioritize citation fidelity and trustworthiness. This makes correctness checks cumulative rather than isolated to a single scoring step.

## Evidence

- **evaluation**: The evaluation stack uses Neo4j evidence retrieval, `judge_answer`, and separate answer-quality and cross-reference pipelines with judge errors excluded from aggregates.
- **qa**: The hallucination verifier performs a final-pass check on the assistant response, can rewrite unsupported content without retries, and the launch-blocker roadmap prioritizes citation fidelity and trustworthiness.
