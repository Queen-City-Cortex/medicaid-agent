import { intEnv, isVerifierEnabled, strEnv } from '../../env.js';

// ── Config ───────────────────────────────────────────────────────────────────

export function getConfig() {
  const maxTokens = intEnv('VERIFIER_MAX_SOURCE_TOKENS', 30000);
  return {
    enabled: isVerifierEnabled(),
    model: strEnv('VERIFIER_MODEL', 'gpt-5.4-mini'),
    maxSourceChars: maxTokens * 4,
  };
}
