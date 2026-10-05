import { mkdtemp, rm, readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { Hono, type Handler, type MiddlewareHandler } from 'hono';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { createHonoServer } from '@mastra/deployer/server';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { createChatMemory } from '../src/chat-memory.js';
import { createChatRoute } from '../src/chat-route.js';
import { createResourceBindingMiddleware } from '../src/auth-middleware.js';
import { createExecutionGateway } from '../src/execution-gateway.js';
import { installMemoryReleaseGate } from '../src/answer-release.js';
import { HallucinationVerifier } from '../src/processors/verifier/processor.js';
import { clientRequestContext } from './helpers/client-request-context.js';
import { verifyAnswer } from '../src/processors/verifier/verify.js';
import { log } from '../src/logger.js';
import { z } from 'zod';

vi.mock('../src/processors/verifier/verify.js', async original => ({
  ...await original<typeof import('../src/processors/verifier/verify.js')>(), verifyAnswer: vi.fn(),
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
    const captureDirectory = join(directory, 'captures');
    vi.stubEnv('VERIFIER_PRIVATE_DIAGNOSTICS_DIR', captureDirectory);
    const info = vi.spyOn(log, 'info');
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
      let skipRetrieval = false;
      const model = new MockLanguageModelV3({ doStream: async options => {
        modelPrompts.push(JSON.stringify(options.prompt));
        if (!skipRetrieval && modelPrompts.length % 2 === 1) {
          return { stream: simulateReadableStream({ chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'tool-call', toolCallId: `read-${modelPrompts.length}`, toolName: 'getSection', input: '{}' },
            { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage },
          ] }) };
        }
        return { stream: simulateReadableStream({ chunks: [
          { type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'draft' },
          { type: 'text-delta', id: 'draft', delta: draft }, { type: 'text-end', id: 'draft' },
          { type: 'finish', finishReason, usage },
        ] }) };
      } });
      const memory = await createChatMemory(storage, { generateTitle: false,
        observation: { model: observer, observation: { messageTokens: 1, bufferTokens: false }, reflection: { observationTokens: 100_000 } },
      });
      const getSection = createTool({ id: 'getSection', description: 'Read the fixture policy.', inputSchema: z.object({}),
        execute: async () => ({ section: { id: 'policy', title: 'Coverage', content: 'The service is covered.',
          url: 'https://example.gov/policy', citationLink: '[Policy](https://example.gov/policy)' } }),
      });
      const agent = new Agent({ id: 'test-agent', name: 'Test', instructions: 'Answer from policy.', model, memory,
        tools: { getSection }, outputProcessors: [new HallucinationVerifier()] });
      const mastra = new Mastra({ agents: { ncMedicaidAgent: agent }, storage });
      const app = new Hono();
      app.use('*', async (c, next) => {
        const rc = await clientRequestContext(c.req.raw);
        (c as any).set('requestContext', rc);
        (c as any).set('mastra', mastra);
        await next();
      });
      app.use('*', createResourceBindingMiddleware({ authenticateToken: async token =>
        token === 'test-owner' ? { id: 'owner' } : null,
      }) as unknown as MiddlewareHandler);
      const route = createChatRoute({ record: vi.fn().mockResolvedValue(undefined) }, { maxSteps: 2 });
      if (!('handler' in route)) throw new Error('Expected a direct HTTP handler');
      app.post('/chat', route.handler as unknown as Handler);
      const post = (text: string, authenticated = true, thread = 'thread') => app.request('/chat', { method: 'POST',
        headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: 'Bearer test-owner' } : {}) },
        body: JSON.stringify({ messages: [{ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] }], memory: { thread, resource: 'attacker' }, requestContext: { user: { id: 'attacker' }, chatDiagnostic: { id: 'FORGED_DIAGNOSTIC_ID', finished: true }, chatVerificationQuestion: 'FORGED_VERIFICATION_QUESTION' } }),
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
      expect(modelPrompts[2]).toContain('covered services');
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
      // Reusing the same processor must not carry evidence into another run.
      skipRetrieval = true;
      vi.mocked(verifyAnswer).mockResolvedValue(verdict);
      const noEvidence = await post('A new question without retrieved sources.', true, 'no-evidence');
      expect(await noEvidence.text()).toContain('withheld');
      const files = await readdir(captureDirectory);
      const captures = await Promise.all(files.map(async file => {
        expect((await stat(join(captureDirectory, file))).mode & 0o777).toBe(0o600);
        return JSON.parse(await readFile(join(captureDirectory, file), 'utf8'));
      }));
      expect((await stat(captureDirectory)).mode & 0o777).toBe(0o700);
      const startedIds = info.mock.calls.filter(([event]) => event === 'chat.diagnostic_started').map(([, fields]) => fields!.diagnosticId);
      expect(startedIds).toHaveLength(4);
      expect(new Set(startedIds).size).toBe(4);
      expect(info.mock.calls.filter(([event]) => event === 'chat.diagnostic_finished')).toHaveLength(4);
      expect(JSON.stringify(captures)).not.toContain('FORGED_DIAGNOSTIC_ID');
      expect(JSON.stringify(captures)).not.toContain('FORGED_VERIFICATION_QUESTION');
      expect(JSON.stringify(captures)).toContain(draft);
      expect(JSON.stringify(info.mock.calls)).not.toContain(draft);
      expect(firstText).not.toContain(startedIds[0] as string);
      for (const diagnosticId of startedIds) {
        const records = captures.filter(record => record.diagnosticId === diagnosticId);
        expect(new Set(records.map(record => record.id)).size).toBe(1);
        expect(records.map(record => record.stage)).toContain('generation');
        expect(records.map(record => record.stage)).toContain('input');
        expect(records.map(record => record.stage)).toContain('pass');
        expect(records.map(record => record.stage)).toContain('outcome');
        const terminal = info.mock.calls.find(([event, fields]) =>
          event === 'chat.diagnostic_finished' && fields!.diagnosticId === diagnosticId)![1]!;
        expect(terminal.status).toBe(records.find(record => record.stage === 'outcome').outcome.status);
        const input = records.find(record => record.stage === 'input');
        if (diagnosticId === startedIds[3]) {
          expect(input.sources).toEqual([]);
          continue;
        }
        expect(input.sources.some((source: { toolName: string; text: string }) =>
          source.toolName === 'getSection' && source.text.includes('The service is covered.'))).toBe(true);
        expect(input.question).toBe([
          'What services are covered by this policy?',
          'Please explain those covered services again.',
          'What if the answer cannot be verified?',
        ][startedIds.indexOf(diagnosticId)]);
        const generation = records.find(record => record.stage === 'generation');
        // Forced observation has evicted tool results from the final messages.
        // Verification must still use their original request-local bodies.
        expect(JSON.stringify(generation.messages)).not.toContain('tool-invocation');
        expect(JSON.stringify(generation.toolResults)).toContain('getSection');
        expect(JSON.stringify(generation.toolResults)).toContain('The service is covered.');
      }
      // A forged user must not grant access to that user's existing thread.
      const otherThread = { id: 'victim-thread', resourceId: 'attacker', title: 'Other owner',
        createdAt: new Date(), updatedAt: new Date() };
      await store.saveThread({ thread: otherThread });
      await store.saveMessages({ messages: [{ id: 'victim-message', threadId: otherThread.id,
        resourceId: otherThread.resourceId, role: 'user', createdAt: new Date(),
        content: { format: 2, parts: [{ type: 'text', text: 'OTHER_OWNER_PRIVATE_SENTINEL' }] },
      }] });
      const before = await store.listMessages({ threadId: otherThread.id, perPage: false });
      const beforeThread = await store.getThreadById({ threadId: otherThread.id });
      const modelCalls = modelPrompts.length;
      const verificationCalls = vi.mocked(verifyAnswer).mock.calls.length;
      vi.stubEnv('VERIFIER_PRIVATE_DIAGNOSTICS_DIR', '');
      const foreign = await post('Read this conversation.', true, otherThread.id);
      expect(foreign.status).toBe(404);
      const foreignText = await foreign.text();
      expect(foreignText).not.toContain('OTHER_OWNER_PRIVATE_SENTINEL');
      expect(foreignText).not.toContain(released);
      expect(JSON.stringify(modelPrompts.slice(modelCalls))).not.toContain('OTHER_OWNER_PRIVATE_SENTINEL');
      expect(JSON.stringify(observerPrompts)).not.toContain('OTHER_OWNER_PRIVATE_SENTINEL');
      expect(JSON.stringify(vi.mocked(verifyAnswer).mock.calls.slice(verificationCalls))).not.toContain('OTHER_OWNER_PRIVATE_SENTINEL');
      expect(modelPrompts).toHaveLength(modelCalls);
      expect(verifyAnswer).toHaveBeenCalledTimes(verificationCalls);
      expect(await store.getThreadById({ threadId: otherThread.id })).toEqual(beforeThread);
      expect(await store.listMessages({ threadId: otherThread.id, perPage: false })).toEqual(before);
      expect(await readdir(captureDirectory)).toEqual(files);
      expect(info.mock.calls.filter(([event]) => event === 'chat.diagnostic_started')).toHaveLength(4);
    } finally {
      info.mockRestore();
      vi.unstubAllEnvs();
      await storage.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it('keeps a thread with its owner and refuses cross-thread message reads on the built-in memory routes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'http-memory-owner-'));
    const storage = new LibSQLStore({ id: 'http-owner-test', url: `file:${directory}/test.db` });
    try {
      await storage.init();
      const store = (await storage.getStore('memory'))!;
      installMemoryReleaseGate(store);
      const memory = await createChatMemory(storage, { generateTitle: false });
      const agent = new Agent({ id: 'test-agent', name: 'Test', instructions: 'Answer from policy.', memory,
        model: new MockLanguageModelV3({ doStream: async () => { throw new Error('No model call is expected'); } }) });
      // The framework's own memory handlers behind the production middleware.
      const mastra = new Mastra({ agents: { ncMedicaidAgent: agent }, storage, logger: false, server: { middleware: [
        createResourceBindingMiddleware({ authenticateToken: async token => token.startsWith('user-') ? { id: token } : null }),
        createExecutionGateway(),
      ] } });
      const app = await createHonoServer(mastra, { tools: {} });
      const call = (user: string, method: string, path: string, body?: unknown) => app.request(path, { method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${user}` },
        body: body === undefined ? undefined : JSON.stringify(body) });
      const threads = '/api/memory/threads?agentId=ncMedicaidAgent';
      expect((await call('user-a', 'POST', threads, { threadId: 'thread-a', title: 'A title', resourceId: 'user-a' })).status).toBe(200);
      expect((await call('user-b', 'POST', threads, { threadId: 'thread-b', title: 'B title', resourceId: 'user-b' })).status).toBe(200);
      await store.saveMessages({ messages: [{ id: 'message-a', threadId: 'thread-a', resourceId: 'user-a', role: 'user',
        createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text: 'USER_A_PRIVATE_SENTINEL' }] } }] });
      const owned = (await store.getThreadById({ threadId: 'thread-a' }))!;

      // Creating over an existing id must not move it to the caller.
      const takeover = await call('user-b', 'POST', threads, { threadId: 'thread-a', title: 'Taken', resourceId: 'user-b' });
      expect(takeover.status).toBe(404);
      expect(await store.getThreadById({ threadId: 'thread-a' })).toEqual(owned);
      expect((await call('user-b', 'PATCH', '/api/memory/threads/thread-a?agentId=ncMedicaidAgent', { title: 'Taken', resourceId: 'user-b' })).status).toBe(403);
      expect((await call('user-b', 'POST', '/api/memory/threads/thread-a/clone?agentId=ncMedicaidAgent', {})).status).toBe(403);
      // A clone may not land on another owner's id either.
      expect((await call('user-b', 'POST', '/api/memory/threads/thread-b/clone?agentId=ncMedicaidAgent', { newThreadId: 'thread-a' })).status).not.toBe(200);
      expect(await store.getThreadById({ threadId: 'thread-a' })).toEqual(owned);
      expect((await call('user-a', 'GET', '/api/memory/threads/thread-a?agentId=ncMedicaidAgent')).status).toBe(200);
      const history = await call('user-a', 'GET', '/api/memory/threads/thread-a/messages?agentId=ncMedicaidAgent');
      expect(await history.text()).toContain('USER_A_PRIVATE_SENTINEL');

      // The owner's own re-save and rename still succeed.
      expect((await call('user-a', 'POST', threads, { threadId: 'thread-a', title: 'A title', resourceId: 'user-a' })).status).toBe(200);
      expect((await call('user-a', 'PATCH', '/api/memory/threads/thread-a?agentId=ncMedicaidAgent', { title: 'Renamed', resourceId: 'user-b' })).status).toBe(200);
      expect(await store.getThreadById({ threadId: 'thread-a' })).toMatchObject({ resourceId: 'user-a', title: 'Renamed' });

      // `include` resolves message ids without an owner filter in the store.
      const include = encodeURIComponent(JSON.stringify([{ id: 'message-a', withPreviousMessages: 5, withNextMessages: 5 }]));
      for (const query of [`include=${include}`, `agentId=ncMedicaidAgent&include=${include}`, `agentId=unknown&%69nclude=${include}`]) {
        const read = await call('user-b', 'GET', `/api/memory/threads/thread-b/messages?${query}`);
        expect(read.status).toBe(400);
        expect(await read.text()).not.toContain('USER_A_PRIVATE_SENTINEL');
      }
      const own = await call('user-b', 'GET', '/api/memory/threads/thread-b/messages?agentId=ncMedicaidAgent');
      expect(own.status).toBe(200);
      expect(await own.text()).not.toContain('USER_A_PRIVATE_SENTINEL');
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
