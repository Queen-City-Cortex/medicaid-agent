---
title: CLI Verifier Flow and Stdout Contract
summary: CLI verifier flow, stdout contract, and execution behavior for hallucination verification.
tags: []
related: [qa/hallucination_verifier/hallucination_verifier_processor.md, qa/evaluation_pipeline/context.md, qa/launch_blockers/launch_blocker_fixes.md]
keywords: []
createdAt: '2026-06-12T05:40:34.645Z'
updatedAt: '2026-06-13T03:00:23.081Z'
---
## Reason
Curate extracted facts from context

## Raw Concept
**Task:**
Document the CLI verifier flow and stdout contract for the hallucination verifier

**Changes:**
- Defined stable stdout markers for verification output
- Specified verifier telemetry schema and confidence scoring
- Captured CLI and processor environment/model behavior
- Documented agent server, route, and healthcheck settings
- Captured CLI execution flow, output contract, and verifier behavior from the source context

**Files:**
- packages/agent/src/processors/hallucination-verifier.ts
- packages/agent/src/index.ts

**Flow:**
input -> verifier execution -> stdout contract -> result handling

**Timestamp:** 2026-06-12

## Narrative
### Structure
Covers how the CLI verifier runs and what it emits to stdout.

### Dependencies
Relates to evaluation tooling and answer quality checks.

### Highlights
Preserves verifier contract details needed for deterministic tooling behavior.

### Rules
Do not rename telemetry fields. The Python eval harness parses the ---VERIFIER--- JSON block and depends on the exact snake_case field names.

### Examples
Example output markers: ---EVIDENCE---, ---VERIFIER---, ---ANSWER---.
