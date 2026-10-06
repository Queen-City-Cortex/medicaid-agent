import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLASSIFIER_DEADLINE_MS, CLASSIFIER_MODEL } from '../../src/model.js';
import { createInjectionDetector, isDetectorFailure } from '../../src/processors/injection-detector.js';
import { log } from '../../src/logger.js';
import { stubOpenAIKey, stubOpenAIResponses } from '../helpers/openai-responses-stub.js';

const messages = [{ id: 'm', role: 'user', createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text: 'Does Medicaid cover dental?' }] } }];
const abort = (reason?: string): never => { throw new Error(`blocked: ${reason}`); };
const run = () => createInjectionDetector().processInput({ messages, abort } as any);
const verdict = (value: unknown) => [[{ type: 'message' as const, id: 'msg_1', text: JSON.stringify(value) }]];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('shared prompt-injection detector', () => {
  it('calls the classifier model with storage off and no sampling parameters', async () => {
    const { bodies } = stubOpenAIResponses(verdict({ categories: null, reason: null }));
    await run();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].model).toBe(CLASSIFIER_MODEL);
    expect(bodies[0].store).toBe(false);
    // Mastra asks for temperature 0; the provider drops it for reasoning models.
    expect(bodies[0].temperature).toBeUndefined();
  });

  it('screens only the newest message, at both sites that build a detector', async () => {
    const { bodies } = stubOpenAIResponses(verdict({ categories: null, reason: null }));
    const text = (id: string, role: string, value: string) => ({ id, role, createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text: value }] } });
    const thread = [text('q1', 'user', 'RECALLED_QUESTION'), text('a1', 'assistant', 'RECALLED_ANSWER'), text('q2', 'user', 'NEWEST_QUESTION')];
    await expect(createInjectionDetector().processInput({ messages: thread, abort } as any)).resolves.toHaveLength(3);
    expect(bodies).toHaveLength(1);
    expect(JSON.stringify(bodies[0])).toContain('NEWEST_QUESTION');
    expect(JSON.stringify(bodies[0])).not.toContain('RECALLED_');
    // The chat agent and the research planner must not build their own.
    for (const file of ['../../src/index.ts', '../../src/deep-research/agents.ts']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).toContain('createInjectionDetector()');
      expect(source).not.toContain('new PromptInjectionDetector');
    }
  });

  it('logs nothing when the classifier answers, benign or not', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    stubOpenAIResponses(verdict({ categories: null, reason: null }));
    await expect(run()).resolves.toHaveLength(1);

    stubOpenAIResponses(verdict({ categories: [{ type: 'injection', score: 0.95 }], reason: 'Overrides instructions.' }));
    await expect(run()).rejects.toThrow('blocked');
    expect(error).not.toHaveBeenCalled();
  });

  it('reports a failed classifier call, which the detector otherwise lets through silently', async () => {
    // What OpenAI answers for a retired model.
    stubOpenAIKey();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'The model does not exist', type: 'invalid_request_error', param: null, code: 'model_not_found' } }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    )));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});

    await expect(run()).resolves.toHaveLength(1);
    expect(error).toHaveBeenCalledExactlyOnceWith('prompt_injection.failed_open', { model: CLASSIFIER_MODEL, deadlineMs: CLASSIFIER_DEADLINE_MS });
  });

  it('pins the failure signature of the installed detector', () => {
    const event = (detectionResult: any) => ({ detectionResult, input: 'x', flagged: false, strategyApplied: 'none' as const });
    expect(isDetectorFailure(event({ categories: null, reason: null, rewritten_content: null }))).toBe(true);
    expect(isDetectorFailure(event({ categories: null, reason: null }))).toBe(false);
    expect(isDetectorFailure(event({ categories: [], reason: 'Benign question.' }))).toBe(false);
  });
});
