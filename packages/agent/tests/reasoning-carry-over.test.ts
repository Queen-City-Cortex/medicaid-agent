import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { AGENT_DEFAULT_OPTIONS, createModel, openaiModel } from '../src/model.js';
import { HallucinationVerifier } from '../src/processors/verifier/processor.js';
import { OpenAIResponsesDedupProcessor } from '../src/processors/openai-responses-dedup.js';
import { stubOpenAIResponses, type StubOutputItem } from './helpers/openai-responses-stub.js';

vi.mock('../src/processors/verifier/run.js', async original => ({
  ...await original<typeof import('../src/processors/verifier/run.js')>(),
  runVerificationForAnswer: vi.fn(async ({ answerText }: { answerText: string }) => ({
    finalAnswer: answerText,
    outcome: { status: 'passed', passCount: 1 },
    telemetry: { latency_ms: 0 },
  })),
  emitVerifierTelemetry: vi.fn(),
}));

// With `store: false` OpenAI keeps no response items, so the model's reasoning
// can only survive a tool step if the client sends it back itself. These tests
// prove the installed provider and Mastra do that with encrypted content.

const ENCRYPTED = 'gAAAA-encrypted-reasoning-blob';
const lookup = createTool({
  id: 'lookup',
  description: 'Look up a policy',
  inputSchema: z.object({ q: z.string() }),
  execute: async () => ({ text: 'The service is covered.' }),
});

const TOOL_STEP: StubOutputItem[] = [
  { type: 'reasoning', id: 'rs_1', encrypted_content: ENCRYPTED, summary: [] },
  { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'lookup', arguments: '{"q":"coverage"}' },
];
const ANSWER_STEP: StubOutputItem[] = [{ type: 'message', id: 'msg_1', text: 'The service is covered.' }];

function makeAgent(processors: { web: boolean }) {
  return new Agent({
    id: 'carry-over',
    name: 'Carry-over',
    instructions: 'Answer the question.',
    model: openaiModel('gpt-5.6-terra'),
    tools: { lookup },
    inputProcessors: [new OpenAIResponsesDedupProcessor()],
    // The web chat path runs the verifier as an output processor; the CLI path does not.
    outputProcessors: processors.web ? [new HallucinationVerifier()] : [],
  });
}

function reasoningItems(body: any) {
  return body.input.filter((item: any) => item.type === 'reasoning');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('reasoning carry-over with storage off', () => {
  for (const web of [false, true]) {
    for (const mode of ['generate', 'stream'] as const) {
      it(`${web ? 'web' : 'CLI'} ${mode}: sends encrypted reasoning back inline on the next step`, async () => {
        const { bodies } = stubOpenAIResponses([TOOL_STEP, ANSWER_STEP]);
        const agent = makeAgent({ web });
        const text = mode === 'generate'
          ? (await agent.generate('Is it covered?', { maxSteps: 3 })).text
          : await (await agent.stream('Is it covered?', { maxSteps: 3 })).text;

        expect(text).toBe('The service is covered.');
        expect(bodies).toHaveLength(2);
        for (const body of bodies) {
          expect(body.store).toBe(false);
          expect(body.include).toContain('reasoning.encrypted_content');
          expect(JSON.stringify(body)).not.toContain('item_reference');
          expect(body.previous_response_id).toBeUndefined();
        }
        expect(reasoningItems(bodies[1])).toEqual([
          { type: 'reasoning', id: 'rs_1', encrypted_content: ENCRYPTED, summary: [] },
        ]);
        // The reasoning item precedes the call it produced, as the API requires.
        const types = bodies[1].input.map((item: any) => item.type ?? item.role);
        expect(types.indexOf('reasoning')).toBeLessThan(types.indexOf('function_call'));
        expect(types).toContain('function_call_output');
      });
    }
  }

  it('web: a narrated step loses its narration and its reasoning; a silent step keeps its reasoning', async () => {
    const { bodies } = stubOpenAIResponses([
      [
        { type: 'reasoning', id: 'rs_narrated', encrypted_content: 'narrated-blob', summary: [] },
        { type: 'message', id: 'msg_interim', text: 'Let me look that up.' },
        TOOL_STEP[1],
      ],
      [
        { type: 'reasoning', id: 'rs_silent', encrypted_content: ENCRYPTED, summary: [] },
        { type: 'function_call', id: 'fc_2', call_id: 'call_2', name: 'lookup', arguments: '{"q":"limits"}' },
      ],
      ANSWER_STEP,
    ]);
    await makeAgent({ web: true }).generate('Is it covered?', { maxSteps: 5 });

    expect(bodies).toHaveLength(3);
    const replayed = JSON.stringify(bodies[2].input);
    expect(replayed).not.toContain('Let me look that up.');
    // Never a reasoning item whose following output item was removed.
    expect(replayed).not.toContain('rs_narrated');
    expect(reasoningItems(bodies[2])).toEqual([
      { type: 'reasoning', id: 'rs_silent', encrypted_content: ENCRYPTED, summary: [] },
    ]);
    expect(replayed).not.toContain('item_reference');
    expect(bodies[2].input.filter((item: any) => item.type === 'function_call')).toHaveLength(2);
  });

  // Without the web verifier nothing removes an interim sentence, so the whole
  // step is replayed. OpenAI rejects a reasoning item that is not followed by
  // the output item it produced, so the order is part of the contract.
  const NARRATED_STEP: StubOutputItem[] = [
    { type: 'reasoning', id: 'rs_narrated', encrypted_content: 'narrated-blob', summary: [] },
    { type: 'message', id: 'msg_interim', text: 'Let me look that up.' },
    TOOL_STEP[1],
  ];
  // Deep-research agents are built as deep-research/agents.ts builds them:
  // the model factory, the shared default options, no output processors.
  const researchAgent = () => new Agent({
    id: 'research-shape', name: 'Research shape', instructions: 'Research the question.',
    model: createModel('gpt-5.6-terra'), defaultOptions: AGENT_DEFAULT_OPTIONS, tools: { lookup },
  });

  it.each([
    ['CLI', () => makeAgent({ web: false })],
    ['deep-research', researchAgent],
  ])('%s: a narrated step is replayed as reasoning, then the assistant message, then the function call', async (_path, build) => {
    const { bodies } = stubOpenAIResponses([NARRATED_STEP, ANSWER_STEP]);
    const result = await build().generate('Is it covered?', { maxSteps: 3 });

    expect(result.text).toContain('The service is covered.');
    expect(bodies).toHaveLength(2);
    const replayed = bodies[1].input.slice(bodies[1].input.findIndex((item: any) => item.type === 'reasoning'));
    expect(replayed.map((item: any) => item.type ?? item.role)).toEqual(['reasoning', 'assistant', 'function_call', 'function_call_output']);
    expect(replayed[0]).toEqual({ type: 'reasoning', id: 'rs_narrated', encrypted_content: 'narrated-blob', summary: [] });
    expect(JSON.stringify(replayed[1])).toContain('Let me look that up.');
    expect(replayed[2]).toMatchObject({ type: 'function_call', call_id: 'call_1', name: 'lookup' });
    for (const body of bodies) {
      expect(body.store).toBe(false);
      expect(body.include).toContain('reasoning.encrypted_content');
      expect(body.previous_response_id).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain('item_reference');
    }
  });

  it('drops reasoning that has no encrypted content instead of referencing a stored item', async () => {
    // What a thread written before storage was turned off replays: an item id only.
    const { bodies } = stubOpenAIResponses([
      [{ type: 'reasoning', id: 'rs_old', summary: [] }, TOOL_STEP[1]],
      ANSWER_STEP,
    ]);
    const result = await makeAgent({ web: false }).generate('Is it covered?', { maxSteps: 3 });

    expect(result.text).toBe('The service is covered.');
    expect(reasoningItems(bodies[1])).toEqual([]);
    expect(JSON.stringify(bodies[1])).not.toContain('item_reference');
    expect(JSON.stringify(bodies[1])).not.toContain('rs_old');
  });
});
