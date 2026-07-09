import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { strEnv } from './env.js';

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

// Default chosen by the 2026-07-09 agent-model A/B gate (scripts/eval-ab.sh
// agent, 3 runs × 50 held-out questions per arm): gpt-5.6-terra matched or beat
// gpt-5.4 on every judge dimension — overall 2.800 vs 2.760, hallucination
// 2.640 vs 2.553 (the safety-critical one) — at the SAME price ($2.50/$15) and
// a generation newer. Both arms' stable misses were the pre-existing
// judge-variance questions, not model regressions.
export const AGENT_MODEL = strEnv('AGENT_MODEL', 'gpt-5.6-terra');

/** Resolve a model id ("gpt-5.6-terra", "claude-…") to an AI SDK model instance.
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
