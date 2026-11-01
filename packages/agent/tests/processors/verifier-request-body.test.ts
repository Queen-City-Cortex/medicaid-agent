import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VERIFIER_PROMPT, verifyAnswer } from '../../src/processors/verifier/verify.js';
import { getConfig } from '../../src/processors/verifier/config.js';
import { stubOpenAIResponses } from '../helpers/openai-responses-stub.js';

// The JSON the verifier sends to OpenAI for a fixed input, recorded before
// `verifyAnswer` moved from `openaiModel()` to `createModel()`.
// Model, reasoning effort, response storage, the encrypted-reasoning include,
// the strict JSON-schema mode and the message layout are all in this body, so
// drift in any provider setting fails here. The system prompt is asserted on
// its own, so that a prompt edit does not need the fixture regenerated.
const RECORDED = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/verifier-openai-request.json', import.meta.url)), 'utf8'));

const CLEAN = {
  supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [],
  missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '',
};

const verifyFixedInput = () => verifyAnswer(
  'Does NC Medicaid cover chiropractic care?',
  'Yes, with limits [Policy 1F § 3.2](https://example.test/1f).',
  '[getSection]\nSection: 3.2\nContent:\nChiropractic services are covered when medically necessary.',
  undefined,
  undefined,
  { unknownUrls: ['https://example.test/unknown'], unknownQuotes: [], hasSupplementaryEvidence: true, coverageRequirements: ['Use the 2026 period.'] },
);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('verifier request', () => {
  it('sends OpenAI the recorded body for the default model', async () => {
    vi.stubEnv('VERIFIER_MODEL', '');
    vi.stubEnv('VERIFIER_REASONING_EFFORT', '');
    const { bodies } = stubOpenAIResponses([[{ type: 'message', id: 'msg_1', text: JSON.stringify(CLEAN) }]]);
    expect((await verifyFixedInput()).supported).toBe(true);
    expect(bodies).toHaveLength(1);

    const [system, ...rest] = bodies[0].input;
    expect(system.role).toBe('developer');
    expect(system.content.startsWith(VERIFIER_PROMPT)).toBe(true);
    expect({ ...bodies[0], input: [{ ...system, content: RECORDED.input[0].content }, ...rest] }).toEqual(RECORDED);
    // Key order is part of the bytes sent.
    expect(Object.keys(bodies[0])).toEqual(Object.keys(RECORDED));
  });

  it('pins the default model, low effort and storage off (issue #18)', () => {
    vi.stubEnv('VERIFIER_MODEL', '');
    vi.stubEnv('VERIFIER_REASONING_EFFORT', '');
    expect(getConfig().model).toBe('gpt-5.6-terra');
    expect(getConfig().reasoningEffort).toBe('low');
    expect(RECORDED).toMatchObject({ model: 'gpt-5.6-terra', store: false, reasoning: { effort: 'low' } });
    expect(RECORDED.text.format).toMatchObject({ type: 'json_schema', strict: true });
  });

  it('sends a Claude VERIFIER_MODEL to Anthropic and returns its verdict', async () => {
    vi.stubEnv('VERIFIER_MODEL', 'claude-sonnet-4-6');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test-stub-not-a-real-key');
    const requests: Array<{ url: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      if (!String(url).startsWith('https://api.anthropic.com/')) throw new Error(`Unexpected request in offline test: ${String(url)}`);
      return new Response(JSON.stringify({
        id: 'msg_stub', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6',
        content: [{ type: 'text', text: JSON.stringify(CLEAN) }],
        stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
      }), { headers: { 'content-type': 'application/json' } });
    }));

    const result = await verifyFixedInput();
    expect(requests.map(request => request.url)).toEqual(['https://api.anthropic.com/v1/messages']);
    expect(requests[0].body.model).toBe('claude-sonnet-4-6');
    expect(result).toMatchObject({ supported: true, unsupportedClaims: [] });
  });

  // Issue #62: older Anthropic providers sent Claude 5.5 a 4,096-token output
  // cap and a forced tool choice, which Anthropic rejects for structured
  // output. Pin what the updated provider sends instead.
  it('sends Claude 5.5 the full output cap and native JSON-schema output, with no tool choice', async () => {
    vi.stubEnv('VERIFIER_MODEL', 'claude-sonnet-5-5');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test-stub-not-a-real-key');
    const requests: Array<{ url: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      if (!String(url).startsWith('https://api.anthropic.com/')) throw new Error(`Unexpected request in offline test: ${String(url)}`);
      return new Response(JSON.stringify({
        id: 'msg_stub', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5',
        content: [{ type: 'text', text: JSON.stringify(CLEAN) }],
        stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
      }), { headers: { 'content-type': 'application/json' } });
    }));

    expect((await verifyFixedInput()).supported).toBe(true);
    expect(requests.map(request => request.url)).toEqual(['https://api.anthropic.com/v1/messages']);
    const { body } = requests[0];
    expect(Object.keys(body)).toEqual(['model', 'max_tokens', 'output_config', 'system', 'messages']);
    expect(body).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 128000, output_config: { effort: 'low', format: { type: 'json_schema' } } });
    expect(body.output_config.format.schema.required).toEqual(Object.keys(CLEAN));
  });

  it('caps output only when the caller sets a limit, as the benchmark does', async () => {
    vi.stubEnv('VERIFIER_MODEL', '');
    const { bodies } = stubOpenAIResponses([
      [{ type: 'message', id: 'msg_1', text: JSON.stringify(CLEAN) }],
      [{ type: 'message', id: 'msg_2', text: JSON.stringify(CLEAN) }],
    ]);
    await verifyFixedInput();
    await verifyAnswer('q', 'a', 's', undefined, undefined, undefined, { maxOutputTokens: 6000 });
    expect(bodies[0].max_output_tokens).toBeUndefined();
    expect(bodies[1].max_output_tokens).toBe(6000);
  });

  it('sends OpenAI the effort VERIFIER_REASONING_EFFORT names', async () => {
    vi.stubEnv('VERIFIER_MODEL', '');
    vi.stubEnv('VERIFIER_REASONING_EFFORT', 'medium');
    const { bodies } = stubOpenAIResponses([[{ type: 'message', id: 'msg_1', text: JSON.stringify(CLEAN) }]]);
    await verifyFixedInput();
    expect(bodies[0].reasoning).toEqual({ effort: 'medium' });
  });

  it('sends a Claude verifier the effort under the Anthropic setting', async () => {
    vi.stubEnv('VERIFIER_MODEL', 'claude-sonnet-5-5');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test-stub-not-a-real-key');
    vi.stubEnv('VERIFIER_REASONING_EFFORT', 'high');
    const bodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({
        id: 'msg_stub', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5',
        content: [{ type: 'text', text: JSON.stringify(CLEAN) }],
        stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
      }), { headers: { 'content-type': 'application/json' } });
    }));
    await verifyFixedInput();
    expect(bodies[0].output_config.effort).toBe('high');
  });
});
