---
title: Answer Quality Evaluation
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-03T05:51:24.399Z'
updatedAt: '2026-04-03T05:51:24.399Z'
---
## Raw Concept
**Task:**
Document the Level 3 end-to-end answer quality evaluation for ncMedicaidAgent entries.

**Changes:**
- Added transparent handling for HTTP API vs CLI agent invocation, including OpenAI env passthrough and fallbacks.
- Captured evidence retrieval via Neo4j section queries for both primary and supporting sections before judge scoring.
- Clarified that judge errors use None scores while agent errors continue returning zeros plus error explanations.

**Files:**
- packages/pipeline/src/pipeline/eval/levels/answer.py

**Flow:**
golden entries -> _invoke_agent (HTTP -> CLI) -> fetch evidence texts (primary + supporting) -> judge_answer -> build metrics per question

**Timestamp:** 2026-04-03

## Narrative
### Structure
Answer evaluation lives in pipeline/src/pipeline/eval/levels/answer.py with helper functions for extracting the content after ---ANSWER--- markers, invoking agents via HTTP or CLI, and retrieving Neo4j section texts.

### Dependencies
Depends on HTTPX for API calls, subprocess for CLI fallbacks, Neo4j sessions for evidence, and the judge_answer scoring module.

### Highlights
Judge errors now emit None to prevent aggregation, and agent invocation passes through optional OPENAI_API_KEY and AGENT_MODEL overrides.

### Rules
Rule: agent invocation times out at 180 seconds and raises if non-zero exit code before judge scoring proceeds.

## Facts
- **judge_error_handling**: Judge errors now emit None for every score dimension and are excluded from aggregate metrics. [project]
- **agent_error_scoring**: Agent errors assign zeros for all scoring metrics and capture an explanation with the agent error message. [project]
- **primary_hit_threshold**: Primary_hit is marked true whenever the overall score is at least 2, if available. [project]
