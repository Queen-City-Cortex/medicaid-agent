# Hallucination Verification Output Processor

## Problem

The NC Medicaid Navigator agent scores ~2.06 on hallucination (0-3 scale) against a 2.7+ commercial target. The agent sometimes asserts specific facts (dollar amounts, visit limits, dates, eligibility criteria) that aren't present in the source documents it retrieved. For legal aid attorneys and beneficiaries, fabricated policy details are dangerous.

## Solution

A Mastra output processor that verifies the agent's final answer against the source documents it retrieved, using a cheap verifier LLM (Haiku). If unsupported claims are found, the processor kicks the answer back to the agent for self-correction via `processOutputStep`'s retry mechanism. After exhausting retries, any remaining unsupported claims are flagged with `[unverified]` markers.

## Architecture

```
Agent agentic loop
        |
  processOutputStep fires after each LLM step
        |
  Is this the final answer? (finishReason === 'stop', no tool calls)
        |
  No  --> pass through, let the loop continue
  Yes --> extract source material from ALL tool results in steps[]
        |
  Verifier LLM checks claims against sources (structured JSON output)
        |
  All supported? --> pass through unchanged
  Unsupported found, retryCount < max? --> abort({ retry: true }) with feedback
  Unsupported found, retries exhausted? --> rewrite answer with [unverified] markers
```

## Components

### File: `packages/agent/src/processors/hallucination-verifier.ts`

A class implementing Mastra's `Processor` interface with a `processOutputStep` method. This is the correct hook for retry-capable guardrails -- `processOutputResult` does not support `abort({ retry: true })`.

### Source Material Extraction

The processor extracts evidence from the `steps[]` array available in `ProcessOutputStepArgs`. It collects tool results from ALL retrieval tools, not just `getSection`:

| Tool | What it contributes |
|------|-------------------|
| `getSection` | Full section content text (primary evidence) |
| `getAmendments` | Authoritative document ID, effective dates, change summaries |
| `lookupPolicy` | Document metadata, section lists, policy numbers, effective dates |
| `findConceptSections` | Sections linked to policy concepts |

Each tool result is labeled by tool name and keyed by section/document ID so the verifier can trace which source supports which claim.

`searchSections` and `getSectionContext` are excluded -- they return only snippets or structural metadata, not authoritative content.

Source texts are capped at ~30K tokens (configurable). When the cap is exceeded, sources cited in the answer text (matched by section ID or policy number mentions) are prioritized; others are truncated oldest-first.

**Edge case -- no retrieval tool results:** If the agent produced a final answer without calling any retrieval tools, the processor still runs verification. An answer with zero sources should flag all factual claims as unsupported. This prevents a bypass where the agent hallucinates entirely from training data.

### Scoping to the Final Answer

`processOutputStep` runs after every LLM step. The processor only triggers verification when:

1. `finishReason === 'stop'` (the model chose to stop, not making tool calls)
2. `toolCalls` is empty or undefined (no pending tool execution)

This ensures we only verify the final user-facing answer, not intermediate research narration or tool-call steps. The `text` arg in `processOutputStep` is the text from the current step only -- exactly the final answer.

### Verifier LLM Call

A single call to the verifier model with:
- The agent's answer text (from the current step's `text`)
- Concatenated source texts labeled by tool name and section/document ID
- Instructions to check factual claims only

The verifier is an entailment checker, not a policy expert. It focuses on: dollar amounts, dates, thresholds, visit limits, eligibility criteria, policy numbers, and specific requirements. It ignores narrative transitions, hedging language, and meta-commentary.

**Verifier prompt:**
```
You are a factual verification assistant. Given an ANSWER and SOURCE DOCUMENTS,
identify every factual claim in the answer and check whether it is supported
by the source documents.

A claim is SUPPORTED if the source documents contain the information stated
or it is a reasonable paraphrase. A claim is UNSUPPORTED if the source
documents do not contain that information, or the answer states something
that contradicts the sources.

Focus on: dollar amounts, dates, thresholds, visit limits, eligibility
criteria, policy numbers, and specific requirements. Ignore narrative
transitions, hedging language, and meta-commentary about the research process.

If any claims are unsupported, produce a CORRECTED VERSION of the full answer
where each unsupported claim is wrapped in [unverified: ...] markers. Keep
all supported content unchanged. The corrected version must be the complete
answer, not a diff.

Respond with JSON only.
```

**Structured output schema:**
```typescript
{
  supported: boolean;          // true if ALL claims are supported
  unsupportedClaims: Array<{
    claim: string;             // the unsupported claim
    reason: string;            // why it's not supported
  }>;
  correctedAnswer?: string;    // full answer with [unverified: ...] markers
                               // only present when supported === false
}
```

The `correctedAnswer` field solves the brittle string-replacement problem from the original design. Instead of the processor doing ad-hoc find-and-replace on markdown text, the verifier LLM (which understands the answer's structure) produces the flagged version directly. This handles repeated phrases, paraphrased claims, and markdown formatting reliably.

### Retry Flow

When unsupported claims are found and `retryCount < maxProcessorRetries`, the processor calls `abort()` with `{ retry: true }` and a specific feedback message:

```
Your answer contains claims not supported by the documents you retrieved:
- "[claim text]": [reason]
- "[claim text]": [reason]

Revise your answer to either cite a retrieved source for each claim,
or state that you could not confirm the detail. Do NOT add new information
-- only use what you already retrieved.
```

The "do NOT add new information" instruction prevents the retry from triggering more tool calls and expanding scope. The agent should only rewrite its answer using evidence it already gathered.

### Fallback Flagging

On the final verification pass (after `maxProcessorRetries` exhausted), instead of aborting, the processor replaces the assistant's answer in the message list with the verifier's `correctedAnswer` -- the version with `[unverified: ...]` markers already inserted by the verifier LLM.

This avoids fragile string replacement entirely. The verifier has full context of the answer structure and produces a clean, complete rewrite with markers in the right places.

## Integration

### Agent Registration

```typescript
import { HallucinationVerifier } from './processors/hallucination-verifier.js';

const hallucinationVerifier = new HallucinationVerifier();

export const ncMedicaidAgent = new Agent({
  // ...existing config
  outputProcessors: [hallucinationVerifier],
  maxProcessorRetries: 2,
});
```

### Configuration

Environment variables:
- `VERIFIER_MODEL` -- model ID for the verifier (default: `claude-haiku-4-5-20251001`)
- `VERIFIER_ENABLED` -- set to `false` to disable (default: `true`)
- `VERIFIER_MAX_SOURCE_TOKENS` -- cap on source material tokens (default: `30000`)

### Streaming

`processOutputStep` runs after each LLM step within the agentic loop. For streaming, if a retry is triggered, the agent streams a corrected version on the next iteration. This matches Mastra's existing processor retry behavior for `processOutputStep`.

## Cost

- Verification pass: ~2K tokens in, ~500 out --> ~$0.005 with Haiku
- If retry triggered: one agent call (~$0.10 with GPT-5.4) + one verification (~$0.005)
- Worst case (2 retries): ~$0.22 per question
- Expected case (most pass first time): ~$0.005 per question

## Testing

The processor is a standalone class with no Neo4j dependency. Unit tests mock the verifier LLM and test:

1. Pass-through when `finishReason` is `tool-calls` (not a final answer)
2. Pass-through when all claims supported
3. Retry trigger when unsupported claims found and retryCount < max
4. Fallback: message rewrite with `correctedAnswer` after max retries
5. Source extraction from multiple tool types (getSection, getAmendments, lookupPolicy, findConceptSections)
6. Verification still runs when no retrieval tools were called (flags all claims)
7. Token truncation when source material exceeds cap
8. Verifier LLM error handling (pass through on failure)

## Error Handling

If the verifier LLM call fails (network error, rate limit, malformed JSON response), the processor passes the answer through unchanged. Verification is best-effort -- it should never block the user from getting an answer. Errors are logged for observability.

## Eval Impact

No changes to the eval harness. The `[unverified]` flags will naturally lower the hallucination score if they appear, which is the correct signal -- it means the agent is producing claims it can't verify even after correction. The goal is to raise the hallucination score from ~2.06 to 2.7+ by eliminating the unsupported claims before they reach the judge.
