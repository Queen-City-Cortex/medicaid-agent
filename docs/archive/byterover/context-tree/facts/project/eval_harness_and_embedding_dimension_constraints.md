---
title: Eval harness and embedding dimension constraints
tags: []
related: [facts/conventions/context.md, facts/project/policy_corpus_coverage_scoring.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-09T02:45:13.932Z'
updatedAt: '2026-07-09T02:45:13.932Z'
---
## Raw Concept
**Task:**
Document eval harness swap gates and embedding dimensionality constraints

**Changes:**
- gate_embeddings compares voyage-law-2 at 1024 against the candidate embedder
- gate_verifier compares baseline and candidate verifiers with stochastic answer evals
- Embedding width mismatches can silently break retrieval if candidate dimensions do not match model defaults

**Files:**
- scripts/eval-ab.sh

**Flow:**
build corpus -> run retrieval eval -> compare candidate vs baseline -> gate adoption on regression threshold

**Timestamp:** 2026-07-09

**Author:** unknown

## Narrative
### Structure
The harness has separate gates for embeddings and verifier changes, plus helper functions for run summarization and latest run lookup.

### Dependencies
Candidate embedding dimensions must match the model default; 1024 also matches voyage-law-2. To try 2048 dimensions, voyage_client.embed() must send output_dimension.

### Highlights
A swap is adopted only if regression does not exceed 0.05. The AB container builds the same mixed corpus for both embedding arms to avoid confounding.

### Examples
Usage: scripts/eval-ab.sh embeddings or scripts/eval-ab.sh verifier.

## Facts
- **eval_ab_scope**: scripts/eval-ab.sh compares embeddings and verifier swaps against the held-out paraphrase split. [project]
- **eval_ab_defaults**: The eval harness defaults to DATASET data/golden/heldout-paraphrase.json and RUNS 3. [project]
- **embedding_dimensions**: voyage-4-large returns 1024 dimensions by default and CANDIDATE_DIMS must match the model default. [project]
