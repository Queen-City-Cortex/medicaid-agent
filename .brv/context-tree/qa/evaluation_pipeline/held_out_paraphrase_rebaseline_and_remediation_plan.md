---
title: Held-Out Paraphrase Rebaseline and Remediation Plan
summary: Held-out paraphrase rebaseline achieved 2.60/3.00 overall with 96% trail hit; P1 de-contamination preserved quality and the remediation plan records remaining retrieval, UX, CI, and refactor work.
tags: []
related: [packages/policy_corpus/golden_dataset_de_contamination_and_retrieval_constants.md, qa/hallucination_verifier/hallucination_verifier_processor.md, qa/evaluation_pipeline/answer_evaluation_level_3.md]
keywords: []
createdAt: '2026-06-12T17:49:06.725Z'
updatedAt: '2026-06-12T17:49:06.725Z'
---
## Reason
Preserve the re-baselined held-out evaluation results and the remediation roadmap as durable project knowledge

## Raw Concept
**Task:**
Document the held-out paraphrase rebaseline and remediation plan for the Medicaid agent evaluation pipeline.

**Changes:**
- Rebaselined held-out paraphrase slice on 2026-06-12
- Recorded that P1 de-contamination lost no real quality
- Captured the remediation roadmap covering P0, P1, P2, and P3 work
- Preserved execution order and current status of completed phases

**Flow:**
held-out slice built -> evaluated in unified mode -> baseline compared -> remediation plan staged by phase

**Timestamp:** 2026-06-12T17:48:43.589Z

**Author:** Evaluation and remediation planning notes

## Narrative
### Structure
The note has two parts: a rebaseline summary for the held-out paraphrase dataset and a staged remediation plan spanning P0 through P3.

### Dependencies
The comparison rule is locked to data/golden/heldout-paraphrase.json and unified mode; remediation work depends on the findings index and high-critical findings list.

### Highlights
Overall score 2.60/3.00 with 96% trail hit; P1 de-contamination preserved quality; P0, P1, P2, and P3 status are recorded, with several items completed and some deferred.

### Rules
Future runs must be compared only against: data/golden/heldout-paraphrase.json. Use unified mode only.

### Examples
Failures called out in the held-out set included h-005 meta-commentary instead of answer and h-049 EPSDT authority routed to the wrong CFR benchmark.

## Facts
- **heldout_paraphrase_overall_score**: Held-out paraphrase rebaseline overall score is 2.60/3.00. [project]
- **heldout_paraphrase_fa_score**: Held-out paraphrase rebaseline FA score is 2.72. [project]
- **heldout_paraphrase_comp_score**: Held-out paraphrase rebaseline Comp score is 2.66. [project]
- **heldout_paraphrase_hall_score**: Held-out paraphrase rebaseline Hall score is 2.60. [project]
- **heldout_paraphrase_cit_score**: Held-out paraphrase rebaseline Cit score is 2.66. [project]
- **heldout_paraphrase_trail_hit_rate**: Held-out paraphrase trail hit rate is 96% across n=50. [project]
- **heldout_paraphrase_judge**: The held-out paraphrase judge was claude-sonnet-4-6 using unified evidence. [project]
- **heldout_paraphrase_git_commit**: The held-out paraphrase rebaseline used git commit 71ef5a0. [project]
- **decontamination_quality_result**: The rebaseline was statistically equal to the contaminated 2026-04-23 baseline despite never-seen phrasings. [project]
- **heldout_paraphrase_weakest_reasoning_types**: The weakest reasoning types were temporal at 2.33 and federal reference at 2.40. [project]
- **comparison_rule_dataset**: Future runs must be compared only against data/golden/heldout-paraphrase.json. [convention]
- **comparison_rule_mode**: The evaluation should use unified mode only. [convention]
