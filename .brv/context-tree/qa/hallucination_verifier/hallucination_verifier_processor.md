---
title: Hallucination Verifier Processor
tags: []
related: [qa/playwright_e2e/medicaid_agent_playwright_e2e_infrastructure.md, qa/launch_blockers/launch_blocker_fixes.md, qa/evaluation_pipeline/evaluation_pipeline.md, qa/evaluation_pipeline/answer_quality_and_cross_reference_evaluation.md, qa/evaluation_pipeline/answer_quality/answer_evaluation_level_3.md, qa/evaluation_pipeline/cross_reference_resolution/cross_reference_evaluation_level_2.md, qa/playwright_e2e/context.md, qa/evaluation_pipeline/context.md, qa/hallucination_verifier/cli_verifier_flow_and_stdout_contract.md, qa/launch_blockers/remediation_plan_2026_06_11.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-03T03:50:49.483Z'
updatedAt: '2026-04-03T03:50:49.483Z'
---
## Raw Concept
**Task:**
Document the HallucinationVerifier processor which performs a two-step relevance and factuality check on NC Medicaid policy answers.

**Changes:**
- Switched the verifier to a two-step check: relevance against the intended policy/question and factual accuracy against retrieved sources.
- Added a question parameter to verifyAnswer, extended the schema with relevant/relevanceIssues, and surfaced major relevance issues to corrections.
- Built dedicated SourceEntry builders for getSection, getDocument, getAmendments, lookupPolicy, and followReferences along with buildSourceText prioritizing cited evidence and enforcing a maxSourceChars limit.
- Processor now extracts the first user question, gathers source context, runs verifyAnswer, and updates assistant messages with correctedAnswer via writer custom events when needed.

**Files:**
- packages/agent/src/processors/hallucination-verifier.ts

**Flow:**
getConfig() determines whether the verifier is enabled and what model/limits to use → processOutputStep only runs on the final assistant response (finishReason stop, no tool calls, text exists) → extract the first user question from the conversation → extract tool-based sources and buildSourceText (cited first, uncited after, respecting maxSourceChars) → call verifyAnswer(question, text, sourceText) with the new schema → if verification is unsupported, irrelevant, or has major relevance issues, apply verification.correctedAnswer via writer.custom data-verification-rewrite and update assistant message text.

**Timestamp:** 2026-04-03

## Narrative
### Structure
Defines the verifier config, evidence-source interfaces, formatters for doc metadata, SourceEntry builders for each evidence tool, a buildSourceText helper, the Zod verification schema, and the HallucinationVerifier class implementing Processor.processOutputStep.

### Dependencies
Relies on generateObject from ai, createOpenAI from @ai-sdk/openai, Zod for schema validation, and Mastra core processors/memory types along with the writer.custom API to emit data-verification-rewrite events.

### Highlights
Highlights include the two-step relevance+fact check, the expanded schema capturing relevanceIssues/unsupportedClaims, the char-limited source text builder that prioritizes cited evidence, and the direct correctedAnswer rewrite path that avoids additional retries.

### Rules
Only verify the final answer (finishReason must be stop with no pending tool calls and text present). When verification fails, apply the correctedAnswer from the verifier immediately instead of retrying to prevent over-correction. When building source text, split entries into cited vs uncited based on whether the answer references the tool key and stop adding blocks once maxSourceChars is reached, publishing a truncation notice for excess sources.

## Facts
- **evidence_tools**: Evidence extraction only considers getSection, getDocument, getAmendments, lookupPolicy, and followReferences tool outputs. [project]
- **source_limits**: maxSourceChars is computed as VERIFIER_MAX_SOURCE_TOKENS (default 30000) multiplied by 4 to bound the source summary. [project]
- **verification_schema**: Verification schema now requires supported, relevant, unsupportedClaims, relevanceIssues, and correctedAnswer fields. [project]
- **processor_trigger**: HallucinationVerifier runs only when the verifier is enabled, finishReason is stop, there are no pending tool calls, and text is present. [project]
- **correction_application**: The processor applies the correctedAnswer directly via writer.custom without retries when verification fails. [project]
