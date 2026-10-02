---
confidence: 0.98
sources: [qa/_index.md, evaluation/_index.md, qa/_index.md, evaluation/_index.md]
synthesized_at: '2026-06-20T18:42:30.182Z'
type: synthesis
title: Trust is enforced as an end-to-end chain, not a single score
summary: The QA stack only trusts answers after evidence retrieval, verifier checks or rewrites, and downstream scoring on grounded output.
tags: [qa, evaluation, trust, verification, evidence]
related: []
keywords: [grounding, verifier, scoring, evidence, citation, hallucination, aggregation, golden, rewrite, chain]
createdAt: '2026-06-20T18:42:30.182Z'
updatedAt: '2026-06-20T18:42:30.182Z'
---

# Trust is enforced as an end-to-end chain, not a single score

Across qa and evaluation, trust is modeled as a pipeline: retrieve evidence, verify or rewrite unsupported output, then score or validate only grounded results. The system deliberately separates evidence gathering, hallucination control, and metric aggregation so that no single stage is asked to guarantee truth alone.

## Evidence

- **qa**: Trust is enforced as a chain: retrieve evidence, verify or rewrite unsupported output, then score or validate only grounded results.
- **evaluation**: Answer quality evaluation flows from golden entries to agent invocation, Neo4j evidence fetch, `judge_answer` scoring, and aggregation; cross-reference evaluation separately measures Neo4j relationship coverage.
- **qa**: HallucinationVerifier performs a two-step check: relevance to the intended policy/question and factual accuracy against retrieved sources.
- **evaluation**: Agent failures yield zero scores with preserved explanations, while judge failures become None so they do not skew aggregation.
