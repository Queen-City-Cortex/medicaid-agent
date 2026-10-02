---
confidence: 0.95
sources: [qa/_index.md, evaluation/_index.md, qa/_index.md]
synthesized_at: '2026-06-19T16:49:15.257Z'
type: synthesis
title: End-to-end trust is enforced as a chain, not a single check
summary: Trustworthy answers require retrieval, verification or rewrite, and final scoring to all agree.
tags: [qa, evaluation, verification, trust]
related: []
keywords: [trust, verification, rewrite, grounded, scoring, evidence, hallucination, pipeline, answer, fidelity]
createdAt: '2026-06-19T16:49:15.257Z'
updatedAt: '2026-06-19T16:49:15.257Z'
---

# End-to-end trust is enforced as a chain, not a single check

Across qa and evaluation, trustworthiness is implemented as a multi-stage chain: retrieve evidence, verify or rewrite unsupported claims, then score only grounded outputs. The same pattern appears in cross-reference validation and answer-quality scoring, where failures are handled by rewrite or excluded scores rather than allowing unsupported claims to pass through a single gate.

## Evidence

- **qa**: The verifier contract is final-answer only, runs only when finishReason is stop and text exists, and uses rewrite-based failure handling via correctedAnswer and writer.custom.
- **evaluation**: Answer-quality evaluation fetches Neo4j evidence, runs judge_answer, and treats judge failures as None while agent failures yield zero scores with an error explanation.
- **qa**: The domain summary states that trustworthy answers are enforced structurally, not by a single check: evidence must be retrieved, verified or rewritten, and then scored against grounded outputs.
