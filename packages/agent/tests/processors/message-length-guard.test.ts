import { describe, expect, it, afterEach } from 'vitest';
import { MessageLengthGuard } from '../../src/processors/message-length-guard.js';

function makeUserMessage(text: string) {
  return { role: 'user', content: { parts: [{ type: 'text', text }] } };
}

// Mirrors Mastra's TripWire semantics: abort throws, so processor code after
// the call never runs.
function makeAbort() {
  const calls: Array<{ reason?: string; options?: any }> = [];
  const abort = (reason?: string, options?: any): never => {
    calls.push({ reason, options });
    throw new Error(`tripwire: ${reason}`);
  };
  return { abort, calls };
}

function run(guard: MessageLengthGuard, messages: any[]) {
  const { abort, calls } = makeAbort();
  let tripped = false;
  try {
    guard.processInput({ messages, abort } as any);
  } catch {
    tripped = true;
  }
  return { tripped, calls };
}

describe('MessageLengthGuard', () => {
  const guard = new MessageLengthGuard();

  afterEach(() => {
    delete process.env.MAX_MESSAGE_CHARS;
  });

  it('passes a message at exactly the limit', async () => {
    const { tripped } = run(guard, [makeUserMessage('a'.repeat(10_000))]);
    expect(tripped).toBe(false);
  });

  it('aborts one character over the limit with a user-facing message', async () => {
    const { tripped, calls } = run(guard, [makeUserMessage('a'.repeat(10_001))]);
    expect(tripped).toBe(true);
    expect(calls[0].options.metadata.code).toBe('message-too-long');
    expect(calls[0].options.metadata.userMessage).toContain('too long');
  });

  it('respects MAX_MESSAGE_CHARS overrides', async () => {
    process.env.MAX_MESSAGE_CHARS = '50';
    const { tripped } = run(guard, [makeUserMessage('a'.repeat(51))]);
    expect(tripped).toBe(true);
  });

  it('is disabled when MAX_MESSAGE_CHARS is 0 or negative', async () => {
    process.env.MAX_MESSAGE_CHARS = '0';
    const { tripped } = run(guard, [makeUserMessage('a'.repeat(50_000))]);
    expect(tripped).toBe(false);
  });

  it('measures only the LATEST user message, not the thread history', async () => {
    const { tripped } = run(guard, [
      makeUserMessage('a'.repeat(9_000)),
      { role: 'assistant', content: { parts: [{ type: 'text', text: 'b'.repeat(9_000) }] } },
      makeUserMessage('short follow-up'),
    ]);
    expect(tripped).toBe(false);
  });

  it('is a no-op when there is no user text', async () => {
    const { tripped } = run(guard, [{ role: 'assistant', content: { parts: [] } }]);
    expect(tripped).toBe(false);
  });
});
