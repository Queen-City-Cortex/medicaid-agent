import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { verifyAnswer } from '../src/processors/verifier/verify.js';
import { stubOpenAIResponses } from './helpers/openai-responses-stub.js';
import { bootProductionServer, type ProductionServer } from './helpers/production-server.js';

// The app production serves (see `bootProductionServer`). Only what would
// leave the process is replaced: the chat model (the factory's `model`
// option), the WorkOS token check (its `server` option), the two classifier
// calls (an offline OpenAI endpoint) and the verifier's model call.
vi.mock('../src/processors/verifier/verify.js', async original => ({
  ...await original<typeof import('../src/processors/verifier/verify.js')>(), verifyAnswer: vi.fn(),
}));
vi.mock('../src/processors/verifier/evidence.js', async original => ({
  ...await original<typeof import('../src/processors/verifier/evidence.js')>(),
  extractSources: () => [{ key: 'policy', toolName: 'getSection', text: 'The service is covered.', link: 'https://example.gov/policy' }],
}));

const DRAFT = 'PRIVATE_DRAFT_SENTINEL';
const RELEASED = 'The service is covered. [Policy](https://example.gov/policy)';
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const verdict = { supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };
const classifierReply = (value: unknown) => [{ type: 'message' as const, id: 'msg', text: JSON.stringify(value) }];
const ON_TOPIC = classifierReply({ verdict: 'on_topic', reason: 'About Medicaid coverage.' });
const NO_INJECTION = classifierReply({ categories: null, reason: null });

describe('the production runtime behind Mastra\'s HTTP server', () => {
  let server: ProductionServer;
  let runtime: ProductionServer['runtime'];
  let app: ProductionServer['app'];
  let classifierCalls: any[];
  const modelPrompts: string[] = [];

  const post = (text: string, { token = 'test-owner', thread = 'thread', contentLength }: { token?: string | null; thread?: string; contentLength?: string } = {}) => {
    const body = JSON.stringify({ messages: [{ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] }], memory: { thread, resource: 'attacker' } });
    return app.request('/chat', { method: 'POST', body, headers: {
      'content-type': 'application/json', 'content-length': contentLength ?? String(Buffer.byteLength(body)),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    } });
  };

  beforeAll(async () => {
    vi.stubEnv('RATE_LIMIT_MESSAGES_PER_HOUR', '3');
    vi.stubEnv('MAX_MESSAGE_CHARS', '200');
    vi.stubEnv('SCOPE_GATE_ENABLED', 'true');
    vi.stubEnv('SCOPE_GATE_PROVIDER', 'openai');
    // One on-topic chat turn calls the scope classifier, then the detector.
    classifierCalls = stubOpenAIResponses([ON_TOPIC, NO_INJECTION]).bodies;
    vi.mocked(verifyAnswer).mockImplementation(async (_question, text) => text === RELEASED ? verdict : { ...verdict, supported: false, correctedAnswer: RELEASED });
    const model = new MockLanguageModelV3({ doStream: async options => {
      modelPrompts.push(JSON.stringify(options.prompt));
      return { stream: simulateReadableStream({ chunks: [
        { type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'draft' },
        { type: 'text-delta', id: 'draft', delta: DRAFT }, { type: 'text-end', id: 'draft' },
        { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
      ] }) };
    } });
    server = await bootProductionServer({ 'test-owner': 'owner' }, { memory: true, promptInjectionDetector: true, verifyOutput: true, model });
    ({ runtime, app } = server);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await server?.close();
  });

  it('builds the input and output processors in production order', async () => {
    expect((await runtime.agent.listConfiguredInputProcessors()).map(processor => processor.id)).toEqual([
      'message-length-guard',
      'coverage-boundary',
      'scope-gate',
      'prompt-injection-detector',
      'openai-responses-dedup',
      'answer-frame-prefetch',
      'answer-frame-planning',
      'token-limiter',
    ]);
    expect((await runtime.agent.listConfiguredOutputProcessors()).map(processor => processor.id)).toEqual(['hallucination-verifier']);
    expect(await runtime.agent.getMemory()).toBeDefined();
  });

  it('orders the middleware: identity, gateway, body size, rate limit', () => {
    expect((runtime.serverOptions.middleware as Array<{ name: string }>).map(middleware => middleware.name)).toEqual([
      'bindResourceToAuthenticatedUser',
      'executionGateway',
      'bodySizeGuard',
      'chatRateLimiter',
    ]);
  });

  it('serves liveness without a token and refuses routes the gateway does not own', async () => {
    const live = await app.request('/livez');
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: 'ok' });
    const generate = await app.request('/api/agents/ncMedicaidAgent/generate', { method: 'POST', body: '{}',
      headers: { 'content-type': 'application/json', 'content-length': '2', authorization: 'Bearer test-owner' } });
    expect(generate.status).toBe(404);
  });

  // One sequence, because the per-user limit of three run starts is what shows
  // which requests the rate limiter saw.
  it('runs a chat turn through every gate, and each refusal comes from the right layer', async () => {
    // The gateway answers before the body-size guard: no token, oversized body.
    expect((await post('What is covered?', { token: null, contentLength: '999999999' })).status).toBe(401);
    expect((await post('What is covered?', { token: 'not-a-user', contentLength: '999999999' })).status).toBe(401);
    // The body-size guard answers before the rate limiter: this is not counted.
    expect((await post('What is covered?', { contentLength: '999999999' })).status).toBe(413);
    expect(classifierCalls).toHaveLength(0);

    // Run start 1: the whole chain.
    const turn = await post('What services are covered by this policy?');
    expect(turn.status).toBe(200);
    const stream = await turn.text();
    expect(stream).toContain(RELEASED);
    expect(stream).not.toContain(DRAFT);
    // The scope gate's classifier ran before the injection detector's.
    expect(classifierCalls).toHaveLength(2);
    expect(JSON.stringify(classifierCalls[0])).toContain('scope classifier');
    expect(JSON.stringify(classifierCalls[1])).not.toContain('scope classifier');
    // The answer-frame prefetch reached the model's first step.
    expect(modelPrompts).toHaveLength(1);
    expect(modelPrompts[0]).toContain('call resolveAnswerFrame once');
    // The thread belongs to the token's user, whatever the body claimed.
    const store = (await runtime.storage.getStore('memory'))!;
    expect((await store.getThreadById({ threadId: 'thread' }))?.resourceId).toBe('owner');
    await vi.waitFor(async () => {
      const history = await app.request('/api/memory/threads/thread/messages?agentId=ncMedicaidAgent', { headers: { authorization: 'Bearer test-owner' } });
      expect(history.status).toBe(200);
      const stored = await history.text();
      expect(stored).toContain(RELEASED);
      expect(stored).not.toContain(DRAFT);
    });

    // Run start 2: the length guard refuses before either classifier is paid for.
    const long = await (await post(`Is this covered? ${'x'.repeat(200)}`, { thread: 'long' })).text();
    expect(long).toContain('message-too-long');
    // Run start 3: so does the coverage boundary.
    const unsupported = await (await post('What MAGI income table and limits apply in February 2025?', { thread: 'dated' })).text();
    expect(unsupported).toContain('coverage-limitation');
    expect(classifierCalls).toHaveLength(2);
    expect(modelPrompts).toHaveLength(1);

    // The rate limiter counted exactly the three run starts that passed the
    // gateway and the body-size guard, against the user the first middleware bound.
    const limited = await post('What is covered?', { thread: 'fourth' });
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe('rate_limited');
    expect(modelPrompts).toHaveLength(1);
  }, 30_000);
});
