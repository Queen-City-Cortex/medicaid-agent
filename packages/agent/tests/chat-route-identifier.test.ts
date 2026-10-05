import { describe, expect, it, vi } from 'vitest';
import { createChatRoute } from '../src/chat-route.js';
import { MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context';

// The screen runs before any storage or model work, so a context whose memory
// store is missing is enough: a request that passes the screen reaches the
// storage check and gets 503, and a rejected one gets 422.
async function post(body: unknown) {
  const route = createChatRoute({ record: vi.fn() }, {});
  const requestContext = new Map<string, unknown>([[MASTRA_RESOURCE_ID_KEY, 'user-1']]);
  const context = {
    req: { json: async () => body, raw: { signal: new AbortController().signal } },
    get: (key: string) => (key === 'requestContext' ? requestContext : { getStorage: () => undefined }),
    json: (payload: unknown, status = 200) => ({ payload, status }),
  };
  return (route as unknown as { handler: (c: unknown) => Promise<{ payload: { error: { code: string } }; status: number }> }).handler(context);
}

const user = (text: string) => ({ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] });
const assistant = (text: string) => ({ id: crypto.randomUUID(), role: 'assistant', parts: [{ type: 'text', text }] });

describe('chat identifier screen', () => {
  it('ignores replayed history and screens only the newest user message', async () => {
    const res = await post({
      memory: { thread: 't-1' },
      messages: [
        user('Who do I call about transportation?'),
        assistant('Call the NC Medicaid Contact Center at (888) 245-0179, or write to Raleigh NC 27699-2501.'),
        user('Does Medicaid non-emergency medical transportation cover dialysis trips?'),
      ],
    });
    expect(res.status).toBe(503);
    expect(res.payload.error.code).toBe('memory_unavailable');
  });

  it('rejects an identifier in the newest user message with the nested envelope', async () => {
    const res = await post({
      memory: { thread: 't-1' },
      messages: [user('My Medicaid ID is 945123456K, am I covered?')],
    });
    expect(res.status).toBe(422);
    expect(res.payload).toEqual({
      error: { code: 'client_identifier_detected', message: 'Remove client-identifying information before sending this question.' },
    });
  });

  it('does not reject on an identifier that appears only in an earlier user turn', async () => {
    const res = await post({
      memory: { thread: 't-1' },
      messages: [user('Call me at (919) 555-1212'), assistant('Withheld.'), user('What does Policy 3L cover?')],
    });
    expect(res.status).toBe(503);
  });
});
