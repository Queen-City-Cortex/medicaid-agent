---
confidence: 0.86
sources: [facts/_index.md, agent_architecture/_index.md, packages/_index.md, evaluation/_index.md]
synthesized_at: '2026-07-10T02:33:44.468Z'
type: synthesis
title: Durable knowledge capture uses the same contract as project evaluation
summary: The repo treats curation as a repeatable pipeline with explicit extraction, verification, and stored facts, mirroring its evaluation rigor.
tags: [curation, facts, evaluation, workflow]
related: []
keywords: [UPSERT, rawConcept, narrative, verification, golden entries, durable knowledge, facts domain]
createdAt: '2026-07-10T02:33:44.468Z'
updatedAt: '2026-07-10T02:33:44.468Z'
---

# Durable knowledge capture uses the same contract as project evaluation

`facts`, `agent_architecture`, and `packages` all encode the same discipline: extract concrete facts, preserve exact rules and timestamps, and verify applied outputs instead of relying on memory. The curation workflow is itself a staged pipeline, and the project’s broader evaluation systems use similarly explicit gates and reproducible evidence. This makes durable knowledge capture part of the engineering system, not a side note.

## Evidence

- **facts**: The conventions domain defines recon -> extraction -> curate -> verify, with UPSERT-first updates and a two-part rawConcept + narrative format.
- **agent_architecture**: The curation backbone emphasizes single-pass processing when small enough, no raw-text printing, and verification via result.applied[].filePath.
- **packages**: The project records exact contracts for retrieval, reranking, embedding dimensions, and evaluation gates rather than leaving behavior implicit.
- **evaluation**: Golden entries flow into agent execution, evidence lookup, judgment, and metrics, so correctness is always traced back to explicit sources.
