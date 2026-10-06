import { intEnv, isVerifierEnabled, strEnv } from '../../env.js';

/** Code default for `VERIFIER_MODEL`. Changing it is a verifier change under
 *  issue #188: measure it with the seeded-fault benchmark first
 *  (docs/operations/verifier-benchmark.md). */
export const DEFAULT_VERIFIER_MODEL = 'gpt-5.6-terra';

// ── Config ───────────────────────────────────────────────────────────────────

export function getConfig() {
  const maxTokens = intEnv('VERIFIER_MAX_SOURCE_TOKENS', 30000);
  return {
    enabled: isVerifierEnabled(),
    model: strEnv('VERIFIER_MODEL', DEFAULT_VERIFIER_MODEL),
    maxSourceChars: maxTokens * 4,
  };
}

/**
 * Start-up check for `VERIFIER_MODEL`. `verifyAnswer` fails closed, so a model
 * id the process cannot call does not crash anything: every answer is withheld
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
}
