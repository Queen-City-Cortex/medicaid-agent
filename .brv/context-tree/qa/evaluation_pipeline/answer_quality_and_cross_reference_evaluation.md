---
title: Answer Quality and Cross-Reference Evaluation
tags: []
related: [qa/hallucination_verifier/hallucination_verifier_processor.md, qa/playwright_e2e/context.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-03T05:53:06.136Z'
updatedAt: '2026-04-03T05:53:06.136Z'
---
## Raw Concept
**Task:**
Document the QA evaluation pipelines that score agent answers and verify cross-reference relationships.

**Changes:**
- Answer evaluation now saves None scores for judge errors instead of zeros and rejects them when aggregating metrics.
- Cross-reference evaluation resolves EXPECTED relationships via document-level REFERENCES_DOCUMENT, AMENDS (bidirectional), and section-level REFERENCES paths.
- Three golden entries (q-004, q-009, q-020) still fail because the reference extraction pipeline misses the required relationships.

**Files:**
- packages/pipeline/src/pipeline/eval/levels/answer.py
- packages/pipeline/src/pipeline/eval/levels/cross_ref.py

**Flow:**
golden entry -> agent invocation (HTTP API, fallback CLI) -> evidence fetch from Neo4j -> judge_answer scoring -> aggregate metrics; cross-ref pipeline iterates each cross-reference and validates document/section relationships.

**Timestamp:** 2026-04-03

**Author:** QA Team

## Narrative
### Structure
Answer evaluation lives in packages/pipeline/src/pipeline/eval/levels/answer.py and exposes evaluate_answers(entries) which handles agent invocation, evidence retrieval via get_session(), and judge_answer scoring. Cross-reference evaluation resides in packages/pipeline/src/pipeline/eval/levels/cross_ref.py and iterates each cross_reference entry to verify Neo4j relationships before producing recall/precision metrics.

### Dependencies
Requires a running mastra dev HTTP service on localhost:4111 for agents (with CLI fallback that shells into npx tsx src/index.ts) and a Neo4j graph connection to fetch section content and relationships.

### Highlights
Judge errors now return None for all numeric scores, keeping aggregates focused on successful judgments; cross-ref evaluation counts resolved/missed references and treats q-004, q-009, and q-020 as outstanding extraction issues that need improved reference extraction.

### Rules
Judge errors get None scores — exclude from aggregates.

## Facts
- **agent_invocation**: Answer evaluation invokes the agent via HTTP first and falls back to the CLI when the service is unreachable. [project]
- **evidence_fetch**: Evidence texts are fetched from Neo4j sections listed in the entry evidence payload before judging. [project]
- **judge_error_handling**: Judge errors now store None scores and are excluded from downstream aggregates to prevent skewing metrics. [convention]
- **cross_ref_resolution**: Cross-reference evaluation resolves relationships by checking REFERENCES_DOCUMENT, AMENDS (both directions), and section-level REFERENCES paths. [project]
