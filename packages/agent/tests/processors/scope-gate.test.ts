import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('ai', async original => ({ ...await original<typeof import('ai')>(), generateObject: vi.fn() }));
import { generateObject } from 'ai';

import { ScopeGateProcessor, isScopeGateEnabled } from '../../src/processors/scope-gate.js';

const mockGenerateObject = generateObject as unknown as ReturnType<typeof vi.fn>;

function makeUserMessage(text: string) {
  return { role: 'user', content: { parts: [{ type: 'text', text }] } };
}

function makeAbort() {
  const calls: Array<{ reason?: string; options?: any }> = [];
  const abort = (reason?: string, options?: any): never => {
    calls.push({ reason, options });
    throw new Error(`tripwire: ${reason}`);
  };
  return { abort, calls };
}

async function run(messages: any[]) {
  const gate = new ScopeGateProcessor();
  const { abort, calls } = makeAbort();
  let tripped = false;
  try {
    await gate.processInput({ messages, abort } as any);
  } catch {
    tripped = true;
  }
  return { tripped, calls };
}

function mockVerdict(verdict: 'on_topic' | 'ambiguous' | 'off_topic') {
  mockGenerateObject.mockResolvedValueOnce({ object: { verdict, reason: 'test reason' } });
}

describe('ScopeGateProcessor', () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
  });

  afterEach(() => {
    delete process.env.SCOPE_GATE_ENABLED;
  });

  it('passes on-topic questions through', async () => {
    mockVerdict('on_topic');
    const { tripped } = await run([makeUserMessage('Does NC Medicaid cover physical therapy?')]);
    expect(tripped).toBe(false);
  });

  it('passes ambiguous questions — bias to allow', async () => {
    mockVerdict('ambiguous');
    const { tripped } = await run([makeUserMessage('they sent me a letter, can they do this?')]);
    expect(tripped).toBe(false);
  });

  it('blocks clear off-topic use with a friendly user message', async () => {
    mockVerdict('off_topic');
    const { tripped, calls } = await run([makeUserMessage('Write me a poem about pirates')]);
    expect(tripped).toBe(true);
    expect(calls[0].options.metadata.code).toBe('off-topic');
    expect(calls[0].options.metadata.userMessage).toContain('NC Medicaid');
  });

  it('sends recent conversation context to the classifier so follow-ups classify correctly', async () => {
    mockVerdict('on_topic');
    await run([
      makeUserMessage('Does Medicaid cover home health aides?'),
      { role: 'assistant', content: { parts: [{ type: 'text', text: 'Yes, under Policy 3A...' }] } },
      makeUserMessage('what about my daughter?'),
    ]);
    const classifierInput = mockGenerateObject.mock.calls[0][0].messages[0].content as string;
    expect(classifierInput).toContain('home health aides');
    expect(classifierInput).toContain('what about my daughter?');
  });

  it('fails OPEN when the classifier call throws', async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error('rate limit'));
    const { tripped } = await run([makeUserMessage('anything')]);
    expect(tripped).toBe(false);
  });

  it('is a no-op when disabled via SCOPE_GATE_ENABLED=false', async () => {
    process.env.SCOPE_GATE_ENABLED = 'false';
    const { tripped } = await run([makeUserMessage('Write me a poem')]);
    expect(tripped).toBe(false);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it('is a no-op when there is no conversation text', async () => {
    const { tripped } = await run([]);
    expect(tripped).toBe(false);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });
});

describe('isScopeGateEnabled', () => {
  afterEach(() => {
    delete process.env.SCOPE_GATE_ENABLED;
  });

  it("is on unless exactly 'false' — verifier kill-switch semantics", () => {
    expect(isScopeGateEnabled()).toBe(true);
    process.env.SCOPE_GATE_ENABLED = '0';
    expect(isScopeGateEnabled()).toBe(true);
    process.env.SCOPE_GATE_ENABLED = 'false';
    expect(isScopeGateEnabled()).toBe(false);
  });
});

describe('Jev scope provider', () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
    vi.stubEnv('SCOPE_GATE_PROVIDER', 'jev');
    vi.stubEnv('TYPESAFE_API_KEY', 'test');
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
  function response(off: number) {
    return new Response(JSON.stringify({ model: 'jev-1.13.0', answers: { scope: {
      type: 'choice', choice: off > .5 ? 'off_topic' : 'on_topic',
      probabilities: { off_topic: off, on_topic: 1 - off, ambiguous: 0 }, confidence: .8,
    } }, usage: { input_tokens: 100, output_tokens: 20 } }));
  }
  it('blocks only selected off_topic at probability >= .95, independent of confidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(.96)));
    expect((await run([makeUserMessage('Write a pirate poem')])).tripped).toBe(true);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });
  it('allows uncertain off_topic', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(.94)));
    expect((await run([makeUserMessage('Can they do this to me?')])).tripped).toBe(false);
  });
  it.each([401, 422, 429, 529])('fails open without retry on HTTP %s', async status => {
    const f = vi.fn().mockResolvedValue(new Response('private body', { status }));
    vi.stubGlobal('fetch', f);
    expect((await run([makeUserMessage('¿Puedo apelar?')])).tripped).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('fails open on malformed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    expect((await run([makeUserMessage('Tell me about benefits')])).tripped).toBe(false);
  });
  it('fails open by 500 ms when transport never resolves', async () => {
    vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const pending = run([makeUserMessage('What about my daughter?')]);
    await vi.advanceTimersByTimeAsync(500);
    expect((await pending).tripped).toBe(false);
  });
  it('honors the same kill switch without calling either provider', async () => {
    vi.stubEnv('SCOPE_GATE_ENABLED', 'false');
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect((await run([makeUserMessage('Anything')])).tripped).toBe(false);
    expect(f).not.toHaveBeenCalled(); expect(mockGenerateObject).not.toHaveBeenCalled();
  });
});
