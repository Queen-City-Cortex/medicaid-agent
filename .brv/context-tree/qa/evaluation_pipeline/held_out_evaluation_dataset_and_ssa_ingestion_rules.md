---
title: Held-out Evaluation Dataset and SSA Ingestion Rules
summary: Held-out evaluation dataset construction and SSA ingestion rules, including decontamination, paraphrase rebaseline handling, and citation/trustworthiness constraints.
tags: []
related: [qa/evaluation_pipeline/context.md, qa/evaluation_pipeline/evaluation_pipeline.md, qa/evaluation_pipeline/answer_quality_and_cross_reference_evaluation.md, qa/evaluation_pipeline/answer_quality/answer_evaluation_level_3.md, qa/evaluation_pipeline/cross_reference_resolution/cross_reference_evaluation_level_2.md, qa/evaluation_pipeline/trustworthiness_and_citation_fidelity.md]
keywords: []
createdAt: '2026-06-12T17:07:13.558Z'
updatedAt: '2026-06-12T21:09:59.505Z'
---
## Reason
Curate held-out dataset construction, ingestion constraints, and evaluation safeguards from the provided context.

## Raw Concept
**Task:**
Document the evaluation pipeline artifacts covering held-out dataset handling, SSA ingestion rules, paraphrase rebaseline, and trustworthiness checks.

**Changes:**
- Added held-out paraphrase dataset metadata
- Recorded eval runner dataset-path handling and result config behavior
- Captured SSA to USC mapping rules and freestanding USC exclusions
- Captured CLI eval and mixed-corpus build behavior
- Captured held-out evaluation dataset constraints
- Captured SSA ingestion rules and source authority handling
- Captured paraphrase rebaseline and remediation planning
- Captured trustworthiness and citation fidelity focus

**Files:**
- packages/pipeline/src/pipeline/eval/runner.py
- packages/pipeline/src/pipeline/cli.py
- packages/pipeline/src/pipeline/federal/ssa_client.py

**Flow:**
dataset selection -> decontamination -> SSA ingestion -> evaluation -> remediation/rebaseline -> trustworthiness review

**Timestamp:** 2026-06-12T21:09:42.912Z

## Narrative
### Structure
This topic groups the evaluation pipeline materials that govern dataset construction, ingestion constraints, and downstream review artifacts.

### Dependencies
Depends on decontamination controls, source authority selection, and evaluation workflow discipline.

### Highlights
The context emphasizes held-out data integrity, SSA ingestion rules, and citation fidelity as core safeguards for evaluation quality.

### Rules
Do not assume section suffixes are contiguous. Never infer SSA membership from section numbering alone. Freestanding USC sections must never get SSA_TO_USC entries.

### Examples
Example mappings: SSA 1902 -> USC 1396a; SSA 1905 -> USC 1396d; SSA 1944 -> 1396w-3a.

## Facts
- **held_out_dataset**: The evaluation pipeline uses a held-out dataset that must remain de-contaminated from training and retrieval corpora. [project]
- **ssa_ingestion_rules**: SSA ingestion rules govern how source authorities are selected and paired for evaluation and citation fidelity. [project]
- **paraphrase_rebaseline**: Paraphrase rebaseline and remediation plans are tracked as part of evaluation maintenance. [project]
- **trustworthiness**: Trustworthiness and citation fidelity are explicit evaluation concerns. [project]
