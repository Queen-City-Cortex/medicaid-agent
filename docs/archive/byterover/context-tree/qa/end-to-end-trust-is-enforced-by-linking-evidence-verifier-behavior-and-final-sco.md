---
confidence: 0.93
sources: [qa/_index.md, qa/_index.md, evaluation/_index.md, evaluation/_index.md]
synthesized_at: '2026-06-13T20:12:43.257Z'
type: synthesis
title: End-to-end trust is enforced by linking evidence, verifier behavior, and final scoring
summary: Answer trust depends on preserving evidence through retrieval, verification, and evaluation rather than checking only the final response.
tags: [qa, evaluation, evidence, trust]
related: []
keywords: [grounding, verifier, judge_answer, rewrite, evidence, citation, cross-reference, trust]
createdAt: '2026-06-13T20:12:43.257Z'
updatedAt: '2026-06-13T20:12:43.257Z'
---

# End-to-end trust is enforced by linking evidence, verifier behavior, and final scoring

Across qa and evaluation, trust is modeled as an end-to-end contract: retrieval must surface the right evidence, the verifier must reject or rewrite unsupported answers, and evaluation must score only against grounded outputs. The shared failure mode is breaking the chain between evidence and final answer.

## Evidence

- **qa**: Verification is final-answer only and runs only when the assistant finishes cleanly with no pending tool calls.
- **qa**: Failure handling is rewrite-based, not retry-based, using correctedAnswer and writer.custom for rewrite events.
- **evaluation**: Answer scoring fetches Neo4j evidence for both primary and supporting sections before delegating scoring to judge_answer.
- **evaluation**: Cross-reference evaluation measures resolved vs missed cross-refs using document-level and section-level graph edges.
