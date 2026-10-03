import { mkdtempSync, chmodSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono, type Handler } from 'hono';
import { RequestContext, MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context';
import { MessageList } from '@mastra/core/agent';
import type { ProcessOutputStepArgs } from '@mastra/core/processors';
import { handleChatStream } from '@mastra/ai-sdk';
import { createChatRoute } from '../src/chat-route.js';
import { HallucinationVerifier } from '../src/processors/verifier/processor.js';
import { log } from '../src/logger.js';

vi.mock('@mastra/ai-sdk', () => ({ handleChatStream: vi.fn() }));
const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.mocked(handleChatStream).mockReset();
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'http-diagnostic-'));
  roots.push(directory); vi.stubEnv('VERIFIER_PRIVATE_DIAGNOSTICS_DIR', directory);
  const info = vi.spyOn(log, 'info').mockImplementation(() => {});
  const app = new Hono();
  app.use('*', async (c, next) => {
    const context = new RequestContext(); context.set(MASTRA_RESOURCE_ID_KEY, 'owner');
    (c as any).set('requestContext', context); await next();
  });
  app.onError((_error, c) => c.json({ error: 'Chat failed' }, 500));
  const route = createChatRoute({ record: vi.fn() }, { maxSteps: 2 });
  if (!('handler' in route)) throw new Error('Expected direct HTTP handler');
  app.post('/chat', route.handler as unknown as Handler);
  const post = (signal?: AbortSignal) => app.request('/chat', { method: 'POST', signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ id: 'user', role: 'user', parts: [{ type: 'text', text: 'PRIVATE_QUESTION_SENTINEL' }] }] }),
  });
  const terminal = () => info.mock.calls.filter(([event]) => event === 'chat.diagnostic_finished').map(([, fields]) => fields!);
  const assertTerminal = (status: string) => {
    expect(terminal()).toHaveLength(1);
    expect(terminal()[0].status).toBe(status);
    const started = info.mock.calls.find(([event]) => event === 'chat.diagnostic_started')![1]!;
    expect(terminal()[0].diagnosticId).toBe(started.diagnosticId);
    expect(JSON.stringify(info.mock.calls)).not.toContain('PRIVATE_');
  };
  return { directory, post, assertTerminal };
}

describe('private HTTP diagnostic failure completion', () => {
  it('records failure when generation throws before final verification', async () => {
    const { post, assertTerminal } = setup();
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
