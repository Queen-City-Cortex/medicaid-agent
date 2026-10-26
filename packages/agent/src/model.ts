import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { defaultSettingsMiddleware, wrapLanguageModel } from 'ai';
import { strEnv } from './env.js';

// The model instance the AI-SDK providers return. Aliasing a provider's own
// return type (rather than `ai`'s `LanguageModel`, which pins a newer provider
// version Mastra doesn't accept) keeps `createModel`'s exported type portable.
// The wrapped OpenAI model is the same specification-v3 interface, without the
// OpenAI provider's own extras.
type ProviderModel = ReturnType<ReturnType<typeof createAnthropic>>;

// Model provider factory shared by the chat agent (src/runtime.ts) and the deep
// research agents (deep-research/agents.ts). Lives in its own module so the
// agents can import `createModel` without pulling in the whole Mastra instance
// from index.ts or cli.ts (which import the agents — that would be a cycle).

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// No explicit apiKey: the provider then reads OPENAI_API_KEY on each request
// rather than freezing whatever the variable held when this module loaded.
const openai = createOpenAI();

/** The only way this package builds an OpenAI model. Every request carries
 *  `store: false`, so OpenAI keeps no retrievable Response object for the
 *  prompt (abuse-monitoring logs are separate; see RUNBOOK). Call-site
 *  providerOptions such as `reasoningEffort` deep-merge over this default.
 *  With storage off the provider asks for encrypted reasoning and replays it
 *  inline between tool steps instead of sending stored item references. */
export function openaiModel(modelId: string): ProviderModel {
  return wrapLanguageModel({
    model: openai(modelId),
    middleware: defaultSettingsMiddleware({
      settings: {
        providerOptions: {
          openai: { store: false, ...(isGpt6(modelId) ? { forceReasoning: true } : {}) },
        },
      },
    }),
  });
}

/** The GPT-6 family (gpt-6.1-sol, gpt-6-luna, gpt-6-astra) are reasoning
 *  models, but the installed provider's own rule stops at gpt-5: left alone it
 *  would drop `reasoningEffort`, send instructions as a system message and,
 *  with storage off, not ask for the encrypted reasoning it must replay
 *  between tool steps. `forceReasoning` is the provider's switch for an id it
 *  does not know. Remove this once the pinned provider recognises gpt-6. */
function isGpt6(modelId: string): boolean {
  return modelId.startsWith('gpt-6');
}

/** Efforts a GPT-6 model is documented to reject (OpenAI model pages, October
 *  2026): none takes `minimal`; GPT-6.1 Sol and Astra also reject `none`, which
 *  GPT-6 Sol and Luna accept. Other models are not policed here: the provider
 *  answers for what they accept. */
function unsupportedEfforts(modelId: string): readonly ReasoningEffort[] {
  if (!isGpt6(modelId)) return [];
  return modelId.startsWith('gpt-6.1-sol') || modelId.startsWith('gpt-6-astra') ? ['none', 'minimal'] : ['minimal'];
}

/** Start-up check: a model that rejects the configured effort fails every
 *  request, so refuse to boot instead. */
export function assertReasoningEffortSupported(modelId: string, effort: ReasoningEffort): void {
  if (unsupportedEfforts(modelId).includes(effort)) {
    throw new Error(`AGENT_REASONING_EFFORT ${effort} is not supported by ${modelId}`);
  }
}

/** `model` with a deadline on every call it makes, joined to any signal the
 *  caller passed. For callers that cannot pass a signal themselves: Mastra's
 *  PromptInjectionDetector has no deadline or signal option. */
export function withCallDeadline(model: ProviderModel, deadlineMs: number): ProviderModel {
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: 'v3',
      transformParams: async ({ params }) => {
        const deadline = AbortSignal.timeout(deadlineMs);
        return { ...params, abortSignal: params.abortSignal ? AbortSignal.any([params.abortSignal, deadline]) : deadline };
      },
      // Mastra's default error processors retry a call whose error looks
      // transient, and the detector's internal agent cannot turn them off. A
      // plain error, without the provider's error as its cause, is never
      // retried, so the deadline bounds the one attempt.
      wrapGenerate: async ({ doGenerate }) => {
        try { return await doGenerate(); } catch (error) { throw unretryable(error); }
      },
      wrapStream: async ({ doStream }) => {
        try { return await doStream(); } catch (error) { throw unretryable(error); }
      },
    },
  });
}

function unretryable(error: unknown): Error {
  return new Error(error instanceof Error ? error.message : String(error));
}

// Model for the cheap classifiers that run before the agent: the scope gate,
// both prompt-injection detectors, and the health probe's default target.
// SCOPE_GATE_MODEL overrides it for all of them. gpt-5-mini's only snapshot
// (gpt-5-mini-2025-08-07) leaves the OpenAI API on 2026-12-11, and both
// classifiers fail open, so screening would switch off silently. Change the
// default here to gpt-5.4-mini before that date, after the qualification
// steps in docs/development/gotchas.md.
export const CLASSIFIER_MODEL = strEnv('SCOPE_GATE_MODEL', 'gpt-5-mini');

// Deadline for one classifier call on the request path (scope gate and
// prompt-injection detector). Both run before the agent starts and both fail
// open, so this is the longest a slow provider can hold a turn at each gate.
// Provisional: the top of the 8 to 10 second range from the October 2026
// review, because the classifier's latency at its default reasoning effort has
// not been measured. Set it from a measured run (docs/development/gotchas.md).
export const CLASSIFIER_DEADLINE_MS = 10_000;

// Default chosen by the 2026-07-09 agent-model A/B gate (scripts/eval-ab.sh
// agent, 3 runs × 50 held-out questions per arm): gpt-5.6-terra matched or beat
// gpt-5.4 on every judge dimension — overall 2.800 vs 2.760, hallucination
// 2.640 vs 2.553 (the safety-critical one) — at the SAME price ($2.50/$15) and
// a generation newer. Both arms' stable misses were the pre-existing
// judge-variance questions, not model regressions.
export const AGENT_MODEL = strEnv('AGENT_MODEL', 'gpt-5.6-terra');

// Reasoning effort for the chat agent and the three deep-research agents. Left
// unset, each model runs at its own API default (none for gpt-5.4, medium for
// gpt-5.6-terra), so changing AGENT_MODEL silently changed effort too. The
// 2026-07-09 comparison above ran each model at that default and so varied
// both. Medium is what the gpt-5.6-terra evaluations ran at.
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** Unset or blank means medium; anything outside the allow-list throws. */
export function parseReasoningEffort(raw: string | undefined): ReasoningEffort {
  const value = raw?.trim() || 'medium';
  if (!(REASONING_EFFORTS as readonly string[]).includes(value)) {
    throw new Error(`AGENT_REASONING_EFFORT must be one of: ${REASONING_EFFORTS.join(', ')}`);
  }
  return value as ReasoningEffort;
}

export const AGENT_REASONING_EFFORT = parseReasoningEffort(process.env.AGENT_REASONING_EFFORT);

/** `defaultOptions` for every agent that answers or researches. Anthropic
 *  models ignore the `openai` key. */
export const AGENT_DEFAULT_OPTIONS = {
  providerOptions: { openai: { reasoningEffort: AGENT_REASONING_EFFORT } },
};

/** The reasoning effort a request to `modelId` actually carries, or null when
 *  none is sent: Anthropic models ignore the `openai` options, and the OpenAI
 *  provider drops the setting for ids it does not treat as reasoning models
 *  (its rule, copied here: any o-series id, and gpt-5 or later other than
 *  gpt-5-chat; gpt-6 ids are forced on in `openaiModel`).
 *  tests/reasoning-effort.test.ts checks this against the installed provider. */
export function sentReasoningEffort(modelId: string): ReasoningEffort | null {
  const reasoning = /^o\d/.test(modelId)
    || (modelId.startsWith('gpt-5') && !modelId.startsWith('gpt-5-chat'))
    || isGpt6(modelId);
  return reasoning ? AGENT_REASONING_EFFORT : null;
}

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
    return openaiModel(modelId);
  }
  return anthropic(modelId);
}
