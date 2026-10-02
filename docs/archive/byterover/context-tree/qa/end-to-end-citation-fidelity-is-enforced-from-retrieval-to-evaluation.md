---
confidence: 0.97
sources: [agent_architecture/_index.md, evaluation/_index.md, qa/_index.md]
synthesized_at: '2026-06-12T03:05:29.156Z'
type: synthesis
title: End-to-end citation fidelity is enforced from retrieval to evaluation
summary: Policy answers are only trustworthy when retrieval, verification, and scoring all preserve section-level evidence and amendment links.
tags: [citations, evaluation, hallucination, neo4j, policy]
related: []
keywords: [citation, evidence, verification, amendment, sections, judge, cross-reference, hallucination]
createdAt: '2026-06-12T03:05:29.156Z'
updatedAt: '2026-06-12T03:05:29.156Z'
---

# End-to-end citation fidelity is enforced from retrieval to evaluation

Across agent_architecture, evaluation, and qa, the system consistently treats citation fidelity as an end-to-end contract: the agent requires tool-first policy lookup and amendment checks, the evaluation pipeline scores answers using Neo4j section evidence and cross-reference resolution, and the hallucination verifier rewrites or rejects outputs when evidence is missing or unsupported.

## Evidence

- **agent_architecture**: The NC Medicaid Navigator agent instructions enforce tool-first workflows, citation duties (section IDs, policy numbers, effective dates, URLs), amendment checks, and forced synthesis warnings.
- **evaluation**: Level 3 answer quality evaluation fetches primary/supporting Neo4j section texts before judge scoring, and Level 2 cross-reference resolution validates DOCUMENT/AMENDS/REFERENCES relationships to count resolved vs missed items.
- **qa**: The HallucinationVerifier builds prioritized source text from getSection, getDocument, getAmendments, lookupPolicy, and followReferences, then calls verifyAnswer and rewrites unsupported claims.
