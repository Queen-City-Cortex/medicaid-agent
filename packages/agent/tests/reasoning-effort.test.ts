import { afterEach, describe, expect, it, vi } from 'vitest';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { handleChatStream } from '@mastra/ai-sdk';
import { AGENT_DEFAULT_OPTIONS, AGENT_REASONING_EFFORT, assertReasoningEffortSupported, createModel, parseReasoningEffort, sentReasoningEffort } from '../src/model.js';
import { deepResearchPlannerAgent, deepResearchReportAgent, deepResearchWorkerAgent } from '../src/deep-research/agents.js';
import { stubOpenAIResponses } from './helpers/openai-responses-stub.js';

const ANSWER = [{ type: 'message' as const, id: 'msg_1', text: 'Covered.' }];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('AGENT_REASONING_EFFORT', () => {
  it('defaults to medium and rejects values outside the allow-list', () => {
    // The exported value follows the ambient variable; the default is checked on the parser.
    expect(AGENT_REASONING_EFFORT).toBe(parseReasoningEffort(process.env.AGENT_REASONING_EFFORT));
    expect(parseReasoningEffort(undefined)).toBe('medium');
    expect(parseReasoningEffort('')).toBe('medium');
    expect(parseReasoningEffort('high')).toBe('high');
    expect(() => parseReasoningEffort('extreme')).toThrow('AGENT_REASONING_EFFORT must be one of: none, minimal, low, medium, high, xhigh, max');
    expect(() => parseReasoningEffort('Medium')).toThrow();
  });
});

describe('sentReasoningEffort, the value the CLI reports in agent_config', () => {
  const makeAgent = (modelId: string) => new Agent({
    id: 'chat', name: 'Chat', instructions: 'Answer the question.',
    model: createModel(modelId), defaultOptions: AGENT_DEFAULT_OPTIONS,
  });

  // gpt-4.1 and gpt-5-chat-latest are OpenAI ids the provider does not treat as reasoning models.
  it.each(['gpt-5.6-terra', 'gpt-5.4', 'gpt-5-mini', 'o3', 'o4-mini', 'gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-astra', 'gpt-4.1', 'gpt-5-chat-latest', 'o4'])(
    'matches what the installed OpenAI provider puts on the wire for %s', async (modelId) => {
      const { bodies } = stubOpenAIResponses([ANSWER]);
      await makeAgent(modelId).generate('Is it covered?', { maxSteps: 1 });
      expect(bodies[0].reasoning?.effort ?? null).toBe(sentReasoningEffort(modelId));
    });

  it('is the configured effort for a reasoning model and null where none is sent', () => {
    expect(sentReasoningEffort('gpt-5.6-terra')).toBe(AGENT_REASONING_EFFORT);
    expect(sentReasoningEffort('gpt-6.1-sol')).toBe(AGENT_REASONING_EFFORT);
    expect(sentReasoningEffort('gpt-4.1')).toBeNull();
    expect(sentReasoningEffort('gpt-5-chat-latest')).toBeNull();
    // Anthropic models ignore the openai options.
    expect(sentReasoningEffort('claude-sonnet-4-5')).toBeNull();
  });
});

describe('the GPT-6 family, which the installed provider does not know', () => {
  const makeAgent = (modelId: string) => new Agent({
    id: 'chat', name: 'Chat', instructions: 'Answer the question.',
    model: createModel(modelId), defaultOptions: AGENT_DEFAULT_OPTIONS,
  });

  it('is sent as a reasoning model: effort, developer instructions and encrypted reasoning with storage off', async () => {
    const { bodies } = stubOpenAIResponses([ANSWER]);
    await makeAgent('gpt-6.1-sol').generate('Is it covered?', { maxSteps: 1 });
    const known = stubOpenAIResponses([ANSWER]);
    await makeAgent('gpt-5.6-terra').generate('Is it covered?', { maxSteps: 1 });
    expect(bodies[0].model).toBe('gpt-6.1-sol');
    expect(bodies[0].store).toBe(false);
    expect(bodies[0].reasoning).toEqual({ effort: AGENT_REASONING_EFFORT });
    // Whatever the provider sends for a reasoning model it knows, it sends for Sol.
    expect(bodies[0].include).toEqual(known.bodies[0].include);
    expect(bodies[0].include).toContain('reasoning.encrypted_content');
    expect(bodies[0].input[0].role).toBe(known.bodies[0].input[0].role);
    expect(bodies[0].input[0].role).toBe('developer');
    expect(bodies[0].temperature).toBeUndefined();
  });

  it('refuses the effort levels the family rejects, at start-up', () => {
    for (const effort of ['none', 'minimal'] as const) {
      expect(() => assertReasoningEffortSupported('gpt-6.1-sol', effort)).toThrow(`AGENT_REASONING_EFFORT ${effort} is not supported by gpt-6.1-sol`);
      expect(() => assertReasoningEffortSupported('gpt-5.4', effort)).not.toThrow();
    }
    for (const effort of ['low', 'medium', 'high', 'xhigh'] as const) {
      expect(() => assertReasoningEffortSupported('gpt-6.1-sol', effort)).not.toThrow();
    }
    // GPT-6 Sol and Luna take `none`; none of the family takes `minimal`.
    for (const modelId of ['gpt-6-luna', 'gpt-6-sol']) {
      expect(() => assertReasoningEffortSupported(modelId, 'none')).not.toThrow();
      expect(() => assertReasoningEffortSupported(modelId, 'minimal')).toThrow();
    }
    expect(() => assertReasoningEffortSupported('gpt-6-astra', 'none')).toThrow();
    // `max` can be configured; only the documented GPT-6 rejections are refused here.
    expect(() => assertReasoningEffortSupported('gpt-6.1-sol', 'max')).not.toThrow();
    expect(() => assertReasoningEffortSupported('gpt-5.6-terra', 'max')).not.toThrow();
    expect(() => assertReasoningEffortSupported('claude-sonnet-5-5', 'none')).not.toThrow();
  });
});

describe('agent requests carry the configured reasoning effort', () => {
  // Built the way runtime.ts builds the chat agent: same factory, same options.
  const makeAgent = () => new Agent({
    id: 'chat', name: 'Chat', instructions: 'Answer the question.',
    model: createModel('gpt-5.4'), defaultOptions: AGENT_DEFAULT_OPTIONS,
  });

  it('on generate, the path the evaluation CLI uses', async () => {
    const { bodies } = stubOpenAIResponses([ANSWER]);
    await makeAgent().generate('Is it covered?', { maxSteps: 99 });
    expect(bodies[0].reasoning).toEqual({ effort: AGENT_REASONING_EFFORT });
    expect(bodies[0].store).toBe(false);
  });

  it('on the web chat stream, alongside the route\'s own default options', async () => {
    const { bodies } = stubOpenAIResponses([ANSWER]);
    const agent = makeAgent();
    const stream = await handleChatStream({
      mastra: new Mastra({ agents: { agent } }), agentId: 'chat', version: 'v6',
      params: { messages: [{ id: 'user', role: 'user', parts: [{ type: 'text', text: 'Is it covered?' }] }] },
      defaultOptions: { maxSteps: 99, savePerStep: true },
    });
    for await (const chunk of stream) void chunk;
    expect(bodies[0].reasoning).toEqual({ effort: AGENT_REASONING_EFFORT });
    expect(bodies[0].store).toBe(false);
  });

  it('on each deep-research agent', async () => {
    // The planner's own gates are classifier calls, not agent requests.
    vi.stubEnv('SCOPE_GATE_ENABLED', 'false');
    for (const agent of [deepResearchPlannerAgent, deepResearchWorkerAgent, deepResearchReportAgent]) {
      const { bodies } = stubOpenAIResponses([ANSWER]);
      await agent.generate('What does Policy 1A-2 cover?', { maxSteps: 1 });
      const request = bodies.find((body) => JSON.stringify(body.input[0]).includes('deep-research run')
        || JSON.stringify(body.input[0]).includes('research worker'));
      expect(request, agent.id).toBeDefined();
      expect(request.reasoning, agent.id).toEqual({ effort: AGENT_REASONING_EFFORT });
      expect(request.store, agent.id).toBe(false);
    }
  });
});
