import { mkdtempSync, chmodSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono, type Handler } from 'hono';
import { MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context';
import { MessageList } from '@mastra/core/agent';
import type { ProcessOutputStepArgs } from '@mastra/core/processors';
import type { UIMessageChunk } from 'ai';
import { handleChatStream } from '@mastra/ai-sdk';
import { createChatRoute } from '../src/chat-route.js';
import { HallucinationVerifier } from '../src/processors/verifier/processor.js';
import { clientRequestContext } from './helpers/client-request-context.js';
import { verifyAnswer } from '../src/processors/verifier/verify.js';
import { log } from '../src/logger.js';

vi.mock('@mastra/ai-sdk', () => ({ handleChatStream: vi.fn() }));
vi.mock('../src/processors/verifier/verify.js', async original => ({
  ...await original<typeof import('../src/processors/verifier/verify.js')>(), verifyAnswer: vi.fn(),
}));
const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.mocked(handleChatStream).mockReset();
  vi.mocked(verifyAnswer).mockReset();
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function setup(enabled = true, threadOwner: string | null | undefined = undefined) {
  const directory = mkdtempSync(join(tmpdir(), 'http-diagnostic-'));
  roots.push(directory); vi.stubEnv('VERIFIER_PRIVATE_DIAGNOSTICS_DIR', enabled ? directory : '');
  const info = vi.spyOn(log, 'info').mockImplementation(() => {});
  const getThreadById = vi.fn().mockResolvedValue(threadOwner === undefined ? null : { resourceId: threadOwner });
  const getStore = vi.fn().mockResolvedValue({ getThreadById, saveThread: vi.fn().mockResolvedValue(undefined), listMessages: vi.fn().mockResolvedValue({ messages: [] }) });
  const app = new Hono();
  app.use('*', async (c, next) => {
    const context = await clientRequestContext(c.req.raw);
    context.set(MASTRA_RESOURCE_ID_KEY, 'owner');
    (c as any).set('requestContext', context);
    (c as any).set('mastra', { getStorage: () => ({ getStore }) });
    await next();
  });
  app.onError((_error, c) => c.json({ error: 'Chat failed' }, 500));
  const route = createChatRoute({ record: vi.fn() }, { maxSteps: 2 });
  if (!('handler' in route)) throw new Error('Expected direct HTTP handler');
  app.post('/chat', route.handler as unknown as Handler);
  const post = (signal?: AbortSignal, clientDiagnostic?: unknown, text = 'PRIVATE_QUESTION_SENTINEL') => app.request('/chat', { method: 'POST', signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ id: 'user', role: 'user', parts: [{ type: 'text', text }] }],
      requestContext: { chatDiagnostic: clientDiagnostic, chatVerificationQuestion: 'FORGED_QUESTION_SENTINEL' } }),
  });
  const terminal = () => info.mock.calls.filter(([event]) => event === 'chat.diagnostic_finished').map(([, fields]) => fields!);
  const assertTerminal = (status: string) => {
    expect(terminal()).toHaveLength(1);
    expect(terminal()[0].status).toBe(status);
    const started = info.mock.calls.find(([event]) => event === 'chat.diagnostic_started')![1]!;
    expect(terminal()[0].diagnosticId).toBe(started.diagnosticId);
    expect(JSON.stringify(info.mock.calls)).not.toContain('PRIVATE_');
  };
  return { directory, post, assertTerminal, info, getStore, getThreadById };
}

describe('private HTTP diagnostic context and completion', () => {
  it.each(['other-owner', null])('rejects an existing thread owned by %s before generation or diagnostics', async owner => {
    const { post, info, getThreadById, directory } = setup(true, owner);
    const response = await post();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: 'not_found', message: 'Conversation not found' } });
    expect(getThreadById).toHaveBeenCalledOnce();
    expect(handleChatStream).not.toHaveBeenCalled();
    expect(verifyAnswer).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(readdirSync(directory)).toEqual([]);
  });

  it('rejects a client identifier with 422 before storage, generation or diagnostics', async () => {
    const { post, info, getStore, getThreadById, directory } = setup();
    const response = await post(undefined, undefined, 'Is Medicaid ID ABC-12345 eligible for PCS?');
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { code: 'client_identifier_detected',
      message: 'Remove client-identifying information before sending this question.' } });
    expect(getStore).not.toHaveBeenCalled();
    expect(getThreadById).not.toHaveBeenCalled();
    expect(handleChatStream).not.toHaveBeenCalled();
    expect(verifyAnswer).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(readdirSync(directory)).toEqual([]);
  });

  it('fails closed when conversation storage is unavailable', async () => {
    const { post, getStore } = setup();
    getStore.mockResolvedValueOnce(undefined);
    expect((await post()).status).toBe(503);
    expect(handleChatStream).not.toHaveBeenCalled();
  });

  it('fails closed when thread ownership lookup fails', async () => {
    const { post, getThreadById } = setup();
    getThreadById.mockRejectedValueOnce(new Error('Storage unavailable'));
    expect((await post()).status).toBe(500);
    expect(handleChatStream).not.toHaveBeenCalled();
  });

  it.each([
    { enabled: false, forged: 'FORGED_DIAGNOSTIC_SENTINEL' },
    { enabled: false, forged: { id: 'FORGED_DIAGNOSTIC_SENTINEL', startedAtMs: 0, finished: false } },
    { enabled: false, forged: { id: 'FORGED_DIAGNOSTIC_SENTINEL', finished: true } },
    { enabled: true, forged: 'FORGED_DIAGNOSTIC_SENTINEL' },
    { enabled: true, forged: { id: 'FORGED_DIAGNOSTIC_SENTINEL', startedAtMs: 0, finished: false } },
    { enabled: true, forged: { id: 'FORGED_DIAGNOSTIC_SENTINEL', finished: true } },
  ])('releases verified text without trusting client diagnostics ($enabled, $forged)', async ({ enabled, forged }) => {
    const { directory, post, assertTerminal, info } = setup(enabled);
    const released = 'The service is covered. [Policy](https://example.gov/policy)';
    vi.mocked(verifyAnswer).mockResolvedValue({ supported: true, relevant: true, citationsComplete: true,
      unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' });
    vi.mocked(handleChatStream).mockImplementationOnce(async options => {
      const chunks: UIMessageChunk[] = [];
      const step: ProcessOutputStepArgs = {
        text: released, finishReason: 'stop', messages: [], steps: [],
        state: { verificationSources: [{ key: 'policy', toolName: 'getSection',
          text: 'The service is covered.', link: 'https://example.gov/policy' }] },
        requestContext: options.params?.requestContext,
        writer: { custom: async (chunk: unknown) => { chunks.push(chunk as UIMessageChunk); } } as ProcessOutputStepArgs['writer'],
        stepNumber: 0, retryCount: 0, systemMessages: [], messageList: new MessageList(),
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        abort: () => { throw new Error('Aborted diagnostic fixture'); },
      };
      await new HallucinationVerifier().processOutputStep(step);
      return new ReadableStream<UIMessageChunk>({ start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.enqueue({ type: 'finish' }); controller.close();
      } });
    });
    const response = await post(undefined, forged);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('passed');
    expect(text).toContain(released);
    expect(text).not.toContain('FORGED_');
    expect(vi.mocked(verifyAnswer).mock.calls[0][0]).toBe('PRIVATE_QUESTION_SENTINEL');
    expect(JSON.stringify(info.mock.calls)).not.toContain('FORGED_');
    if (enabled) {
      assertTerminal('passed');
      expect(readdirSync(directory).length).toBeGreaterThan(0);
    } else {
      expect(info.mock.calls.filter(([event]) => event.startsWith('chat.diagnostic_'))).toEqual([]);
      expect(readdirSync(directory)).toEqual([]);
    }
  });

  it('records failure when generation throws before final verification', async () => {
    const { post, assertTerminal } = setup(true, 'owner');
    vi.mocked(handleChatStream).mockRejectedValueOnce(new Error('PRIVATE_ERROR_SENTINEL'));
    const response = await post();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('PRIVATE_');
    assertTerminal('failed');
  });

  it('records a capture-permission failure without releasing the candidate', async () => {
    const { directory, post, assertTerminal } = setup();
    chmodSync(directory, 0o755);
    vi.mocked(handleChatStream).mockImplementationOnce(async options => {
      const step: ProcessOutputStepArgs = {
        text: 'PRIVATE_DRAFT_SENTINEL', finishReason: 'stop', messages: [], state: {}, steps: [],
        requestContext: options.params?.requestContext,
        stepNumber: 0, retryCount: 0, systemMessages: [], messageList: new MessageList(),
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        abort: () => { throw new Error('Aborted diagnostic fixture'); },
      };
      await new HallucinationVerifier().processOutputStep(step);
      return new ReadableStream();
    });
    const response = await post();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('PRIVATE_');
    expect(readdirSync(directory)).toEqual([]);
    assertTerminal('failed');
  });

  it('records cancellation once even when a later stream error also arrives', async () => {
    const { post, assertTerminal } = setup();
    let controller!: ReadableStreamDefaultController;
    let options!: Parameters<typeof handleChatStream>[0];
    vi.mocked(handleChatStream).mockImplementationOnce(async args => {
      options = args;
      return new ReadableStream({ start(stream) { controller = stream; } });
    });
    const abort = new AbortController();
    const response = await post(abort.signal);
    abort.abort();
    options.defaultOptions?.onError?.(new Error('Late stream error') as never);
    controller.close();
    await response.body?.cancel();
    assertTerminal('cancelled');
  });
});
