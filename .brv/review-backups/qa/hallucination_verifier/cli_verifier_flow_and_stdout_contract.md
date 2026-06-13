---
title: CLI Verifier Flow and Stdout Contract
summary: CLI verification flow with stable stdout markers, verifier schema, confidence scoring, and processor/CLI behavior
tags: []
related: [qa/hallucination_verifier/hallucination_verifier_processor.md, qa/evaluation_pipeline/context.md, qa/launch_blockers/launch_blocker_fixes.md]
keywords: []
createdAt: '2026-06-12T05:40:34.645Z'
updatedAt: '2026-06-12T05:40:34.645Z'
---
## Reason
Document the verification pipeline, telemetry contract, and CLI behavior for hallucination verification

## Raw Concept
**Task:**
Document the hallucination verifier, CLI runner, and agent runtime contract

**Changes:**
- Defined stable stdout markers for verification output
- Specified verifier telemetry schema and confidence scoring
- Captured CLI and processor environment/model behavior
- Documented agent server, route, and healthcheck settings

**Files:**
- packages/agent/src/processors/hallucination-verifier.ts
- packages/agent/src/index.ts

**Flow:**
CLI or processor output -> evidence extraction -> verifier check -> confidence scoring -> corrected answer rendering -> final output

**Timestamp:** 2026-06-12

## Narrative
### Structure
Covers the verifier processor, CLI runner, agent bootstrap, server configuration, and response replacement behavior.

### Dependencies
Depends on OpenAI, Anthropic, Voyage, WorkOS auth, Neo4j connectivity, and verification source extraction from supported tools.

### Highlights
Preserves the exact stdout contract, supported tools, telemetry fields, confidence thresholds, and fallback behavior for verification failures.

### Rules
Do not rename telemetry fields. The Python eval harness parses the ---VERIFIER--- JSON block and depends on the exact snake_case field names.

### Examples
Example output markers: ---EVIDENCE---, ---VERIFIER---, ---ANSWER---.

## Facts
- **verification_flow**: runVerificationForAnswer() is the shared verification flow used by both the CLI runner and the HallucinationVerifier processor. [project]
- **stdout_contract**: VerifierTelemetry uses a stable stdout contract with marker-separated output: ---EVIDENCE---, ---VERIFIER---, ---ANSWER---. [convention]
- **verifier_json_contract**: The Python eval harness parses the ---VERIFIER--- JSON block and depends on exact snake_case field names. [convention]
- **deleted_file**: agent/src/server.ts was deleted. [project]
- **cli_entrypoint**: Mastra CLI only resolves index.ts. [project]
- **emitted_eval_route_latch**: The answer-frame emittedEvalRoute latch is correct once per process because eval runs one question per subprocess. [project]
- **verifier_max_source_tokens**: VERIFIER_MAX_SOURCE_TOKENS defaults to 30000. [project]
- **verifier_enabled**: VERIFIER_ENABLED !== 'false' enables verification. [project]
- **verifier_model**: VERIFIER_MODEL defaults to gpt-5.4-mini. [project]
- **max_source_chars**: maxSourceChars equals maxTokens * 4. [project]
- **source_entry_model**: SourceEntry includes toolName, key, text, and optional link. [project]
- **supported_evidence_tools**: Supported evidence tools are getSection, getDocument, getAmendments, lookupPolicy, followReferences, and resolveAnswerFrame. [project]
- **get_section_behavior**: getSection extracts section metadata, citation link/URL, and content. [project]
- **get_document_behavior**: getDocument formats document metadata plus a section list. [project]
- **get_amendments_behavior**: getAmendments uses authoritative document ID as key when available and includes amendment list and base document. [project]
- **lookup_policy_behavior**: lookupPolicy collapses multiple documents into one source entry. [project]
- **follow_references_behavior**: followReferences emits cross-reference details. [project]
- **resolve_answer_frame_behavior**: resolveAnswerFrame includes question type, route lane/rationale/widening policy, determinism hints, authoritative documents, primary/supporting/avoid sections, latest revision marker, and variant reasoning. [project]
- **source_text_fallback**: If no sources are available, buildSourceText returns (No source documents were retrieved.). [project]
- **source_ordering**: Cited sources are ordered before uncited sources. [project]
- **verification_schema**: Verification schema includes supported, relevant, citationsComplete, unsupportedClaims, missingCitationClaims, relevanceIssues, and correctedAnswer. [project]
- **confidence_formula**: Confidence deduction uses weights 0.30 unsupported, 0.15 missingCitation, 0.35 relevanceMajor, and 0.10 relevanceMinor. [project]
- **confidence_clamp**: Confidence is clamped to [0, 1]. [project]
- **pure_marker_fallback**: pureMarkerFallback clamps confidence to at most 0.55. [project]
- **confidence_thresholds**: Confidence severity thresholds are >= 0.85 high, >= 0.60 medium, otherwise low. [project]
- **corrected_answer_rendering**: renderCorrectedAnswer removes missing citation markers from sentence flow and emits a footer for suggested citations. [project]
- **process_output_step_guardrails**: HallucinationVerifier.processOutputStep() only runs when enabled, finishReason is stop, no pending tool calls exist, and text exists. [project]
- **final_answer_replacement**: replaceFinalAnswerText only replaces the last text part of the last assistant message and preserves earlier assistant messages. [project]
- **required_environment_variables**: Required environment variables are VOYAGE_API_KEY and OPENAI_API_KEY, and ANTHROPIC_API_KEY is required when AGENT_MODEL starts with claude-. [project]
- **agent_model**: AGENT_MODEL defaults to gpt-5.4. [project]
- **model_selection**: createModel() chooses OpenAI for gpt-*, o3*, and o4* models, and Anthropic otherwise. [project]
- **observability_db_path**: OBSERVABILITY_DB_PATH uses :memory: during CLI runs and mastra.duckdb otherwise. [project]
- **cli_input_processors**: CLI input processors include OpenAIResponsesDedupProcessor, AnswerFramePrefetchProcessor, AnswerFramePlanningProcessor, and TokenLimiterProcessor with limit 128000. [project]
- **prompt_injection_detector**: Non-CLI adds PromptInjectionDetector with model openai/gpt-5-mini, threshold 0.8, strategy block, and detection types injection, jailbreak, and system-override. [project]
- **output_processors**: Output processors include only HallucinationVerifier when verifier is enabled and not in CLI. [project]
- **max_steps**: MAX_STEPS equals 99. [project]
- **agent_identity**: Agent id is nc-medicaid-navigator and name is NC Medicaid Navigator. [project]
- **instruction_date_prefix**: Instructions prepend Current date: <weekday, month day, year>. [project]
- **agent_tools**: The agent exposes resolveAnswerFrame, searchSections, getSection, getDocument, getSectionContext, followReferences, getAmendments, findConceptSections, and lookupPolicy. [project]
- **server_host_port**: Server host is 0.0.0.0 and port is parseInt(process.env.PORT || '4111'). [project]
- **server_timeout**: Server timeout is 10 * 60 * 1000 ms. [project]
- **cors_configuration**: CORS origins come from CORS_ORIGINS or http://localhost:3000, with credentials enabled. [project]
- **chat_route_defaults**: The /chat route uses AGENT_RUN_LIMITS, savePerStep: true, and logs step type, text length, and tool count on step finish. [project]
- **healthz_behavior**: /healthz checks Neo4j connectivity by running RETURN 1 and returns ok/connected or degraded/error status. [project]
- **cli_usage**: CLI usage is npx tsx --env-file=.env src/index.ts "your question here". [project]
- **cli_memory**: CLI memory uses thread cli-${Date.now()} and resource cli. [project]
- **cli_verification_output**: CLI verification emits ---EVIDENCE--- and ---VERIFIER--- before ---ANSWER--- and falls back to a standard inability message when insufficient information is found. [project]
