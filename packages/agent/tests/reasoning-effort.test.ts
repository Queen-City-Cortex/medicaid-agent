import { afterEach, describe, expect, it, vi } from 'vitest';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { handleChatStream } from '@mastra/ai-sdk';
import { AGENT_DEFAULT_OPTIONS, AGENT_REASONING_EFFORT, createModel, parseReasoningEffort, sentReasoningEffort } from '../src/model.js';
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
    expect(() => parseReasoningEffort('extreme')).toThrow('AGENT_REASONING_EFFORT must be one of: none, minimal, low, medium, high, xhigh');
    expect(() => parseReasoningEffort('Medium')).toThrow();
  });
});

describe('sentReasoningEffort, the value the CLI reports in agent_config', () => {
  const makeAgent = (modelId: string) => new Agent({
    id: 'chat', name: 'Chat', instructions: 'Answer the question.',
    model: createModel(modelId), defaultOptions: AGENT_DEFAULT_OPTIONS,
  });

  // The last three are OpenAI ids the provider does not treat as reasoning models.
  it.each(['gpt-5.6-terra', 'gpt-5.4', 'gpt-5-mini', 'o3', 'o4-mini', 'gpt-4.1', 'gpt-5-chat-latest', 'o4'])(
    'matches what the installed OpenAI provider puts on the wire for %s', async (modelId) => {
      const { bodies } = stubOpenAIResponses([ANSWER]);
      await makeAgent(modelId).generate('Is it covered?', { maxSteps: 1 });
      expect(bodies[0].reasoning?.effort ?? null).toBe(sentReasoningEffort(modelId));
    });

  it('is the configured effort for a reasoning model and null where none is sent', () => {
    expect(sentReasoningEffort('gpt-5.6-terra')).toBe(AGENT_REASONING_EFFORT);
    expect(sentReasoningEffort('gpt-4.1')).toBeNull();
    expect(sentReasoningEffort('gpt-5-chat-latest')).toBeNull();
    // Anthropic models ignore the openai options.
    expect(sentReasoningEffort('claude-sonnet-4-5')).toBeNull();
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
