import { intEnv, isVerifierEnabled, strEnv } from '../../env.js';
import { assertReasoningEffortSupported, parseReasoningEffort, type ReasoningEffort } from '../../model.js';

/** Code default for `VERIFIER_MODEL`. Changing it is a verifier change under
 *  issue #18: measure it with the seeded-fault benchmark first
 *  (docs/operations/verifier-benchmark.md). gpt-6.1-terra replaced
 *  gpt-5.6-terra on the owner's decision although it failed decision 0002's
 *  cost-swap rule (docs/validation/model-upgrade-2026-11/). */
export const DEFAULT_VERIFIER_MODEL = 'gpt-6.1-terra';

/** Code default for `VERIFIER_REASONING_EFFORT`. Changing it is a verifier
 *  change under issue #18, decided by the benchmark in decision 0002. */
export const DEFAULT_VERIFIER_REASONING_EFFORT: ReasoningEffort = 'low';

/** `VERIFIER_REASONING_EFFORT`, or low when unset or blank; anything outside the allow-list throws. */
export function verifierReasoningEffort(env: NodeJS.ProcessEnv = process.env): ReasoningEffort {
  return parseReasoningEffort(env.VERIFIER_REASONING_EFFORT, DEFAULT_VERIFIER_REASONING_EFFORT, 'VERIFIER_REASONING_EFFORT');
}

/** Anthropic's effort setting takes low through max; the lower two levels are OpenAI's. */
const ANTHROPIC_REJECTED_EFFORTS: readonly ReasoningEffort[] = ['none', 'minimal'];

// ── Config ───────────────────────────────────────────────────────────────────

export function getConfig() {
  const maxTokens = intEnv('VERIFIER_MAX_SOURCE_TOKENS', 30000);
  return {
    enabled: isVerifierEnabled(),
    model: strEnv('VERIFIER_MODEL', DEFAULT_VERIFIER_MODEL),
    reasoningEffort: verifierReasoningEffort(),
    maxSourceChars: maxTokens * 4,
  };
}

/**
 * Start-up check for `VERIFIER_MODEL` and `VERIFIER_REASONING_EFFORT`.
 * `verifyAnswer` fails closed, so a model id the process cannot call, or an
 * effort the model rejects, does not crash anything: every answer is withheld
 * as "verification unavailable" instead. Refuse to boot in that state.
 *
 * `createModel` sends every id without an OpenAI prefix to Anthropic, so an id
 * that names neither provider is rejected here rather than guessed at. A
 * disabled verifier makes no call and needs no key.
 */
export function assertVerifierModelUsable(env: NodeJS.ProcessEnv = process.env): void {
  if (env.VERIFIER_ENABLED === 'false') return;
  const model = env.VERIFIER_MODEL || DEFAULT_VERIFIER_MODEL;
  const openai = /^(?:gpt-|o1|o3|o4)/.test(model);
  if (!openai && !model.startsWith('claude-')) {
    throw new Error(`VERIFIER_MODEL must be an OpenAI (gpt-, o1, o3, o4) or Anthropic (claude-) model id: ${model}`);
  }
  const key = openai ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  if (!env[key]?.trim()) throw new Error(`VERIFIER_MODEL ${model} requires ${key}`);
  const effort = verifierReasoningEffort(env);
  assertReasoningEffortSupported(model, effort, 'VERIFIER_REASONING_EFFORT');
  if (!openai && ANTHROPIC_REJECTED_EFFORTS.includes(effort)) {
    throw new Error(`VERIFIER_REASONING_EFFORT ${effort} is not supported by ${model}: Anthropic models take low, medium, high, xhigh or max`);
  }
}
