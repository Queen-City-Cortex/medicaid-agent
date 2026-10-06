import { mkdtemp, rm, readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { Hono, type Handler, type MiddlewareHandler } from 'hono';
import { createClient } from '@libsql/client';
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
      // The rows as stored, not as the gate redacts them on the way out.
      const storedMessages = Object.getPrototypeOf(store).listMessages.bind(store) as typeof store.listMessages;
      installMemoryReleaseGate(store);
      const observerPrompts: string[] = [];
      const observerSentinel = 'OBSERVER_PRIVATE_SENTINEL';
      const observedText = `<observations>\nDate: Oct 2, 2026\n* 🔴 User asks about covered services. ${observerSentinel}\n</observations>\n<current-task>Explain covered services. ${observerSentinel}</current-task>\n<suggested-response>Tell the user ${observerSentinel} covers unlimited visits.</suggested-response>`;
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
      const memory = await createChatMemory(storage, { generateTitle: false, observationalMemoryEnabled: true,
        observation: { model: observer, observation: { messageTokens: 1, bufferTokens: false }, reflection: { observationTokens: 100_000 } },
      });
      const getSection = createTool({ id: 'getSection', description: 'Read the fixture policy.', inputSchema: z.object({}),
        execute: async () => ({ section: { id: 'policy', title: 'Coverage', content: 'The service is covered.',
          url: 'https://example.gov/policy', citationLink: '[Policy](https://example.gov/policy)' } }),
      });
      const agent = new Agent({ id: 'test-agent', name: 'Test', instructions: 'Answer from policy.', model, memory,
        tools: { getSection }, outputProcessors: [new HallucinationVerifier()] });
      const authenticateToken = async (token: string) => token === 'test-owner' ? { id: 'owner' } : null;
      const mastra = new Mastra({ agents: { ncMedicaidAgent: agent }, storage, server: { middleware: [
        createResourceBindingMiddleware({ authenticateToken }), createExecutionGateway(),
      ] } });
      const app = new Hono();
      app.use('*', async (c, next) => {
        const rc = await clientRequestContext(c.req.raw);
        (c as any).set('requestContext', rc);
        (c as any).set('mastra', mastra);
        await next();
      });
      app.use('*', createResourceBindingMiddleware({ authenticateToken }) as unknown as MiddlewareHandler);
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
      expect(firstText).toContain('tool-output-available');
      expect(firstText).not.toContain(observerSentinel);
      expect(firstText).not.toContain('data-om-');
      const thread = (await store.getThreadById({ threadId: 'thread' }))!;
      expect(thread.resourceId).toBe('owner');
      await store.patchThread({ id: 'thread', metadata: { ...thread.metadata, retained: 'keep' } });
      const second = await post('Please explain those covered services again.');
      const secondText = await second.text();
      expect(secondText).toContain(released);
      expect(secondText).not.toContain(draft);
      expect(secondText).not.toContain(observerSentinel);
      expect(secondText).not.toContain('data-om-');
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
        expect(JSON.stringify(history)).not.toContain(observerSentinel);
        expect(JSON.stringify(await storedMessages({ threadId: 'thread', perPage: false }))).not.toContain(observerSentinel);
      });
      // The framework keeps the observer's hints in thread metadata and reads
      // them back, so they stay in storage and are removed from responses.
      expect(JSON.stringify((await store.getThreadById({ threadId: 'thread' }))!.metadata?.mastra)).toContain(observerSentinel);
      const memoryRoutes = await createHonoServer(mastra, { tools: {} });
      const memoryCall = (method: string, path: string, body?: unknown) => memoryRoutes.request(`/api/memory/threads${path}`, { method,
        headers: { 'content-type': 'application/json', authorization: 'Bearer test-owner' },
        body: body === undefined ? undefined : JSON.stringify(body) });
      for (const path of ['/thread?agentId=ncMedicaidAgent', '?agentId=ncMedicaidAgent&resourceId=owner']) {
        const response = await memoryCall('GET', path);
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain('"retained":"keep"');
        expect(body).not.toContain(observerSentinel);
        expect(body).not.toContain('"mastra"');
      }
      // A rename sends the title alone, and must leave the stored metadata intact.
      const renamed = await memoryCall('PATCH', '/thread?agentId=ncMedicaidAgent', { title: 'Renamed in the sidebar' });
      expect(renamed.status).toBe(200);
      expect(await renamed.text()).not.toContain(observerSentinel);
      expect(await store.getThreadById({ threadId: 'thread' })).toMatchObject({ title: 'Renamed in the sidebar', metadata: updated.metadata });
      expect(updated.metadata?.mastra).toBeDefined();
      // The framework sends `metadata.mastra.om` to the model as system
      // messages, so a client may not write thread metadata at all.
      const planted = 'PLANTED_METADATA_SENTINEL';
      const plantedMetadata = { mastra: { om: { currentTask: planted, suggestedResponse: planted } } };
      for (const body of [{ title: 'Planted', metadata: plantedMetadata }, { metadata: plantedMetadata }, { title: 'Planted', metadata: {} }]) {
        const refused = await memoryCall('PATCH', '/thread?agentId=ncMedicaidAgent', body);
        expect(refused.status).toBe(400);
        expect(await refused.text()).not.toContain(planted);
      }
      expect(await store.getThreadById({ threadId: 'thread' })).toMatchObject({ title: 'Renamed in the sidebar', metadata: updated.metadata });
      const promptsBeforePlanting = modelPrompts.length;
      vi.mocked(verifyAnswer).mockResolvedValue({ ...verdict, supported: false });
      const withheld = await post('What if the answer cannot be verified?');
      const withheldText = await withheld.text();
      expect(modelPrompts.length).toBeGreaterThan(promptsBeforePlanting);
      // The observer's own hints are in these prompts; the client's text is not.
      expect(JSON.stringify(modelPrompts.slice(promptsBeforePlanting))).toContain('<current-task>');
      expect(JSON.stringify(modelPrompts)).not.toContain(planted);
      expect(JSON.stringify(observerPrompts)).not.toContain(planted);
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

  it('keeps observer text and raw tool errors out of the stream and stored rows under default observation thresholds', async () => {
    const observerSentinel = 'OBSERVER_PRIVATE_SENTINEL';
    const released = 'The service is covered. [Policy](https://example.gov/policy)';
    vi.mocked(verifyAnswer).mockResolvedValue(verdict);
    const storage = new LibSQLStore({ id: 'http-buffer-test', url: ':memory:' });
    try {
      await storage.init();
      const store = (await storage.getStore('memory'))!;
      const storedMessages = Object.getPrototypeOf(store).listMessages.bind(store) as typeof store.listMessages;
      installMemoryReleaseGate(store);
      const stream = (chunks: unknown[]) => ({ stream: simulateReadableStream({ chunks: [{ type: 'stream-start', warnings: [] }, ...chunks] }) }) as never;
      const observer = new MockLanguageModelV3({ doStream: async () => stream([{ type: 'text-start', id: 'observe' },
        { type: 'text-delta', id: 'observe', delta: `<observations>\n* 🔴 ${observerSentinel}\n</observations>` },
        { type: 'text-end', id: 'observe' }, { type: 'finish', finishReason, usage }]) });
      let calls = 0;
      const model = new MockLanguageModelV3({ doStream: async () => ++calls % 2 === 1
        ? stream([{ type: 'tool-input-start', id: `read-${calls}`, toolName: 'getSection' },
          { type: 'tool-input-delta', id: `read-${calls}`, delta: '{}' }, { type: 'tool-input-end', id: `read-${calls}` },
          { type: 'tool-call', toolCallId: `read-${calls}`, toolName: 'getSection', input: '{}' },
          { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage }])
        : stream([{ type: 'text-start', id: 'draft' }, { type: 'text-delta', id: 'draft', delta: released },
          { type: 'text-end', id: 'draft' }, { type: 'finish', finishReason, usage }]) });
      let failing = false;
      // One result large enough to start the observer's background buffering.
      const getSection = createTool({ id: 'getSection', description: 'Read the fixture policy.', inputSchema: z.object({}),
        execute: async () => {
          if (failing) throw new Error('Failed to connect to bolt://neo4j-blue.railway.internal:7687 as neo4j');
          return { section: { id: 'policy', title: 'Coverage', content: `The service is covered. ${'Policy text about coverage. '.repeat(1800)}`,
            url: 'https://example.gov/policy', citationLink: '[Policy](https://example.gov/policy)' } };
        } });
      const memory = await createChatMemory(storage, { generateTitle: false, observationalMemoryEnabled: true, observation: { model: observer } });
      const agent = new Agent({ id: 'test-agent', name: 'Test', instructions: 'Answer from policy.', model, memory,
        tools: { getSection }, outputProcessors: [new HallucinationVerifier()] });
      const mastra = new Mastra({ agents: { ncMedicaidAgent: agent }, storage, logger: false });
      const app = new Hono();
      app.use('*', async (c, next) => {
        (c as any).set('requestContext', await clientRequestContext(c.req.raw));
        (c as any).set('mastra', mastra);
        await next();
      });
      app.use('*', createResourceBindingMiddleware({ authenticateToken: async () => ({ id: 'owner' }) }) as unknown as MiddlewareHandler);
      const route = createChatRoute({ record: vi.fn().mockResolvedValue(undefined) }, { maxSteps: 2 });
      if (!('handler' in route)) throw new Error('Expected a direct HTTP handler');
      app.post('/chat', route.handler as unknown as Handler);
      const post = async (text: string) => (await app.request('/chat', { method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer test-owner' },
        body: JSON.stringify({ messages: [{ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] }], memory: { thread: 'thread' } }),
      })).text();
      const chunks = (body: string) => body.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)));

      const first = await post('What services are covered by this policy?');
      expect(first).toContain(released);
      expect(first).not.toContain(observerSentinel);
      // The Sources panel and tool steps are built from these.
      expect([...new Set(chunks(first).map(chunk => chunk.type))].sort()).toEqual(['data-verification-status', 'finish', 'finish-step',
        'start', 'start-step', 'text-delta', 'text-end', 'text-start', 'tool-input-available', 'tool-input-start', 'tool-output-available']);
      expect(chunks(first).find(chunk => chunk.type === 'tool-output-available').output.section.url).toBe('https://example.gov/policy');
      expect(chunks(first).filter(chunk => chunk.type === 'data-verification-status').at(-1)).toMatchObject({ data: { status: 'passed', severity: 'high', confidence: 1 } });
      await vi.waitFor(async () => {
        // The observer's marker is stored with the released answer; its text is not.
        const rows = JSON.stringify(await storedMessages({ threadId: 'thread', perPage: false }));
        expect(rows).toContain('data-om-buffering-end');
        expect(rows).not.toContain(observerSentinel);
      });
      expect((await store.getObservationalMemory('thread', 'owner'))?.bufferedObservationChunks?.[0]?.observations).toContain(observerSentinel);

      failing = true;
      const warn = vi.spyOn(log, 'warn');
      const failed = await post('Please read that policy again.');
      // The real error stays on the server, where an operator can find it.
      expect(warn).toHaveBeenCalledWith('chat.tool_error', { toolCallId: 'read-3', error: expect.stringContaining('neo4j-blue.railway.internal') });
      // Only the failure's message is logged, not the serialized error with the tool's arguments.
      expect(JSON.stringify(warn.mock.calls)).not.toContain('argsJson');
      warn.mockRestore();
      expect(failed).not.toContain('neo4j');
      expect(failed).not.toContain(observerSentinel);
      expect(chunks(failed).find(chunk => chunk.type === 'tool-output-error')).toEqual(
        { type: 'tool-output-error', toolCallId: 'read-3', errorText: 'This step could not be completed.' });
      await vi.waitFor(async () => {
        const rows = JSON.stringify(await storedMessages({ threadId: 'thread', perPage: false }));
        expect(rows).toContain('"state":"output-error"');
        expect(rows).not.toContain('neo4j');
        expect(rows).not.toContain(observerSentinel);
      });
    } finally {
      await storage.close();
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
      expect((await call('user-b', 'PATCH', '/api/memory/threads/thread-a?agentId=ncMedicaidAgent', { title: 'Taken' })).status).toBe(403);
      expect((await call('user-b', 'POST', '/api/memory/threads/thread-a/clone?agentId=ncMedicaidAgent', {})).status).toBe(403);
      // A clone may not land on another owner's id either.
      expect((await call('user-b', 'POST', '/api/memory/threads/thread-b/clone?agentId=ncMedicaidAgent', { newThreadId: 'thread-a' })).status).not.toBe(200);
      expect(await store.getThreadById({ threadId: 'thread-a' })).toEqual(owned);
      expect((await call('user-a', 'GET', '/api/memory/threads/thread-a?agentId=ncMedicaidAgent')).status).toBe(200);
      const history = await call('user-a', 'GET', '/api/memory/threads/thread-a/messages?agentId=ncMedicaidAgent');
      expect(await history.text()).toContain('USER_A_PRIVATE_SENTINEL');

      // The owner's own re-save and rename still succeed.
      expect((await call('user-a', 'POST', threads, { threadId: 'thread-a', title: 'A title', resourceId: 'user-a' })).status).toBe(200);
      expect((await call('user-a', 'PATCH', '/api/memory/threads/thread-a?agentId=ncMedicaidAgent', { title: 'Renamed' })).status).toBe(200);
      expect(await store.getThreadById({ threadId: 'thread-a' })).toMatchObject({ resourceId: 'user-a', title: 'Renamed' });
      // The web client's own create body, which repeats the agent id.
      expect((await call('user-a', 'POST', threads, { threadId: 'thread-web', resourceId: 'user-a', agentId: 'ncMedicaidAgent', title: 'From the web' })).status).toBe(200);
      expect(await store.getThreadById({ threadId: 'thread-web' })).toMatchObject({ resourceId: 'user-a', title: 'From the web' });

      // Thread bodies are an allow-list: a title, plus the ids a create or a
      // copy needs. Metadata, another owner and an over-long title are refused.
      const renamed = (await store.getThreadById({ threadId: 'thread-a' }))!;
      const planted = { mastra: { om: { suggestedResponse: 'PLANTED_METADATA_SENTINEL' } } };
      const thread = '/api/memory/threads/thread-a?agentId=ncMedicaidAgent';
      const clone = '/api/memory/threads/thread-a/clone?agentId=ncMedicaidAgent';
      const refusals: Array<[string, string, unknown]> = [
        ['POST', threads, { threadId: 'thread-new', resourceId: 'user-a', title: 'New', metadata: planted }],
        ['POST', threads, { threadId: 'thread-new', resourceId: 'user-a', title: 'New', metadata: {} }],
        ['POST', threads, { threadId: 'thread-new', resourceId: 'user-b', title: 'New' }],
        ['POST', threads, { threadId: 'thread-new', resourceId: 'user-a', title: 'x'.repeat(201) }],
        ['POST', threads, { threadId: 'thread-new', resourceId: 'user-a', title: 7 }],
        ['PATCH', thread, { title: 'Again', metadata: planted }],
        ['PATCH', thread, { title: 'Again', resourceId: 'user-a' }],
        ['PATCH', thread, { title: 'x'.repeat(201) }],
        ['PATCH', thread, {}],
        ['POST', clone, { title: 'Copy', metadata: planted }],
        ['POST', clone, { title: 'Copy', resourceId: 'user-b' }],
        ['POST', clone, { title: 'Copy', options: { messageLimit: 1 } }],
      ];
      for (const [method, path, body] of refusals) {
        const refused = await call('user-a', method, path, body);
        expect([method, path, body, refused.status]).toEqual([method, path, body, 400]);
        expect(await refused.text()).not.toContain('PLANTED_METADATA_SENTINEL');
      }
      expect(await store.getThreadById({ threadId: 'thread-new' })).toBeNull();
      expect(await store.getThreadById({ threadId: 'thread-a' })).toEqual(renamed);
      expect((await store.listThreads({ filter: { resourceId: 'user-a' }, perPage: false })).threads.map(item => item.id).sort()).toEqual(['thread-a', 'thread-web']);
      expect((await call('user-a', 'PATCH', thread, { title: 'x'.repeat(200) })).status).toBe(200);
      const copied = await call('user-a', 'POST', clone, { title: 'A title (copy)', resourceId: 'user-a' });
      expect(copied.status).toBe(200);
      expect((await copied.json()).thread).toMatchObject({ resourceId: 'user-a', title: 'A title (copy)' });

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

      // The framework answers a failed request with the raw error. Only the
      // status reaches the client; the storage error goes to the agent log.
      const missing = await call('user-a', 'GET', '/api/memory/threads/thread-none?agentId=ncMedicaidAgent');
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ error: { code: 'not_found', message: 'Conversation not found.' } });
      const warn = vi.spyOn(log, 'warn');
      const raw = createClient({ url: `file:${directory}/test.db` });
      await raw.execute('ALTER TABLE mastra_threads RENAME TO mastra_threads_moved');
      raw.close();
      for (const [method, path, body] of [['GET', thread, undefined], ['PATCH', thread, { title: 'Broken' }],
        ['POST', threads, { threadId: 'thread-c', resourceId: 'user-a', title: 'C' }], ['POST', clone, {}],
        ['GET', '/api/memory/threads/thread-a/messages?agentId=ncMedicaidAgent', undefined]] as const) {
        const failed = await call('user-a', method, path, body);
        expect([method, path, failed.status]).toEqual([method, path, 500]);
        expect(await failed.json()).toEqual({ error: { code: 'internal_error', message: 'The conversation could not be loaded or saved. Please try again.' } });
      }
      expect(warn).toHaveBeenCalledWith('memory_route.failed', expect.objectContaining({ method: 'PATCH', status: 500, error: expect.stringContaining('mastra_threads') }));
      expect(JSON.stringify(warn.mock.calls)).not.toContain('Broken');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('thread-a');
      warn.mockRestore();
    } finally {
      await storage.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it('rejects an incompatible observational-memory store before serving chat', async () => {
    const storage = { getStore: vi.fn().mockResolvedValue({}) } as unknown as LibSQLStore;
    await expect(createChatMemory(storage, { observationalMemoryEnabled: true })).rejects.toThrow('patchThread');
  });

  it('leaves observational memory off unless it is asked for', async () => {
    const storage = new LibSQLStore({ id: 'http-default-test', url: ':memory:' });
    const config = async (options?: Parameters<typeof createChatMemory>[1]) =>
      (await createChatMemory(storage, options)).getMergedThreadConfig();
    expect((await config()).observationalMemory).toBeFalsy();
    expect((await config({ observationalMemoryEnabled: true })).observationalMemory).toBeTruthy();
    // With it off the agent recalls a bounded tail of the stored thread.
    expect((await config()).lastMessages).toBe(10);
  });
});
