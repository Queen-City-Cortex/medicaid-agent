// ── Config ───────────────────────────────────────────────────────────────────

export function getConfig() {
  const maxTokens = parseInt(process.env.VERIFIER_MAX_SOURCE_TOKENS || '30000', 10);
  return {
    enabled: process.env.VERIFIER_ENABLED !== 'false',
    model: process.env.VERIFIER_MODEL || 'gpt-5.4-mini',
    maxSourceChars: maxTokens * 4,
  };
}
