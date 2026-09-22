import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { handleChatStream } from '@mastra/ai-sdk';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { HallucinationVerifier } from '../src/processors/verifier/processor.js';
import { gateAnswerStream, installMemoryReleaseGate } from '../src/answer-release.js';
import { verifyAnswer } from '../src/processors/verifier/verify.js';

vi.mock('../src/processors/verifier/verify.js', async original => ({
  ...await original<typeof import('../src/processors/verifier/verify.js')>(), verifyAnswer: vi.fn(),
}));
vi.mock('../src/processors/verifier/evidence.js', async original => ({
  ...await original<typeof import('../src/processors/verifier/evidence.js')>(),
  extractSources: () => [{ key: 'policy', toolName: 'getSection', text: 'The service is covered.', link: 'https://example.gov/policy' }],
}));

describe('real Mastra chat release boundary', () => {
  it('persists and streams the corrected release without exposing the model draft', async () => {
    const PRIVATE = 'PRIVATE_DRAFT_SENTINEL';
    const released = 'The service is covered. [Policy](https://example.gov/policy)';
    const verdict = { supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [],
      missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };
    vi.mocked(verifyAnswer).mockResolvedValueOnce({ ...verdict, supported: false, correctedAnswer: released }).mockResolvedValueOnce(verdict);
    const directory = await mkdtemp(join(tmpdir(), 'answer-release-'));
    const storage = new LibSQLStore({ id: 'test', url: `file:${directory}/test.db` });
    await storage.init();
    const memoryStore = (await storage.getStore('memory'))!;
    installMemoryReleaseGate(memoryStore);
    const model = new MockLanguageModelV3({ doStream: { stream: simulateReadableStream({ chunks: [
      { type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'draft' },
      { type: 'text-delta', id: 'draft', delta: PRIVATE }, { type: 'text-end', id: 'draft' },
      { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } } },
    ] }) } });
    const agent = new Agent({ id: 'test-agent', name: 'Test', instructions: 'Answer the question.', model,
      memory: new Memory({ storage, options: { generateTitle: false, workingMemory: { enabled: false } } }),
      outputProcessors: [new HallucinationVerifier()],
    });
    const mastra = new Mastra({ agents: { agent }, storage });
    const raw = await handleChatStream({ mastra, agentId: 'test-agent', version: 'v6',
      params: { messages: [{ id: 'user', role: 'user', parts: [{ type: 'text', text: 'What is covered?' }] }],
        memory: { thread: 'thread', resource: 'owner' } }, defaultOptions: { savePerStep: true } });
    const chunks = [];
    for await (const chunk of gateAnswerStream(raw)) chunks.push(chunk);
    expect(JSON.stringify(chunks)).not.toContain(PRIVATE);
    expect(JSON.stringify(chunks)).toContain(released);
    await vi.waitFor(async () => {
      const messages = await memoryStore.listMessages({ threadId: 'thread', perPage: false });
      expect(JSON.stringify(messages)).not.toContain(PRIVATE);
      expect(JSON.stringify(messages)).toContain(released);
    });
    const clone = await memoryStore.cloneThread({ sourceThreadId: 'thread' });
    expect(JSON.stringify(clone)).not.toContain(PRIVATE);
    expect(JSON.stringify(clone)).toContain(released);
    await storage.close();
    await rm(directory, { recursive: true, force: true });
  });
});
