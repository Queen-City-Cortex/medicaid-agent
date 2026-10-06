import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono, type Handler, type MiddlewareHandler } from 'hono';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { Mastra } from '@mastra/core';
import type { RequestContext } from '@mastra/core/request-context';
import type { ProcessInputArgs } from '@mastra/core/processors';
import { LibSQLStore } from '@mastra/libsql';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { generateObject } from 'ai';
import { createChatMemory } from '../src/chat-memory.js';
import { createChatRoute } from '../src/chat-route.js';
import { createResourceBindingMiddleware } from '../src/auth-middleware.js';
import { installMemoryReleaseGate } from '../src/answer-release.js';
import { CoverageBoundaryProcessor } from '../src/processors/coverage-boundary.js';
import { ScopeGateProcessor } from '../src/processors/scope-gate.js';
import { createInjectionDetector } from '../src/processors/injection-detector.js';
import { MessageLengthGuard } from '../src/processors/message-length-guard.js';
import { CHAT_PRIOR_TURNS, type PriorTurn } from '../src/processors/prior-turns.js';
import { CHAT_VERIFICATION_QUESTION } from '../src/processors/verifier/context.js';
import { contentText } from '../src/processors/message-utils.js';
import { HallucinationVerifier } from '../src/processors/verifier/processor.js';
import { verifyAnswer } from '../src/processors/verifier/verify.js';
import { log } from '../src/logger.js';
import { clientRequestContext } from './helpers/client-request-context.js';
import { stubOpenAIResponses } from './helpers/openai-responses-stub.js';
import { z } from 'zod';

vi.mock('../src/processors/verifier/verify.js', async original => ({
  ...await original<typeof import('../src/processors/verifier/verify.js')>(), verifyAnswer: vi.fn(),
}));
// The scope classifier is the only caller of generateObject on this path.
vi.mock('ai', async original => ({ ...await original<typeof import('ai')>(), generateObject: vi.fn() }));

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const finishReason = { unified: 'stop' as const, raw: 'stop' };
const verdict = { supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };
const source = 'https://medicaid.ncdhhs.gov/notice-rights';
const released = `RELEASED_ANSWER_SENTINEL Free legal help is available to appeal. [Notice rights](${source})`;
const PHONE = '[phone number removed]';
const EMAIL = '[email removed]';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.mocked(generateObject).mockReset(); vi.mocked(verifyAnswer).mockReset();
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** The production route, input gates and verifier processor over a real store.
 *  Every model is a stand-in that records what it was sent. */
async function harness() {
  const diagnostics = mkdtempSync(join(tmpdir(), 'redaction-diagnostic-'));
  roots.push(diagnostics);
  vi.stubEnv('VERIFIER_PRIVATE_DIAGNOSTICS_DIR', diagnostics);
  const logged = (['debug', 'info', 'warn', 'error'] as const).map(level => vi.spyOn(log, level).mockImplementation(() => {}));
  const printed = (['log', 'info', 'warn', 'error'] as const).map(level => vi.spyOn(console, level).mockImplementation(() => {}));
  vi.mocked(verifyAnswer).mockResolvedValue(verdict);
  const windows: string[] = [];
  vi.mocked(generateObject).mockImplementation((async ({ messages }: { messages: Array<{ content: string }> }) => {
    windows.push(messages[0].content);
    return { object: { verdict: 'on_topic', reason: 'fixture' } };
  }) as never);
  // The prompt-injection detector's classifier is the only fetch on this path.
  const detector = stubOpenAIResponses([[{ type: 'message', id: 'msg_1', text: JSON.stringify({ categories: null, reason: null }) }]]);
  const storage = new LibSQLStore({ id: `redaction-${crypto.randomUUID()}`, url: ':memory:' });
  await storage.init();
  const store = (await storage.getStore('memory'))!;
  installMemoryReleaseGate(store);
  const stream = (chunks: unknown[]) => ({ stream: simulateReadableStream({ chunks: [{ type: 'stream-start', warnings: [] }, ...chunks] }) }) as never;
  const modelPrompts: string[] = [];
  const model = new MockLanguageModelV3({ doStream: async options => {
    modelPrompts.push(JSON.stringify(options.prompt));
    return modelPrompts.length % 2 === 1
      ? stream([{ type: 'tool-call', toolCallId: `read-${modelPrompts.length}`, toolName: 'getSection', input: '{}' },
        { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage }])
      : stream([{ type: 'text-start', id: 'answer' }, { type: 'text-delta', id: 'answer', delta: released },
        { type: 'text-end', id: 'answer' }, { type: 'finish', finishReason, usage }]);
  } });
  const getSection = createTool({ id: 'getSection', description: 'Read the fixture notice.', inputSchema: z.object({}),
    execute: async () => ({ section: { id: 'notice', title: 'Notice rights', content: 'Free legal help is available to appeal.',
      url: source, citationLink: `[Notice rights](${source})` } }) });
  const received: string[][] = [];
  const probe = { id: 'probe', processInput: ({ messages }: ProcessInputArgs) => {
    received.push(messages.map(message => `${message.role}:${contentText(message.content)}`));
    return messages;
  } };
  const memory = await createChatMemory(storage);
  // The production order of the gates that read the question.
  const agent = new Agent({ id: 'test-agent', name: 'Test', instructions: 'Answer from policy.', model, memory, tools: { getSection },
    inputProcessors: [new MessageLengthGuard(), new CoverageBoundaryProcessor(), new ScopeGateProcessor(), createInjectionDetector(), probe],
    outputProcessors: [new HallucinationVerifier()] });
  const mastra = new Mastra({ agents: { ncMedicaidAgent: agent }, storage, logger: false });
  const contexts: RequestContext[] = [];
  const record = vi.fn().mockResolvedValue(undefined);
  const app = new Hono();
  app.use('*', async (c, next) => {
    contexts.push(await clientRequestContext(c.req.raw));
    (c as any).set('requestContext', contexts.at(-1));
    (c as any).set('mastra', mastra);
    await next();
  });
  app.use('*', createResourceBindingMiddleware({ authenticateToken: async () => ({ id: 'owner' }) }) as unknown as MiddlewareHandler);
  const route = createChatRoute({ record }, { maxSteps: 2 });
  if (!('handler' in route)) throw new Error('Expected a direct HTTP handler');
  app.post('/chat', route.handler as unknown as Handler);
  const post = async (thread: string, parts: string[]) => {
    const response = await app.request('/chat', { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-owner' },
      body: JSON.stringify({ messages: [{ id: crypto.randomUUID(), role: 'user', parts: parts.map(text => ({ type: 'text', text })) }], memory: { thread } }) });
    return { status: response.status, body: await response.text() };
  };
  const stored = async (thread: string, answered: boolean) => {
    if (answered) await vi.waitFor(async () => expect(JSON.stringify(await store.listMessages({ threadId: thread, perPage: false }))).toContain(released));
    const { messages } = await store.listMessages({ threadId: thread, perPage: false });
    return { messages, user: messages.filter(message => message.role === 'user').map(message => contentText(message.content)),
      thread: await store.getThreadById({ threadId: thread }) };
  };
  /** Everything outside the HTTP response that the turn wrote or sent. */
  const sinks = async (thread: string, answered = true) => ({
    ...(await stored(thread, answered)),
    agentModel: modelPrompts,
    scopeClassifier: windows,
    injectionDetector: detector.bodies,
    inputProcessors: received,
    verifier: vi.mocked(verifyAnswer).mock.calls.map(([question]) => question),
    verificationQuestion: contexts.map(context => context.get(CHAT_VERIFICATION_QUESTION)),
    priorTurns: contexts.map(context => context.get(CHAT_PRIOR_TURNS) as PriorTurn[]),
    diagnostics: readdirSync(diagnostics).map(file => readFileSync(join(diagnostics, file), 'utf8')),
    logs: [...logged, ...printed].flatMap(spy => spy.mock.calls),
    usage: record.mock.calls,
  });
  return { post, sinks, close: () => storage.close() };
}

describe('contact details in the newest chat message', () => {
  it('answers the legal-aid question with the number replaced, not a 422', async () => {
    const chat = await harness();
    try {
      const turn = await chat.post('legal-aid', ['My notice says to call 866-219-5262 for free legal help. Should I?']);
      expect(turn.status).toBe(200);
      expect(turn.body).toContain(released);
      expect(turn.body).not.toContain('client_identifier_detected');
      const sinks = await chat.sinks('legal-aid');
      expect(sinks.user).toEqual([`My notice says to call ${PHONE} for free legal help. Should I?`]);
      expect(sinks.verifier).toEqual([`My notice says to call ${PHONE} for free legal help. Should I?`]);
      expect(JSON.stringify(sinks)).not.toContain('866-219-5262');
    } finally { await chat.close(); }
  }, 30_000);

  it('keeps a phone number and an e-mail address out of storage, every model request, diagnostics and logs', async () => {
    const chat = await harness();
    const phone = '919-555-0142';
    const email = 'sentinel.client@example.com';
    const redacted = `Does Medicaid cover dental care? Reach me at ${PHONE}\nor ${EMAIL} with the answer.`;
    try {
      // Two text parts: the route joins them, and both are screened.
      const first = await chat.post('contact', [`Does Medicaid cover dental care? Reach me at ${phone}`, `or ${email} with the answer.`]);
      expect(first.status).toBe(200);
      expect(first.body).toContain(released);
      const afterFirst = await chat.sinks('contact');
      expect(afterFirst.user).toEqual([redacted]);
      // Each stand-in was called, so an empty capture cannot pass for a clean one.
      expect(afterFirst.agentModel.length).toBeGreaterThanOrEqual(2);
      for (const prompt of afterFirst.agentModel) expect(prompt).toContain(PHONE);
      expect(afterFirst.scopeClassifier).toHaveLength(1);
      expect(afterFirst.scopeClassifier[0]).toContain(EMAIL);
      expect(afterFirst.injectionDetector).toHaveLength(1);
      expect(JSON.stringify(afterFirst.injectionDetector[0])).toContain(PHONE);
      expect(afterFirst.inputProcessors).toEqual([[`user:${redacted}`]]);
      expect(afterFirst.verifier).toEqual([redacted]);
      expect(afterFirst.verificationQuestion).toEqual([redacted]);
      expect(afterFirst.diagnostics.length).toBeGreaterThan(0);
      expect(afterFirst.diagnostics.join('\n')).toContain(PHONE);
      expect(afterFirst.logs.map(([event]) => event)).toContain('chat.diagnostic_started');
      expect(afterFirst.usage).toHaveLength(1);

      // The follow-up reads the stored turn back as prior context for the gates and the model.
      const second = await chat.post('contact', ['What about for adults?']);
      expect(second.status).toBe(200);
      expect(second.body).toContain(released);
      const sinks = await chat.sinks('contact');
      expect(sinks.priorTurns[1].map(turn => turn.content)).toEqual([redacted, released]);
      expect(sinks.scopeClassifier[1]).toContain(`user: ${redacted}`);
      expect(sinks.agentModel.at(-1)).toContain(PHONE);

      const everything = JSON.stringify([sinks, first.body, second.body]);
      for (const sentinel of [phone, '555-0142', email, 'sentinel.client']) expect(everything).not.toContain(sentinel);
    } finally { await chat.close(); }
  }, 30_000);

  it('still refuses a member ID beside a phone number, before storage or any model', async () => {
    const chat = await harness();
    try {
      const turn = await chat.post('refused', ['My Medicaid ID is 945123456K, call me at 919-555-0142']);
      expect(turn.status).toBe(422);
      expect(JSON.parse(turn.body)).toEqual({ error: { code: 'client_identifier_detected',
        message: 'Remove client-identifying information before sending this question.' } });
      const { verificationQuestion, priorTurns, ...sinks } = await chat.sinks('refused', false);
      expect(sinks).toEqual({ messages: [], user: [], thread: null, agentModel: [], scopeClassifier: [], injectionDetector: [],
        inputProcessors: [], verifier: [], diagnostics: [], logs: [], usage: [] });
      expect([verificationQuestion, priorTurns]).toEqual([[undefined], [undefined]]);
    } finally { await chat.close(); }
  }, 30_000);
});
