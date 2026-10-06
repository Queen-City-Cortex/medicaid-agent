import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateText } from 'ai';
import { PromptInjectionDetector } from '@mastra/core/processors';
import { createModel, openaiModel } from '../src/model.js';
import { classifyScopeWithOpenAI } from '../src/processors/scope-gate.js';
import { verifyAnswer } from '../src/processors/verifier/verify.js';
import { STUB_OPENAI_KEY, stubOpenAIResponses } from './helpers/openai-responses-stub.js';

// Every OpenAI request must say `store: false`: otherwise the prompt stays
// retrievable at OpenAI as a stored Response, where thread deletion cannot
// reach it. Each test drives one production call path against a fake fetch.

const message = (value: unknown) => [{ type: 'message' as const, id: 'msg_1', text: typeof value === 'string' ? value : JSON.stringify(value) }];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('OpenAI model factory', () => {
  it('sends store false and keeps call-site provider options', async () => {
    const { bodies } = stubOpenAIResponses([message('ok')]);
    await generateText({
      model: openaiModel('gpt-5-mini'),
      prompt: 'ok',
      providerOptions: { openai: { reasoningEffort: 'low' } },
    });
    expect(bodies[0].store).toBe(false);
    expect(bodies[0].reasoning).toEqual({ effort: 'low' });
    expect(bodies[0].include).toEqual(['reasoning.encrypted_content']);
  });

  it('reads the key per request, so a stubbed test never sends the ambient one', async () => {
    const { bodies, fetchMock } = stubOpenAIResponses([message('ok')]);
    await generateText({ model: openaiModel('gpt-5-mini'), prompt: 'ok' });
    expect(new Headers(fetchMock.mock.calls[0][1]!.headers).get('authorization')).toBe(`Bearer ${STUB_OPENAI_KEY}`);

    // The stub refuses any other key before recording a request.
    vi.stubEnv('OPENAI_API_KEY', 'sk-looks-like-a-real-key');
    await expect(generateText({ model: openaiModel('gpt-5-mini'), prompt: 'ok', maxRetries: 0 })).rejects.toThrow('other than the stub key');
    expect(bodies).toHaveLength(1);
  });

  it('createModel routes OpenAI ids through the factory', async () => {
    const { bodies } = stubOpenAIResponses([message('ok')]);
    await generateText({ model: createModel('gpt-5.6-terra'), prompt: 'ok' });
    expect(bodies[0]).toMatchObject({ model: 'gpt-5.6-terra', store: false });
  });

  it('the verifier call sends store false with its low reasoning effort', async () => {
    const { bodies } = stubOpenAIResponses([message({
      supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [],
      missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '',
    })]);
    const result = await verifyAnswer('question', 'answer', 'sources');
    expect(result.supported).toBe(true);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].store).toBe(false);
    expect(bodies[0].reasoning).toEqual({ effort: 'low' });
  });

  it('the scope gate call sends store false', async () => {
    const { bodies } = stubOpenAIResponses([message({ verdict: 'on_topic', reason: 'About Medicaid.' })]);
    const result = await classifyScopeWithOpenAI('user: Does Medicaid cover dental?');
    expect(result.object.verdict).toBe('on_topic');
    expect(bodies[0].store).toBe(false);
  });

  it('a prompt-injection detector built on the factory sends store false', async () => {
    const { bodies } = stubOpenAIResponses([message({ categories: null, reason: null })]);
    const detector = new PromptInjectionDetector({ model: openaiModel('gpt-5-mini'), threshold: 0.8, strategy: 'block' });
    const messages = [{ id: 'm', role: 'user', createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text: 'Does Medicaid cover dental?' }] } }];
    const abort = (reason?: string): never => { throw new Error(reason); };
    await expect(detector.processInput({ messages, abort } as any)).resolves.toHaveLength(1);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].store).toBe(false);
  });
});

describe('OpenAI construction stays in model.ts', () => {
  const src = fileURLToPath(new URL('../src', import.meta.url));
  const files = (readdirSync(src, { recursive: true }) as string[])
    .filter((file) => file.endsWith('.ts'))
    .map((file) => join(src, file));

  it('names the classifier model only in model.ts', () => {
    // usage/pricing.ts is a price table keyed by model id, not a call site.
    const offenders = files
      .filter((file) => !['model.ts', join('usage', 'pricing.ts')].includes(relative(src, file)))
      .filter((file) => /['"`](openai\/)?gpt-5-mini['"`]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(src, file));
    expect(offenders).toEqual([]);
  });

  it('finds no Mastra router string or private provider outside the factory', () => {
    const offenders = files
      .filter((file) => relative(src, file) !== 'model.ts')
      .filter((file) => /['"`]openai\/|createOpenAI\(/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(src, file));
    expect(files.length).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});
