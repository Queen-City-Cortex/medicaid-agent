import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLASSIFIER_DEADLINE_MS } from '../../src/model.js';
import { createInjectionDetector } from '../../src/processors/injection-detector.js';
import { CHAT_ABORT_SIGNAL, ScopeGateProcessor } from '../../src/processors/scope-gate.js';
import { log } from '../../src/logger.js';
import { Sentry } from '../../src/sentry.js';
import { stubOpenAIKey, stubOpenAIResponses } from '../helpers/openai-responses-stub.js';

vi.mock('../../src/sentry.js', () => ({ Sentry: { captureException: vi.fn() } }));

// Both pre-agent classifiers against the real SDK and provider, with fetch
// stubbed: what bounds each call, and what the gate does when a bound fires.

const text = (id: string, role: string, value: string) => ({ id, role, createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text: value }] } });
const messages = [text('m', 'user', 'Does Medicaid cover dental?')];
const abort = (reason?: string): never => { throw new Error(`blocked: ${reason}`); };
const context = (signal?: AbortSignal) => ({ get: (key: string) => (key === CHAT_ABORT_SIGNAL ? signal : undefined) });
const scope = (signal?: AbortSignal) => new ScopeGateProcessor().processInput({ messages, abort, requestContext: context(signal) } as any);
const detect = (thread = messages) => createInjectionDetector().processInput({ messages: thread, abort } as any);

/** A provider that never answers: each request settles only when its signal aborts. */
function hangingFetch() {
  const signals: AbortSignal[] = [];
  stubOpenAIKey();
  vi.stubGlobal('fetch', vi.fn((_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
    const signal = init!.signal!;
    signals.push(signal);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  })));
  return signals;
}

/** A provider that answers every request with a retryable server error. */
function failingFetch() {
  stubOpenAIKey();
  const fetchMock = vi.fn(async () => new Response(
    JSON.stringify({ error: { message: 'The server had an error', type: 'server_error', param: null, code: null } }),
    { status: 500, headers: { 'content-type': 'application/json' } },
  ));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** AbortSignal.timeout on fake timers, as tests/processors/verifier-timeout.test.ts does. */
function fakeDeadlines() {
  vi.useFakeTimers();
  return vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('The operation timed out', 'TimeoutError')), ms);
    return controller.signal;
  });
}

function spies() {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  return {
    info: vi.spyOn(log, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(log, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(log, 'error').mockImplementation(() => {}),
    sentry: vi.mocked(Sentry.captureException),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.mocked(Sentry.captureException).mockClear();
});

describe('scope classifier bounds', () => {
  it('keeps the deadline inside the reviewed 8 to 10 seconds', () => {
    expect(CLASSIFIER_DEADLINE_MS).toBeGreaterThanOrEqual(8_000);
    expect(CLASSIFIER_DEADLINE_MS).toBeLessThanOrEqual(10_000);
  });

  it('makes one attempt: a retryable provider error fails open without a retry', async () => {
    const fetchMock = failingFetch();
    const { error, sentry } = spies();
    await expect(scope()).resolves.toBe(messages);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledExactlyOnceWith('scope_gate.failed_open', expect.objectContaining({ reason: 'error' }));
    expect(sentry).toHaveBeenCalledTimes(1);
  });

  it('fails open at the deadline with its own logged reason and no Sentry report', async () => {
    const timeout = fakeDeadlines();
    const signals = hangingFetch();
    const { warn, error, sentry } = spies();
    let settled = false;
    const pending = scope().then((result) => { settled = true; return result; });
    await vi.advanceTimersByTimeAsync(CLASSIFIER_DEADLINE_MS - 1);
    expect(signals).toHaveLength(1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe(messages);
    expect(timeout).toHaveBeenCalledWith(CLASSIFIER_DEADLINE_MS);
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(true);
    expect(warn).toHaveBeenCalledExactlyOnceWith('scope_gate.failed_open', expect.objectContaining({ reason: 'deadline', deadlineMs: CLASSIFIER_DEADLINE_MS }));
    expect(error).not.toHaveBeenCalled();
    expect(sentry).not.toHaveBeenCalled();
  });

  it('aborts the classifier call when the client disconnects, and says so in the log', async () => {
    const signals = hangingFetch();
    const { info, warn, error, sentry } = spies();
    const request = new AbortController();
    const pending = scope(request.signal);
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    expect(signals[0].aborted).toBe(false);
    request.abort(new Error('client went away'));
    expect(await pending).toBe(messages);
    expect(signals[0].aborted).toBe(true);
    expect(info).toHaveBeenCalledWith('scope_gate.failed_open', { reason: 'client_aborted' });
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(sentry).not.toHaveBeenCalled();
  });

  it('ignores a request-context value that is not an abort signal', async () => {
    const { bodies } = stubOpenAIResponses([[{ type: 'message', id: 'msg_1', text: JSON.stringify({ verdict: 'on_topic', reason: 'About Medicaid.' }) }]]);
    await expect(new ScopeGateProcessor().processInput({ messages, abort, requestContext: { get: () => ({ aborted: true }) } } as any)).resolves.toBe(messages);
    expect(bodies).toHaveLength(1);
  });
});

describe('prompt-injection detector bounds', () => {
  it('makes one attempt on a retryable provider error', async () => {
    const fetchMock = failingFetch();
    const { error } = spies();
    await expect(detect()).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('fails open at the deadline and reports it', async () => {
    const timeout = fakeDeadlines();
    const signals = hangingFetch();
    const { error, sentry } = spies();
    let settled = false;
    const pending = detect().then((result) => { settled = true; return result; });
    await vi.advanceTimersByTimeAsync(CLASSIFIER_DEADLINE_MS - 1);
    expect(signals).toHaveLength(1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toHaveLength(1);
    expect(timeout).toHaveBeenCalledWith(CLASSIFIER_DEADLINE_MS);
    expect(signals[0].aborted).toBe(true);
    expect(error).toHaveBeenCalledExactlyOnceWith('prompt_injection.failed_open', expect.objectContaining({ deadlineMs: CLASSIFIER_DEADLINE_MS }));
    expect(sentry).toHaveBeenCalledTimes(1);
  });

  it('reports an outage once per request, however long the thread', async () => {
    const fetchMock = failingFetch();
    const { error, sentry } = spies();
    const thread = [text('q1', 'user', 'First question'), text('a1', 'assistant', 'First answer'), text('q2', 'user', 'Second question')];
    await expect(detect(thread)).resolves.toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(sentry).toHaveBeenCalledTimes(1);
  });
});
