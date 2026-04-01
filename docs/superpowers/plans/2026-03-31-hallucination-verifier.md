# Hallucination Verifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an output processor that verifies the agent's final answer against retrieved source documents and kicks unsupported claims back for self-correction.

**Architecture:** A single `HallucinationVerifier` class implementing Mastra's `Processor` interface with `processOutputStep` (verification + retry/fallback) and `processInputStep` (enforce `toolChoice: 'none'` during retries). Registered in both `inputProcessors` and `outputProcessors`. Uses a cheap verifier LLM (Haiku) to check factual claims against tool results from the agent's step history.

**Tech Stack:** TypeScript, Mastra `Processor` interface, `@ai-sdk/anthropic` for verifier LLM, Zod for structured output, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-03-31-hallucination-verifier-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/agent/src/processors/hallucination-verifier.ts` | `HallucinationVerifier` class — `processOutputStep`, `processInputStep`, source extraction, verifier call, fallback logic |
| `packages/agent/tests/processors/hallucination-verifier.test.ts` | Unit tests — mocked verifier LLM, all paths |
| `packages/agent/src/index.ts` | Wire processor into agent (modify existing) |

**Out of scope (follow-up):** Frontend handling of `data-verification-rewrite` chunks in `packages/web/`. The eval runner uses `generate()` (not streaming), so the backend rewrite path covers evaluation. Frontend streaming support can be added after validating the hallucination score improvement.

---

### Task 1: Source Extraction — Tests

**Files:**
- Create: `packages/agent/tests/processors/hallucination-verifier.test.ts`

- [ ] **Step 1: Write test file scaffold and source extraction tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProcessOutputStepArgs, ProcessInputStepArgs, ProcessInputStepResult } from '@mastra/core/processors';

// We'll import HallucinationVerifier after creating it in Task 2
// For now, create the test structure and helper factories

/** Factory for a minimal StepResult with tool results */
function makeStep(toolResults: Array<{ toolName: string; result: unknown }>) {
  return {
    toolResults: toolResults.map((tr, i) => ({
      type: 'tool-result' as const,
      payload: {
        toolCallId: `call-${i}`,
        toolName: tr.toolName,
        result: tr.result,
      },
    })),
    toolCalls: [],
    text: '',
    files: [],
    sources: [],
    reasoning: [],
    dynamicToolCalls: [],
    dynamicToolResults: [],
    staticToolCalls: [],
    staticToolResults: [],
  };
}

describe('extractSources', () => {
  it('extracts getSection content keyed by section ID', () => {
    const steps = [
      makeStep([
        {
          toolName: 'getSection',
          result: {
            section: {
              id: 'sec:doc-1:3.1',
              title: 'Eligibility',
              content: 'Beneficiaries must be under 21.',
              policyNumber: '8C',
              documentId: 'doc-1',
              documentType: 'dhhs_policy',
              sectionNumber: '3.1',
              effectiveDate: null,
            },
          },
        },
      ]),
    ];
    // Will call extractSources(steps) once implemented
    // Expected: Map with 'sec:doc-1:3.1' -> contains 'Beneficiaries must be under 21.'
  });

  it('extracts getAmendments authoritative document and change summaries', () => {
    const steps = [
      makeStep([
        {
          toolName: 'getAmendments',
          result: {
            amendments: [
              {
                id: 'doc-2',
                title: 'Change Notice 2024-01',
                policyNumber: '8C-CN1',
                effectiveDate: '2024-03-01',
                changeSummary: 'Removed the 30-visit annual cap for PT services.',
                documentType: 'change_notice',
                url: null,
                status: 'active',
              },
            ],
            baseDocument: null,
            authoritativeDocument: {
              id: 'doc-2',
              title: 'Change Notice 2024-01',
              policyNumber: '8C-CN1',
              effectiveDate: '2024-03-01',
              url: null,
              status: 'active',
              documentType: 'change_notice',
            },
          },
        },
      ]),
    ];
    // Expected: source text includes 'Change Notice 2024-01', '8C-CN1', '2024-03-01',
    //           'Removed the 30-visit annual cap', 'authoritativeDocument: doc-2'
  });

  it('extracts lookupPolicy document metadata', () => {
    const steps = [
      makeStep([
        {
          toolName: 'lookupPolicy',
          result: {
            documents: [
              {
                id: 'doc-3',
                title: 'Clinical Policy 1F',
                policyNumber: '1F',
                effectiveDate: '2023-07-01',
                documentType: 'clinical_policy',
                url: null,
                status: 'active',
                sections: [
                  { id: 'sec:doc-3:1', number: '1', title: 'Overview' },
                  { id: 'sec:doc-3:2', number: '2', title: 'Coverage' },
                ],
              },
            ],
          },
        },
      ]),
    ];
    // Expected: source text includes 'Clinical Policy 1F', '1F', '2023-07-01',
    //           section IDs listed
  });

  it('extracts getDocument metadata', () => {
    const steps = [
      makeStep([
        {
          toolName: 'getDocument',
          result: {
            document: {
              id: 'doc-4',
              title: 'Policy 10A',
              policyNumber: '10A',
              effectiveDate: '2023-01-01',
              documentType: 'dhhs_policy',
              url: null,
              status: 'active',
              sections: [{ id: 'sec:doc-4:1', number: '1', title: 'Scope', chars: 500 }],
            },
          },
        },
      ]),
    ];
    // Expected: source text includes 'Policy 10A', '10A', '2023-01-01'
  });

  it('extracts followReferences cross-reference data', () => {
    const steps = [
      makeStep([
        {
          toolName: 'followReferences',
          result: {
            references: [
              {
                targetId: 'sec:doc-5:2.1',
                targetType: 'Section',
                targetTitle: 'Federal Requirements',
                targetPolicyNumber: '42 CFR 440',
                relationshipType: 'REFERENCES',
                referenceText: 'see 42 CFR 440.230',
              },
            ],
          },
        },
      ]),
    ];
    // Expected: source text includes 'sec:doc-5:2.1', 'Federal Requirements', '42 CFR 440'
  });

  it('ignores searchSections, getSectionContext, findConceptSections', () => {
    const steps = [
      makeStep([
        { toolName: 'searchSections', result: { results: [{ sectionId: 'sec:1', snippet: 'foo' }] } },
        { toolName: 'getSectionContext', result: { ancestors: [], siblings: [], children: [] } },
        { toolName: 'findConceptSections', result: { sections: [] } },
      ]),
    ];
    // Expected: empty sources
  });

  it('collects sources across multiple steps', () => {
    const steps = [
      makeStep([{ toolName: 'getSection', result: { section: { id: 'sec:1', content: 'A', title: null, sectionNumber: null, effectiveDate: null, documentId: null, documentType: null, policyNumber: null } } }]),
      makeStep([{ toolName: 'getSection', result: { section: { id: 'sec:2', content: 'B', title: null, sectionNumber: null, effectiveDate: null, documentId: null, documentType: null, policyNumber: null } } }]),
    ];
    // Expected: 2 sources
  });

  it('returns empty map when no retrieval tools were called', () => {
    const steps = [makeStep([])];
    // Expected: empty sources
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/agent && npx vitest run tests/processors/hallucination-verifier.test.ts`
Expected: FAIL — `HallucinationVerifier` module not found or tests incomplete

- [ ] **Step 3: Commit test scaffold**

```bash
git add packages/agent/tests/processors/hallucination-verifier.test.ts
git commit -m "test: scaffold hallucination verifier source extraction tests"
```

---

### Task 2: Source Extraction — Implementation

**Files:**
- Create: `packages/agent/src/processors/hallucination-verifier.ts`

- [ ] **Step 1: Create the processor file with source extraction**

```typescript
import type {
  Processor,
  ProcessOutputStepArgs,
  ProcessInputStepArgs,
  ProcessInputStepResult,
} from '@mastra/core/processors';
import type { MastraDBMessage } from '@mastra/core/memory';

// Read env vars at call time, not module load, so tests can override them.
function getConfig() {
  const maxTokens = parseInt(process.env.VERIFIER_MAX_SOURCE_TOKENS || '30000', 10);
  return {
    enabled: process.env.VERIFIER_ENABLED !== 'false',
    model: process.env.VERIFIER_MODEL || 'claude-haiku-4-5-20251001',
    maxSourceChars: maxTokens * 4, // Rough estimate: 1 token ≈ 4 chars
  };
}

/** Tools whose results count as authoritative evidence for verification. */
const EVIDENCE_TOOLS = new Set([
  'getSection',
  'getDocument',
  'getAmendments',
  'lookupPolicy',
  'followReferences',
]);

export interface SourceEntry {
  toolName: string;
  key: string;      // section or document ID
  text: string;     // serialized evidence text
}

/**
 * Walk all steps and extract evidence from retrieval tool results.
 * Returns an array of SourceEntry objects.
 */
export function extractSources(steps: Array<{ toolResults: Array<{ payload: { toolName: string; result: unknown } }> }>): SourceEntry[] {
  const sources: SourceEntry[] = [];

  for (const step of steps) {
    for (const tr of step.toolResults ?? []) {
      const { toolName, result } = tr.payload;
      if (!EVIDENCE_TOOLS.has(toolName)) continue;

      if (toolName === 'getSection') {
        const sec = (result as any)?.section;
        if (!sec) continue;
        sources.push({
          toolName,
          key: sec.id,
          text: formatGetSection(sec),
        });
      } else if (toolName === 'getDocument') {
        const doc = (result as any)?.document;
        if (!doc) continue;
        sources.push({
          toolName,
          key: doc.id,
          text: formatGetDocument(doc),
        });
      } else if (toolName === 'getAmendments') {
        const r = result as any;
        sources.push({
          toolName,
          key: r?.authoritativeDocument?.id ?? 'amendments',
          text: formatGetAmendments(r),
        });
      } else if (toolName === 'lookupPolicy') {
        const docs = (result as any)?.documents;
        if (!Array.isArray(docs)) continue;
        for (const doc of docs) {
          sources.push({
            toolName,
            key: doc.id,
            text: formatLookupPolicy(doc),
          });
        }
      } else if (toolName === 'followReferences') {
        const refs = (result as any)?.references;
        if (!Array.isArray(refs) || refs.length === 0) continue;
        sources.push({
          toolName,
          key: `refs-from-step`,
          text: formatFollowReferences(refs),
        });
      }
    }
  }

  return sources;
}

function formatGetSection(sec: any): string {
  const parts = [`[getSection] Section: ${sec.id}`];
  if (sec.title) parts.push(`Title: ${sec.title}`);
  if (sec.policyNumber) parts.push(`Policy: ${sec.policyNumber}`);
  if (sec.effectiveDate) parts.push(`Effective: ${sec.effectiveDate}`);
  if (sec.content) parts.push(`Content:\n${sec.content}`);
  return parts.join('\n');
}

function formatGetDocument(doc: any): string {
  const parts = [`[getDocument] Document: ${doc.id}`];
  if (doc.title) parts.push(`Title: ${doc.title}`);
  if (doc.policyNumber) parts.push(`Policy: ${doc.policyNumber}`);
  if (doc.effectiveDate) parts.push(`Effective: ${doc.effectiveDate}`);
  if (doc.documentType) parts.push(`Type: ${doc.documentType}`);
  if (doc.sections?.length) {
    parts.push(`Sections: ${doc.sections.map((s: any) => `${s.id} (${s.title || s.number || 'untitled'})`).join(', ')}`);
  }
  return parts.join('\n');
}

function formatGetAmendments(r: any): string {
  const parts = [`[getAmendments]`];
  if (r.authoritativeDocument) {
    const ad = r.authoritativeDocument;
    parts.push(`Authoritative document: ${ad.id} (${ad.title || ad.policyNumber || 'untitled'}), effective ${ad.effectiveDate || 'unknown'}`);
  }
  if (r.baseDocument) {
    const bd = r.baseDocument;
    parts.push(`Base document: ${bd.id} (${bd.title || bd.policyNumber || 'untitled'})`);
  }
  for (const a of r.amendments ?? []) {
    parts.push(`Amendment: ${a.id} (${a.policyNumber || a.title || 'untitled'}), effective ${a.effectiveDate || 'unknown'}`);
    if (a.changeSummary) parts.push(`  Change summary: ${a.changeSummary}`);
  }
  return parts.join('\n');
}

function formatLookupPolicy(doc: any): string {
  const parts = [`[lookupPolicy] Document: ${doc.id}`];
  if (doc.title) parts.push(`Title: ${doc.title}`);
  if (doc.policyNumber) parts.push(`Policy: ${doc.policyNumber}`);
  if (doc.effectiveDate) parts.push(`Effective: ${doc.effectiveDate}`);
  if (doc.documentType) parts.push(`Type: ${doc.documentType}`);
  if (doc.sections?.length) {
    parts.push(`Sections: ${doc.sections.map((s: any) => `${s.id} (${s.title || s.number || 'untitled'})`).join(', ')}`);
  }
  return parts.join('\n');
}

function formatFollowReferences(refs: any[]): string {
  const parts = [`[followReferences]`];
  for (const ref of refs) {
    parts.push(`Reference: ${ref.targetId} (${ref.targetTitle || 'untitled'}) [${ref.relationshipType}]`);
    if (ref.targetPolicyNumber) parts.push(`  Policy: ${ref.targetPolicyNumber}`);
    if (ref.referenceText) parts.push(`  Text: ${ref.referenceText}`);
  }
  return parts.join('\n');
}

/**
 * Build the concatenated source text for the verifier, respecting the token cap.
 * Prioritizes sources whose key appears in the answer text.
 */
export function buildSourceText(sources: SourceEntry[], answerText: string): string {
  if (sources.length === 0) return '(No source documents were retrieved.)';

  // Sort: sources cited in the answer first, then by original order
  const cited = sources.filter(s => answerText.includes(s.key));
  const uncited = sources.filter(s => !answerText.includes(s.key));
  const ordered = [...cited, ...uncited];

  let result = '';
  for (const s of ordered) {
    const entry = `---\n${s.text}\n`;
    if (result.length + entry.length > getConfig().maxSourceChars) {
      result += '\n[Source material truncated due to length limit.]';
      break;
    }
    result += entry;
  }
  return result;
}
```

- [ ] **Step 2: Update tests to import and call extractSources and buildSourceText**

Update `packages/agent/tests/processors/hallucination-verifier.test.ts` — replace placeholder comments with actual assertions using the imported `extractSources` and `buildSourceText` functions. Add `import { extractSources, buildSourceText } from '../../src/processors/hallucination-verifier.js';` at the top.

Each test body should call `extractSources(steps)` and assert on the returned `SourceEntry[]` — check `.length`, `.key`, and that `.text` contains expected substrings.

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd packages/agent && npx vitest run tests/processors/hallucination-verifier.test.ts`
Expected: All `extractSources` tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/processors/hallucination-verifier.ts packages/agent/tests/processors/hallucination-verifier.test.ts
git commit -m "feat: source extraction for hallucination verifier"
```

---

### Task 3: Verifier LLM Call — Tests

**Files:**
- Modify: `packages/agent/tests/processors/hallucination-verifier.test.ts`

- [ ] **Step 1: Add verifier call tests**

Add a new `describe('verifyAnswer')` block. The `verifyAnswer` function takes `answerText` and `sourceText`, calls the verifier LLM, and returns the structured result. Tests mock the Anthropic SDK's `generateText` to return canned JSON responses.

```typescript
describe('verifyAnswer', () => {
  it('returns supported:true when all claims are supported', async () => {
    // Mock generateText to return { supported: true, unsupportedClaims: [] }
    // Call verifyAnswer('answer text', 'source text')
    // Assert result.supported === true, result.unsupportedClaims.length === 0
  });

  it('returns unsupported claims with reasons', async () => {
    // Mock generateText to return {
    //   supported: false,
    //   unsupportedClaims: [{ claim: 'The limit is $500', reason: 'No dollar amount in sources' }],
    //   correctedAnswer: 'The limit is [unverified: $500]'
    // }
    // Assert result.supported === false, result.unsupportedClaims[0].claim === 'The limit is $500'
  });

  it('returns supported:true on verifier LLM error (fail-open)', async () => {
    // Mock generateText to throw an Error
    // Assert result.supported === true (fail-open)
  });

  it('returns supported:true on malformed JSON from verifier', async () => {
    // Mock generateText to return non-JSON text
    // Assert result.supported === true (fail-open)
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/agent && npx vitest run tests/processors/hallucination-verifier.test.ts`
Expected: FAIL — `verifyAnswer` not yet exported

- [ ] **Step 3: Commit**

```bash
git add packages/agent/tests/processors/hallucination-verifier.test.ts
git commit -m "test: verifier LLM call tests for hallucination verifier"
```

---

### Task 4: Verifier LLM Call — Implementation

**Files:**
- Modify: `packages/agent/src/processors/hallucination-verifier.ts`

- [ ] **Step 1: Add the verifier call function**

Add to `hallucination-verifier.ts`:

```typescript
import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';

export interface VerificationResult {
  supported: boolean;
  unsupportedClaims: Array<{ claim: string; reason: string }>;
  correctedAnswer?: string;
}

const VERIFIER_PROMPT = `You are a factual verification assistant. Given an ANSWER and SOURCE DOCUMENTS, identify every factual claim in the answer and check whether it is supported by the source documents.

A claim is SUPPORTED if the source documents contain the information stated or it is a reasonable paraphrase. A claim is UNSUPPORTED if the source documents do not contain that information, or the answer states something that contradicts the sources.

Focus on: dollar amounts, dates, thresholds, visit limits, eligibility criteria, policy numbers, and specific requirements. Ignore narrative transitions, hedging language, and meta-commentary about the research process.

If any claims are unsupported, produce a CORRECTED VERSION of the full answer where each unsupported claim is wrapped in [unverified: ...] markers. Keep all supported content unchanged. The corrected version must be the complete answer, not a diff.

Respond with JSON only matching this schema:
{
  "supported": boolean,
  "unsupportedClaims": [{"claim": "string", "reason": "string"}],
  "correctedAnswer": "string or omit if supported is true"
}`;

export async function verifyAnswer(
  answerText: string,
  sourceText: string,
): Promise<VerificationResult> {
  try {
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const { text } = await generateText({
      model: anthropic(getConfig().model),
      messages: [
        {
          role: 'user',
          content: `## ANSWER\n\n${answerText}\n\n## SOURCE DOCUMENTS\n\n${sourceText}`,
        },
      ],
      system: VERIFIER_PROMPT,
    });

    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      supported: parsed.supported === true,
      unsupportedClaims: Array.isArray(parsed.unsupportedClaims) ? parsed.unsupportedClaims : [],
      correctedAnswer: parsed.correctedAnswer ?? undefined,
    };
  } catch (err) {
    // Fail-open: if the verifier fails, let the answer through
    console.error('[HallucinationVerifier] Verification failed, passing through:', err);
    return { supported: true, unsupportedClaims: [] };
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/agent && npx vitest run tests/processors/hallucination-verifier.test.ts`
Expected: All tests PASS (mock `generateText` in the tests via `vi.mock('ai', ...)`)

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/processors/hallucination-verifier.ts packages/agent/tests/processors/hallucination-verifier.test.ts
git commit -m "feat: verifier LLM call with fail-open error handling"
```

---

### Task 5: Processor Class — Tests

**Files:**
- Modify: `packages/agent/tests/processors/hallucination-verifier.test.ts`

- [ ] **Step 1: Add processOutputStep and processInputStep tests**

```typescript
describe('HallucinationVerifier.processOutputStep', () => {
  it('passes through when finishReason is tool-calls', async () => {
    // Call processOutputStep with finishReason: 'tool-calls', toolCalls: [{ ... }]
    // Assert: returns messages unchanged, verifyAnswer NOT called
  });

  it('passes through when finishReason is stop but claims are supported', async () => {
    // Mock verifyAnswer to return { supported: true }
    // Call processOutputStep with finishReason: 'stop', toolCalls: [], text: 'answer'
    // Assert: returns messages unchanged
  });

  it('calls abort with retry when unsupported claims found and retryCount < 2', async () => {
    // Mock verifyAnswer to return { supported: false, unsupportedClaims: [...] }
    // Pass abort as a vi.fn(), retryCount: 0
    // Assert: abort called with message containing claim text and { retry: true }
    // Assert: state.verificationRetryPending === true
  });

  it('rewrites message list on final retry (retryCount >= 2)', async () => {
    // Mock verifyAnswer to return { supported: false, correctedAnswer: 'fixed text' }
    // Pass retryCount: 2, a mock messageList with assistant message
    // Assert: assistant message text replaced with correctedAnswer
    // Assert: abort NOT called
  });

  it('emits data-verification-rewrite via writer.custom on final retry', async () => {
    // Same as above but pass a mock writer
    // Assert: writer.custom called with { type: 'data-verification-rewrite', data: { ... } }
  });

  it('passes through when VERIFIER_ENABLED is false', async () => {
    // Set process.env.VERIFIER_ENABLED = 'false'
    // Assert: returns messages unchanged, verifyAnswer NOT called
  });
});

describe('HallucinationVerifier.processInputStep', () => {
  it('returns toolChoice none when verificationRetryPending is true', async () => {
    // Set state.verificationRetryPending = true
    // Call processInputStep
    // Assert: returns { toolChoice: 'none' }
    // Assert: state.verificationRetryPending === false
  });

  it('returns empty object when no retry is pending', async () => {
    // state.verificationRetryPending is undefined/false
    // Call processInputStep
    // Assert: returns {}
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/agent && npx vitest run tests/processors/hallucination-verifier.test.ts`
Expected: FAIL — `HallucinationVerifier` class not yet complete

- [ ] **Step 3: Commit**

```bash
git add packages/agent/tests/processors/hallucination-verifier.test.ts
git commit -m "test: processOutputStep and processInputStep tests"
```

---

### Task 6: Processor Class — Implementation

**Files:**
- Modify: `packages/agent/src/processors/hallucination-verifier.ts`

- [ ] **Step 1: Implement the HallucinationVerifier class**

Add to the bottom of `hallucination-verifier.ts`:

```typescript
export class HallucinationVerifier implements Processor {
  readonly id = 'hallucination-verifier';
  readonly name = 'Hallucination Verifier';

  async processInputStep({ state }: ProcessInputStepArgs): Promise<ProcessInputStepResult> {
    if (state.verificationRetryPending) {
      state.verificationRetryPending = false;
      return { toolChoice: 'none' as any };
    }
    return {};
  }

  async processOutputStep({
    text,
    finishReason,
    toolCalls,
    steps,
    messages,
    messageList,
    abort,
    retryCount,
    state,
    writer,
  }: ProcessOutputStepArgs): Promise<MastraDBMessage[]> {
    // Only verify the final answer step
    if (!getConfig().enabled) return messages;
    if (finishReason !== 'stop') return messages;
    if (toolCalls && toolCalls.length > 0) return messages;
    if (!text || !text.trim()) return messages;

    const sources = extractSources(steps as any);
    const sourceText = buildSourceText(sources, text);
    const result = await verifyAnswer(text, sourceText);

    if (result.supported) return messages;

    const maxRetries = 2;
    if ((retryCount ?? 0) < maxRetries) {
      // Set flag so processInputStep disables tools on retry
      state.verificationRetryPending = true;

      const claimList = result.unsupportedClaims
        .map(c => `- "${c.claim}": ${c.reason}`)
        .join('\n');

      abort(
        `Your answer contains claims not supported by the documents you retrieved:\n${claimList}\n\nRevise your answer to either cite a retrieved source for each claim, or state that you could not confirm the detail.`,
        { retry: true },
      );
    }

    // Retries exhausted — apply corrected answer
    if (result.correctedAnswer) {
      // Emit rewrite event for streaming clients
      await writer?.custom({
        type: 'data-verification-rewrite',
        data: {
          correctedAnswer: result.correctedAnswer,
          unsupportedClaims: result.unsupportedClaims,
        },
      });

      // Rewrite the last assistant message in the message list
      const updated = messages.map(msg => {
        if (msg.role !== 'assistant') return msg;
        return {
          ...msg,
          content: {
            ...msg.content,
            parts: msg.content.parts?.map(part =>
              part.type === 'text' ? { ...part, text: result.correctedAnswer } : part,
            ),
          },
        };
      });
      return updated;
    }

    return messages;
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/agent && npx vitest run tests/processors/hallucination-verifier.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/processors/hallucination-verifier.ts packages/agent/tests/processors/hallucination-verifier.test.ts
git commit -m "feat: HallucinationVerifier processor class"
```

---

### Task 7: Wire Into Agent

**Files:**
- Modify: `packages/agent/src/index.ts:118-134`

- [ ] **Step 1: Add the import and register the processor**

At the top of `packages/agent/src/index.ts`, add:

```typescript
import { HallucinationVerifier } from './processors/hallucination-verifier.js';
```

Then create the instance before the agent definition:

```typescript
const hallucinationVerifier = new HallucinationVerifier();
```

Then update the `Agent` constructor to add `inputProcessors`, `outputProcessors`, and `maxProcessorRetries`:

```typescript
export const ncMedicaidAgent = new Agent({
  id: 'nc-medicaid-navigator',
  name: 'NC Medicaid Navigator',
  instructions: SYSTEM_PROMPT,
  model: createModel(AGENT_MODEL),
  tools: {
    searchSections,
    getSection,
    getDocument,
    getSectionContext,
    followReferences,
    getAmendments,
    findConceptSections,
    lookupPolicy,
  },
  memory,
  inputProcessors: [hallucinationVerifier],
  outputProcessors: [hallucinationVerifier],
  maxProcessorRetries: 2,
});
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run all existing tests to check for regressions**

Run: `cd packages/agent && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/index.ts
git commit -m "feat: register HallucinationVerifier in agent processors"
```

---

### Task 8: Manual Smoke Test

**Files:** None (testing only)

- [ ] **Step 1: Run a CLI question with verification enabled**

Run: `cd packages/agent && VERIFIER_ENABLED=true npx tsx src/index.ts "How many PT visits are allowed per year under Medicaid?"`

Expected: Agent runs, verifier fires on final answer (check console for `[HallucinationVerifier]` log messages), answer is returned. If verification finds unsupported claims, the agent should retry and produce a corrected answer.

- [ ] **Step 2: Run a CLI question with verification disabled**

Run: `cd packages/agent && VERIFIER_ENABLED=false npx tsx src/index.ts "How many PT visits are allowed per year under Medicaid?"`

Expected: Same answer, no verifier log messages, slightly faster.

- [ ] **Step 3: Run the answer eval to measure hallucination score change**

Run: `cd packages/pipeline && python -m pipeline eval --level answer`

Compare the hallucination dimension score against the baseline (~2.06). This is the key metric.

- [ ] **Step 4: Commit eval results if improved**

```bash
git add packages/pipeline/data/eval-results/
git commit -m "eval: hallucination verifier impact on answer quality"
```
