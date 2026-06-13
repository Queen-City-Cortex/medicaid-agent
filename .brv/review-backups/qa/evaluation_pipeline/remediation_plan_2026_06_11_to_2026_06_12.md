---
title: Remediation Plan 2026-06-11 to 2026-06-12
summary: Evaluation remediation plan covering P0-P3 fixes, held-out baseline improvements, and remaining stable 2s in CAP/DA, experimental-drug framing, and 441 Subpart G numbering families
tags: []
related: [packages/pipeline/data/eval-results/milestones/2026-06-12t22:00:12_answer.json.md]
keywords: []
createdAt: '2026-06-12T22:03:47.698Z'
updatedAt: '2026-06-13T00:42:31.453Z'
---
## Reason
Document the remediation plan and confirmed evaluation baselines for the held-out paraphrase slice

## Raw Concept
**Task:**
Document the evaluation remediation plan and baseline results for the held-out paraphrase review arc.

**Changes:**
- Recorded evening re-baseline metrics and score deltas
- Captured P0 answer integrity and security fixes
- Captured P1 retrieval and UX defect clusters
- Captured P2 product upgrade and infrastructure hygiene priorities
- Captured P3 staged refactors
- Captured remediation actions for evaluation pipeline and quality assurance
- Preserved held-out dataset ingestion and SSA rules
- Preserved paraphrase rebaseline and remediation planning details
- Recorded trustworthiness and citation fidelity concerns
- Captured remediation actions spanning 2026-06-11 to 2026-06-12
- Recorded the 2026-06-11 remediation plan and phase ordering
- Captured the held-out paraphrase baseline improvements through 2026-06-13
- Preserved the remaining stable 2s and the next optimization lever

**Files:**
- packages/pipeline/data/eval-results/milestones/2026-06-12T22:00:12_answer.json
- docs/reviews/2026-06-11-remediation-plan.md
- packages/pipeline/data/eval-results/milestones/2026-06-13T00:39:11_answer.json

**Flow:**
review findings -> prioritize P0/P1/P2/P3 -> remediate -> re-baseline held-out slice -> monitor stable 2s

**Timestamp:** 2026-06-13T00:42:07.113Z

**Author:** ByteRover context engineer

## Narrative
### Structure
The remediation plan is organized into P0 answer integrity and security, P1 retrieval and corpus integrity, P1 web UX defects, P2 UX upgrades, P2 CI/deploy/hygiene, and P3 staged refactors.

### Dependencies
Key dependencies include re-ingesting federal sources, fixing eval harness reliability, validating IDOR behavior, and running held-out re-baselines against the golden dataset.

### Highlights
The plan reports a strong held-out improvement arc and identifies only three stable 2s remaining. It also notes that further gains are likely limited by judge taste rather than retrieval quality.

### Rules
UI/UX implementation work should invoke the frontend-design skill. Each fix should start by confirming the finding against the code.

### Examples
Examples of remaining gaps include CAP/DA MDT documentation detail, experimental-drug framing, and 441 Subpart G numbering-family completeness.

## Facts
- **baseline_window**: Confirmed 3-run baseline covers 2026-06-12/13. [project]
- **baseline_git_sha**: Git SHA for the 3-run baseline is e5c5a52. [project]
- **overall_score**: Aggregate overall score is 2.82 +/- 0.08 across runs 2.86 / 2.78 / 2.82. [project]
- **factual_score**: Factual score is 2.87 +/- 0.02. [project]
- **completeness_score**: Completeness score is 2.85 +/- 0.06. [project]
- **hallucination_score**: Hallucination is the noisiest dimension at 2.60 +/- 0.16 and should be judged on multi-run means. [project]
- **citation_score**: Citation score is 2.75 +/- 0.06. [project]
- **run_quality**: There were 150 question-runs with zero errors and no >= 2 flips. [project]
- **stable_threes**: 34/50 questions were stable 3s. [project]
- **stable_twos**: Stable 2s remaining are h-011 CAP/DA MDT documentation detail, h-030 experimental-drug framing, and h-045 441 Subpart G numbering families. [project]
- **next_lever**: Further score improvement is mostly judge-taste chasing and the next lever is golden-dataset expansion. [project]
- **heldout_dataset**: The held-out paraphrase slice is data/golden/heldout-paraphrase.json with h-001 through h-050. [project]
- **heldout_baseline_arc**: Held-out baseline improved from 2.60 overall to 2.68 overall to 2.86 overall across the remediation arc. [project]
- **final_mean_baseline**: The final 3-run mean baseline after the remediation arc is 2.82 overall +/- 0.08. [project]
- **execution_phases**: The remediation plan says P0, P1 retrieval, P1 UX, P2 UX, P2 infra, and P3 refactors are the ordered execution phases. [project]
- **phase_status_dates**: P0 status was completed on 2026-06-11, and P1, P2, and P3 were completed on 2026-06-12. [project]
- **plan_scope**: The plan emphasizes answer integrity, retrieval quality, UX defects, product upgrades, CI/deploy hygiene, and staged refactors. [project]

---

## Milestone JSON snapshot

```json
{
  "run_id": "2026-06-12T23:32:28",
  "level": "answer",
  "config": {
    "embedding_model": "voyage-law-2",
    "top_k": 10,
    "dataset_count": 50,
    "git_sha": "e5c5a52",
    "dataset": "data/golden/heldout-paraphrase.json",
    "judge_model": "claude-sonnet-4-6",
    "evidence_mode": "unified"
  },
  "aggregate": {
    "precision_at_k": 0.9533333333333333,
    "recall_at_k": 0.96,
    "mrr": 0.96,
    "primary_hit_rate": 1.0,
    "fac [other]
