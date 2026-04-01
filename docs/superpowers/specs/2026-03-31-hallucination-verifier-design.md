# Hallucination Verification Output Processor

## Problem

The NC Medicaid Navigator agent scores ~2.06 on hallucination (0-3 scale) against a 2.7+ commercial target. The agent sometimes asserts specific facts (dollar amounts, visit limits, dates, eligibility criteria) that aren't present in the source documents it retrieved. For legal aid attorneys and beneficiaries, fabricated policy details are dangerous.

## Solution

A Mastra output processor that verifies the agent's final answer against the source documents it retrieved, using a cheap verifier LLM (Haiku). If unsupported claims are found, the processor kicks the answer back to the agent for self-correction. After exhausting retries, any remaining unsupported claims are flagged with `[unverified]` markers.

## Architecture

```
Agent generates answer
        |
  processOutputResult fires
        |
  Extract source material from getSection tool results in conversation
        |
  Verifier LLM checks claims against sources (structured JSON output)
        |
  All supported? --> pass through unchanged
  Unsupported found? --> abort({ retry: true }) with specific feedback
        |
  Agent self-corrects (up to 2 retries)
        |
  Still unsupported after retries? --> flag with [unverified] and pass through
```

## Components

### File: `packages/agent/src/processors/hallucination-verifier.ts`

A class implementing Mastra's `Processor` interface with a `processOutputResult` method.

### Source Material Extraction

The processor walks conversation messages looking for tool results from `getSection` calls. These contain the actual policy text the agent read. Other tools (`searchSections`, `getSectionContext`, etc.) return only snippets or metadata and are ignored.

Builds a `sources` map: `{ sectionId: contentText }` from all `getSection` tool results.

Source texts are capped at ~30K tokens (configurable) for the verifier call. If the agent read more sections than that, sections cited in the answer text (matched by section ID) are prioritized; others are truncated.

**Edge case:** If the agent answered without calling `getSection` at all, skip verification and pass through.

### Verifier LLM Call

A single call to the verifier model with:
- The agent's answer text
- Concatenated source texts labeled by section ID
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

Respond with JSON only.
```

**Structured output schema:**
```typescript
{
  supported: boolean;        // true if ALL claims are supported
  unsupportedClaims: Array<{
    claim: string;           // the exact text of the unsupported claim
    reason: string;          // why it's not supported
  }>;
}
```

### Retry Flow

When unsupported claims are found, the processor calls `abort()` with `{ retry: true }` and a specific feedback message:

```
Your answer contains claims not supported by the documents you retrieved:
- "[claim text]": [reason]
- "[claim text]": [reason]

Revise your answer to either cite a retrieved source for each claim,
or state that you could not confirm the detail. Do NOT add new information
-- only use what you already retrieved.
```

The "do NOT add new information" instruction prevents the retry from triggering more tool calls and expanding scope.

### Fallback Flagging

On the final verification pass (after `maxProcessorRetries` exhausted), instead of aborting, the processor modifies the answer text directly. Each unsupported claim is wrapped: `[unverified: <claim>]`.

This is a last resort -- the agent usually fixes things on retry 1.

## Integration

### Agent Registration

```typescript
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

`processOutputResult` runs after the stream is fully consumed. For streaming, the user sees the agent's response stream in, then if a retry is triggered the agent streams a corrected version. This matches Mastra's existing processor retry behavior.

## Cost

- Verification pass: ~2K tokens in, ~500 out --> ~$0.005 with Haiku
- If retry triggered: one agent call (~$0.10 with GPT-5.4) + one verification (~$0.005)
- Worst case (2 retries): ~$0.22 per question
- Expected case (most pass first time): ~$0.005 per question

## Testing

The processor is a standalone class with no Neo4j dependency. Unit tests mock the verifier LLM and test:

1. Pass-through when all claims supported
2. Retry trigger when unsupported claims found
3. Fallback `[unverified]` flagging after max retries
4. Edge case: no `getSection` results in messages (skip verification)
5. Token truncation when source material exceeds cap
6. Verifier LLM error handling (pass through on failure -- don't block the user)

## Error Handling

If the verifier LLM call fails (network error, rate limit, malformed JSON response), the processor passes the answer through unchanged. Verification is best-effort -- it should never block the user from getting an answer. Errors are logged for observability.

## Eval Impact

No changes to the eval harness. The `[unverified]` flags will naturally lower the hallucination score if they appear, which is the correct signal -- it means the agent is producing claims it can't verify even after correction. The goal is to raise the hallucination score from ~2.06 to 2.7+ by eliminating the unsupported claims before they reach the judge.
