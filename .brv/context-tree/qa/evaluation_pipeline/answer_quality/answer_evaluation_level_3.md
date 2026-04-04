---
title: Answer Evaluation Level 3
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-03T05:53:41.079Z'
updatedAt: '2026-04-03T05:53:41.079Z'
---
## Raw Concept
**Task:**
Describe how Level 3 answer evaluation runs the agent, gathers evidence, and scores responses for golden entries.

**Changes:**
- Added HTTP-first agent invocation with CLI fallback and error logging for agent connectivity issues.
- Agent errors now emit zeroed scores with explanation so failures remain traceable.
- Judge errors are recorded with None metrics to keep aggregate calculations accurate.

**Files:**
- packages/pipeline/src/pipeline/eval/levels/answer.py

**Flow:**
question -> _invoke_agent (HTTP, CLI fallback) -> _fetch_evidence_texts (Neo4j by section IDs) -> judge_answer -> results append with precision/recall/mrr/primary hit flags.

**Timestamp:** 2026-04-03

**Author:** Medicaid QA Evaluation Team

## Narrative
### Structure
extract_answer isolates the answer region after ---ANSWER---, _invoke_agent tries HTTP before falling back to the CLI, and evaluate_answers loops entries to capture agent answers/errors, evidence texts, and judge scores. Results include alias fields (precision, recall, mrr, primary_hit) tailored for compatibility with existing aggregates.

### Dependencies
Relies on httpx for HTTP calls, subprocess for CLI fallback, get_session for Neo4j lookups, and the judge_answer scoring helper.

### Highlights
Agent timing errors are surfaced via agent_error explanations, while judge errors avoid polluting aggregates by returning None metrics.

### Rules
Rule: When judge_answer raises or returns an error_type judge, set factual_accuracy/completeness/overall/citation_quality to None so aggregator treats the score as missing. Rule: When agent_error is truthy, default all numeric scores to 0 and keep the explanation string for logging.

## Facts
- **judge_error_handling**: Judge errors return None scores for every metric and set error_type to judge so aggregates can skip the entry. [convention]
- **agent_invocation**: Agent invocation prioritizes an HTTP POST to http://localhost:4111/api/agents/ncMedicaidAgent/generate and falls back to running npx tsx src/index.ts inside AGENT_DIR if the API is unavailable. [project]
- **evidence_retrieval**: Evidence text retrieval queries Neo4j Section nodes by ID and concatenates each section title with content_text before passing the list to judge_answer. [project]
