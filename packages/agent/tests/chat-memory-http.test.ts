import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { Hono, type Handler } from 'hono';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { RequestContext, MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context';
import { LibSQLStore } from '@mastra/libsql';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { createChatMemory } from '../src/chat-memory.js';
import { createChatRoute } from '../src/chat-route.js';
import { installMemoryReleaseGate } from '../src/answer-release.js';
import { HallucinationVerifier } from '../src/processors/verifier/processor.js';
import { verifyAnswer } from '../src/processors/verifier/verify.js';

vi.mock('../src/processors/verifier/verify.js', async original => ({
  ...await original<typeof import('../src/processors/verifier/verify.js')>(), verifyAnswer: vi.fn(),
}));
vi.mock('../src/processors/verifier/evidence.js', async original => ({
  ...await original<typeof import('../src/processors/verifier/evidence.js')>(),
  extractSources: () => [{ key: 'policy', toolName: 'getSection', text: 'The service is covered.', link: 'https://example.gov/policy' }],
}));

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const finishReason = { unified: 'stop' as const, raw: 'stop' };
const verdict = { supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };

describe('production HTTP handler with guarded observational memory', () => {
  it('observes fresh and subsequent turns without leaking drafts or losing thread state', async () => {
    const draft = 'PRIVATE_DRAFT_SENTINEL';
    const released = 'The service is covered. [Policy](https://example.gov/policy)';
    // Each draft requires a corrected release and its exact-text recheck.
    vi.mocked(verifyAnswer).mockImplementation(async (_question, text) => text === released ? verdict : { ...verdict, supported: false, correctedAnswer: released });
    const directory = await mkdtemp(join(tmpdir(), 'http-memory-'));
    const storage = new LibSQLStore({ id: 'http-test', url: `file:${directory}/test.db` });
    try {
      await storage.init();
      const store = (await storage.getStore('memory'))!;
      installMemoryReleaseGate(store);
      const observerPrompts: string[] = [];
      const observedText = '<observations>\nDate: Oct 2, 2026\n* 🔴 User asks about covered services.\n</observations>\n<current-task>Explain covered services.</current-task>';
      const observer = new MockLanguageModelV3({ doStream: async options => {
        observerPrompts.push(JSON.stringify(options.prompt));
        return { stream: simulateReadableStream({ chunks: [
          { type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'observe' },
          { type: 'text-delta', id: 'observe', delta: observedText }, { type: 'text-end', id: 'observe' },
          { type: 'finish', finishReason, usage },
        ] }) };
      } });
      const modelPrompts: string[] = [];
      const model = new MockLanguageModelV3({ doStream: async options => {
        modelPrompts.push(JSON.stringify(options.prompt));
        return { stream: simulateReadableStream({ chunks: [
          { type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'draft' },
          { type: 'text-delta', id: 'draft', delta: draft }, { type: 'text-end', id: 'draft' },
          { type: 'finish', finishReason, usage },
        ] }) };
      } });
      const memory = await createChatMemory(storage, { generateTitle: false,
        observation: { model: observer, observation: { messageTokens: 1, bufferTokens: false }, reflection: { observationTokens: 100_000 } },
      });
      const agent = new Agent({ id: 'test-agent', name: 'Test', instructions: 'Answer from policy.', model, memory, outputProcessors: [new HallucinationVerifier()] });
      const mastra = new Mastra({ agents: { ncMedicaidAgent: agent }, storage });
      const app = new Hono();
      app.use('*', async (c, next) => {
        const rc = new RequestContext();
        if (c.req.header('authorization') === 'Bearer test-owner') rc.set(MASTRA_RESOURCE_ID_KEY, 'owner');
        (c as any).set('requestContext', rc);
        (c as any).set('mastra', mastra);
        await next();
      });
      const route = createChatRoute({ record: vi.fn().mockResolvedValue(undefined) }, { maxSteps: 2 });
      if (!('handler' in route)) throw new Error('Expected a direct HTTP handler');
      app.post('/chat', route.handler as unknown as Handler);
      const post = (text: string, authenticated = true) => app.request('/chat', { method: 'POST',
        headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: 'Bearer test-owner' } : {}) },
        body: JSON.stringify({ messages: [{ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] }], memory: { thread: 'thread', resource: 'attacker' } }),
      });
      expect((await post('What is covered?', false)).status).toBe(401);
      const first = await post('What services are covered by this policy?');
      expect(first.status).toBe(200);
      const firstText = await first.text();
      expect(firstText).toContain('corrected');
      expect(firstText).toContain(released);
      expect(firstText).not.toContain(draft);
      const thread = (await store.getThreadById({ threadId: 'thread' }))!;
      expect(thread.resourceId).toBe('owner');
      await store.patchThread({ id: 'thread', metadata: { ...thread.metadata, retained: 'keep' } });
      const second = await post('Please explain those covered services again.');
      const secondText = await second.text();
      expect(secondText).toContain(released);
      expect(secondText).not.toContain(draft);
      expect(observerPrompts.length).toBeGreaterThan(0);
      expect(JSON.stringify(observerPrompts)).not.toContain(draft);
      expect(JSON.stringify(modelPrompts)).not.toContain(draft);
      expect(modelPrompts[1]).toContain('covered services');
      const updated = (await store.getThreadById({ threadId: 'thread' }))!;
      expect(updated.title).toBe(thread.title);
      expect(updated.metadata?.retained).toBe('keep');
      const observation = await store.getObservationalMemory('thread', 'owner');
      expect(observation?.activeObservations).toContain('covered services');
      expect(JSON.stringify(observation)).not.toContain(draft);
      await vi.waitFor(async () => {
        const history = await store.listMessages({ threadId: 'thread', perPage: false });
        expect(JSON.stringify(history)).toContain(released);
        expect(JSON.stringify(history)).not.toContain(draft);
      });
      vi.mocked(verifyAnswer).mockResolvedValue({ ...verdict, supported: false });
      const withheld = await post('What if the answer cannot be verified?');
      const withheldText = await withheld.text();
      expect(withheldText).toContain('withheld');
      expect(withheldText).not.toContain(draft);
      expect(JSON.stringify(await store.listMessages({ threadId: 'thread', perPage: false }))).not.toContain(draft);
      expect(JSON.stringify(await store.cloneThread({ sourceThreadId: 'thread' }))).not.toContain(draft);
    } finally {
      await storage.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it('rejects an incompatible observational-memory store before serving chat', async () => {
    const storage = { getStore: vi.fn().mockResolvedValue({}) } as unknown as LibSQLStore;
    await expect(createChatMemory(storage)).rejects.toThrow('patchThread');
  });
});
