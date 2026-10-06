import { vi } from 'vitest';

/** One Responses API output item, as OpenAI returns it. */
export type StubOutputItem =
  | { type: 'reasoning'; id: string; encrypted_content?: string; summary: [] }
  | { type: 'function_call'; id: string; call_id: string; name: string; arguments: string }
  | { type: 'message'; id: string; text: string };

const USAGE = { input_tokens: 1, output_tokens: 1 };

function jsonBody(model: string, output: StubOutputItem[]) {
  return {
    id: 'resp_stub',
    created_at: 0,
    model,
    usage: USAGE,
    output: output.map((item) =>
      item.type === 'message'
        ? { type: 'message', role: 'assistant', id: item.id, content: [{ type: 'output_text', text: item.text, annotations: [] }] }
        : item,
    ),
  };
}

function sseBody(model: string, output: StubOutputItem[]): string {
  const events: unknown[] = [{ type: 'response.created', response: { id: 'resp_stub', created_at: 0, model } }];
  output.forEach((item, output_index) => {
    const wire = item.type === 'message' ? { type: 'message', id: item.id } : item;
    events.push({ type: 'response.output_item.added', output_index, item: item.type === 'function_call' ? { ...item, arguments: '' } : wire });
    if (item.type === 'message') events.push({ type: 'response.output_text.delta', item_id: item.id, delta: item.text });
    events.push({ type: 'response.output_item.done', output_index, item: item.type === 'function_call' ? { ...item, status: 'completed' } : wire });
  });
  events.push({ type: 'response.completed', response: { usage: USAGE } });
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
}

/** The only key a stubbed request may carry. */
export const STUB_OPENAI_KEY = 'sk-test-stub-not-a-real-key';

/** Give the provider a dummy key, whatever the ambient environment holds.
 *  Undo with `vi.unstubAllEnvs()`. */
export function stubOpenAIKey(): void {
  vi.stubEnv('OPENAI_API_KEY', STUB_OPENAI_KEY);
}

/**
 * Replace global fetch with an offline OpenAI Responses endpoint. Each call
 * consumes the next scripted output (the last one repeats) and answers in the
 * shape the request asked for: server-sent events when `stream` is true, JSON
 * otherwise. Any other URL fails the test rather than reaching a network, and
 * so does a request carrying any key but the dummy one, so a developer's real
 * OPENAI_API_KEY can neither be needed nor leave the process. Callers restore
 * with `vi.unstubAllGlobals()` and `vi.unstubAllEnvs()`.
 */
export function stubOpenAIResponses(script: StubOutputItem[][]) {
  const bodies: any[] = [];
  stubOpenAIKey();
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (!String(url).endsWith('/v1/responses')) throw new Error(`Unexpected request in offline test: ${String(url)}`);
    if (new Headers(init?.headers).get('authorization') !== `Bearer ${STUB_OPENAI_KEY}`) {
      throw new Error('Offline test sent a key other than the stub key');
    }
    const body = JSON.parse(String(init?.body));
    const output = script[Math.min(bodies.length, script.length - 1)];
    bodies.push(body);
    return body.stream
      ? new Response(sseBody(body.model, output), { headers: { 'content-type': 'text/event-stream' } })
      : new Response(JSON.stringify(jsonBody(body.model, output)), { headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { bodies, fetchMock };
}
