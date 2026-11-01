import { WITHHELD_ANSWER } from '@nc-medicaid/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HallucinationVerifier } from '../../src/processors/verifier/processor.js';
import type { VerificationResult } from '../../src/processors/verifier/verify.js';
import type { AnswerAuditRecord } from '../../src/storage/answer-audit.js';
import type { UsageEvent } from '../../src/usage/repository.js';
import { AGENT_MODEL } from '../../src/model.js';
import { log } from '../../src/logger.js';

vi.mock('ai', async original => ({ ...await original<typeof import('ai')>(), generateObject: vi.fn() }));
import { generateObject } from 'ai';

const QUESTION = 'QUESTION_SENTINEL about dental visits?';
const LINK = 'https://example.gov/policy';
// The claim the verifier quotes is a short excerpt; the sentinel sentence is the rest of the draft.
const CLAIM = 'Adults get 40 dental visits a year';
const DRAFT = `${CLAIM}. DRAFT_SENTINEL_NEVER_STORED and more unsupported prose. [Policy](${LINK})`;
const CORRECTED = `Adults get 8 dental visits a year. [Policy](${LINK})`;
const EVIDENCE = 'EVIDENCE_SENTINEL Adults get 8 dental visits a year.';
const clean: VerificationResult = { supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [],
  missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };
const finding = { claim: CLAIM, reason: 'The source says 8 visits' };
const tokens = (inputTokens: number) => ({ inputTokens, outputTokens: 40, totalTokens: inputTokens + 40, reasoningTokens: 5, cachedInputTokens: 100 });

function messages(text: string) {
  return [
    { id: 'user-message', role: 'user', threadId: 'thread-1', resourceId: 'user-1', createdAt: new Date(),
      content: { format: 2, parts: [{ type: 'text', text: QUESTION }] } },
    { id: 'assistant-message', role: 'assistant', threadId: 'thread-1', resourceId: 'user-1', createdAt: new Date(),
      content: { format: 2, parts: [
        { type: 'tool-invocation', toolInvocation: { state: 'result', toolCallId: 'read', toolName: 'getSection', args: {},
          result: { section: { id: 'policy', title: 'Dental', content: EVIDENCE, url: LINK, citationLink: `[Policy](${LINK})` } } } },
        { type: 'text', text },
      ] } },
  ];
}

async function run(verdicts: VerificationResult[], text = DRAFT, owner: { threadId?: string; resourceId?: string } = {}) {
  vi.mocked(generateObject).mockReset();
  verdicts.forEach((object, index) => vi.mocked(generateObject).mockResolvedValueOnce({ object, usage: tokens(1000 * (index + 1)) } as never));
  const usage: UsageEvent[] = [];
  const records: AnswerAuditRecord[] = [];
  const verifier = new HallucinationVerifier({
    usage: { record: async event => { usage.push(event); } },
    audit: { record: async record => { records.push(record); } },
  });
  const input = messages(text).map(message => ({ ...message, ...('threadId' in owner || 'resourceId' in owner ? owner : {}) }));
  const written: Array<{ type: string; data: Record<string, unknown> }> = [];
  const released = await verifier.processOutputStep({ text, finishReason: 'stop', toolCalls: [], messages: input, steps: [],
    writer: { custom: async (part: never) => { written.push(part); } }, state: {} } as never);
  return { usage, records, written, released };
}

describe('the chat verification record', () => {
  const info = vi.spyOn(log, 'info');
  beforeEach(() => {
    info.mockClear();
    vi.stubEnv('CORPUS_RELEASE_ID', 'release-7');
  });

  it('records a passed answer with its telemetry and no findings', async () => {
    const { records } = await run([clean], CORRECTED);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ messageId: 'assistant-message', threadId: 'thread-1', resourceId: 'user-1',
      outcome: { status: 'passed', passCount: 1 }, corpusRelease: 'release-7', agentModel: AGENT_MODEL,
      usage: [tokens(1000)] });
    expect(records[0].telemetry).toMatchObject({ pass_count: 1, verifier_model: 'gpt-6.1-terra', source_entry_count: 1,
      evidence_chars_sent: expect.any(Number), latency_ms: expect.any(Number), unsupported_claim_count: 0 });
    expect(records[0].findings).toEqual([{ pass: 1, unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [],
      unknownUrls: [], unknownQuotes: [] }]);
  });

  it('records what the first pass found on a corrected answer, and the clean recheck', async () => {
    const { records, usage } = await run([{ ...clean, supported: false, unsupportedClaims: [finding], correctedAnswer: CORRECTED,
      missingCitationClaims: [{ claim: 'Uncited claim', suggestedCitation: `[Policy](${LINK})` }],
      relevanceIssues: [{ issue: 'Could say more', severity: 'minor' }] }, clean]);
    expect(records[0].outcome).toEqual({ status: 'corrected', passCount: 2 });
    expect(records[0].findings).toEqual([
      { pass: 1, unsupportedClaims: [finding], missingCitationClaims: [{ claim: 'Uncited claim', suggestedCitation: `[Policy](${LINK})` }],
        relevanceIssues: [{ issue: 'Could say more', severity: 'minor' }], unknownUrls: [], unknownQuotes: [] },
      { pass: 2, unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], unknownUrls: [], unknownQuotes: [] },
    ]);
    expect(records[0].usage).toEqual([tokens(1000), tokens(2000)]);
    // One usage row per model call, attributed to the thread's owner.
    expect(usage).toEqual([1000, 2000].map(inputTokens => ({ userId: 'user-1', route: 'chat', phase: 'verifier', threadId: 'thread-1',
      modelId: 'gpt-6.1-terra', provider: 'openai', ...tokens(inputTokens) })));
  });

  it('records a withheld answer with the failing findings and without the draft, the correction, the question or the evidence', async () => {
    const unknown = 'https://example.gov/invented';
    const { records, released, written } = await run([
      { ...clean, supported: false, unsupportedClaims: [finding], correctedAnswer: `${CORRECTED} REJECTED_CORRECTION_SENTINEL [Other](${unknown})` },
      { ...clean, supported: false, unsupportedClaims: [{ claim: 'Full answer', reason: 'Still unsupported' }] },
    ]);
    expect(JSON.stringify(released)).toContain(WITHHELD_ANSWER);
    expect(records[0].outcome).toEqual({ status: 'withheld', reason: 'invalid_citation', passCount: 2 });
    expect(records[0].findings.map(pass => pass.unsupportedClaims)).toEqual([[finding], [{ claim: 'Full answer', reason: 'Still unsupported' }]]);
    expect(records[0].findings[1].unknownUrls).toEqual([unknown]);
    const stored = JSON.stringify(records[0]);
    expect(stored).toContain(CLAIM);
    for (const text of ['DRAFT_SENTINEL_NEVER_STORED', 'REJECTED_CORRECTION_SENTINEL', 'QUESTION_SENTINEL', 'EVIDENCE_SENTINEL', 'correctedAnswer']) {
      expect(stored).not.toContain(text);
    }
    // The record is not a stream field: the browser still gets the outcome and the fixed notice only.
    expect(written.at(-1)).toEqual({ type: 'data-verification-status',
      data: { status: 'withheld', reason: 'invalid_citation', passCount: 2, answer: WITHHELD_ANSWER } });
  });

  it('bounds the text one finding can hold, so a finding cannot carry the whole draft', async () => {
    const { records } = await run([{ ...clean, supported: false,
      unsupportedClaims: [{ claim: 'c'.repeat(5000), reason: 'r'.repeat(5000) }, ...Array.from({ length: 80 }, () => finding)] }]);
    const [pass] = records[0].findings;
    expect(pass.unsupportedClaims).toHaveLength(50);
    expect(pass.unsupportedClaims[0]).toEqual({ claim: 'c'.repeat(500), reason: 'r'.repeat(500) });
  });

  it('logs the thread and message ids with the outcome, and no text', async () => {
    await run([{ ...clean, supported: false, unsupportedClaims: [finding] }]);
    const lines = info.mock.calls.filter(([event]) => event === 'chat.verification');
    expect(lines).toEqual([['chat.verification', { threadId: 'thread-1', messageId: 'assistant-message', status: 'withheld',
      reason: 'unusable_correction', passCount: 1, latencyMs: expect.any(Number) }]]);
    const logged = JSON.stringify(info.mock.calls);
    for (const text of [CLAIM, 'DRAFT_SENTINEL', 'QUESTION_SENTINEL', 'EVIDENCE_SENTINEL']) expect(logged).not.toContain(text);
  });

  it('writes nothing when the answer has no owner to attribute it to', async () => {
    const { records, usage, written } = await run([clean], CORRECTED, { threadId: undefined, resourceId: undefined });
    expect(records).toEqual([]);
    expect(usage).toEqual([]);
    expect(written.at(-1)!.data.status).toBe('passed');
  });

  it('releases the answer when the record and usage writes fail or never settle', async () => {
    vi.mocked(generateObject).mockReset();
    vi.mocked(generateObject).mockResolvedValueOnce({ object: clean, usage: tokens(1000) } as never);
    const verifier = new HallucinationVerifier({
      usage: { record: () => new Promise<void>(() => {}) },
      audit: { record: () => Promise.reject(new Error('database is locked')) },
    });
    const written: Array<{ data: Record<string, unknown> }> = [];
    await verifier.processOutputStep({ text: CORRECTED, finishReason: 'stop', toolCalls: [], messages: messages(CORRECTED), steps: [],
      writer: { custom: async (part: never) => { written.push(part); } }, state: {} } as never);
    expect(written.at(-1)!.data).toEqual({ status: 'passed', passCount: 1, answer: CORRECTED });
  });
});
