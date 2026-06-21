import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

// The model instance the AI-SDK providers return. Aliasing the provider's own
// return type (rather than `ai`'s `LanguageModel`, which pins a newer provider
// version Mastra doesn't accept) keeps `createModel`'s exported type portable.
type ProviderModel = ReturnType<ReturnType<typeof createOpenAI>>;

// Model provider factory shared by the chat agent (src/index.ts) and the deep
// research agents (deep-research/agents.ts). Lives in its own module so the
// agents can import `createModel` without pulling in the whole Mastra instance
// from index.ts (which imports the agents — that would be a cycle).

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const AGENT_MODEL = process.env.AGENT_MODEL || 'gpt-5.4';

/** Resolve a model id ("gpt-5.4", "claude-…") to an AI SDK model instance.
 *  OpenAI reasoning models use the o1/o3/o4 prefixes; everything non-OpenAI
 *  (claude-*) routes to Anthropic. */
export function createModel(modelId: string): ProviderModel {
  if (
    modelId.startsWith('gpt-') ||
    modelId.startsWith('o1') ||
    modelId.startsWith('o3') ||
    modelId.startsWith('o4')
  ) {
    return openai(modelId);
  }
  return anthropic(modelId);
}
