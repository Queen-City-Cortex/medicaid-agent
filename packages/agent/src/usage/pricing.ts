export interface ModelPricing {
  /** USD per 1M input tokens. */
  inputPerMTok: number;
  /** USD per 1M output tokens. */
  outputPerMTok: number;
  /** USD per 1M cached input tokens (prompt-cache reads). */
  cachedInputPerMTok: number;
}

/**
 * Price table for the models this deployment actually runs, keyed by model-id
 * prefix (longest prefix wins). Used only by usage-report rollups — recorded
 * usage_events rows never bake in a price, so a rate change is a one-line
 * edit here, retroactively correct.
 *
 * Rates as of 2026-07 (per 1M tokens, USD). Update alongside model changes.
 */
const PRICING: Record<string, ModelPricing> = {
  'gpt-5.6-terra': { inputPerMTok: 1.25, outputPerMTok: 10, cachedInputPerMTok: 0.125 },
  'gpt-5.4-mini': { inputPerMTok: 0.25, outputPerMTok: 2, cachedInputPerMTok: 0.025 },
  'gpt-5.4': { inputPerMTok: 1.25, outputPerMTok: 10, cachedInputPerMTok: 0.125 },
  'gpt-5-mini': { inputPerMTok: 0.25, outputPerMTok: 2, cachedInputPerMTok: 0.025 },
  'claude-sonnet-4-6': { inputPerMTok: 3, outputPerMTok: 15, cachedInputPerMTok: 0.3 },
  'claude-opus-4-8': { inputPerMTok: 15, outputPerMTok: 75, cachedInputPerMTok: 1.5 },
};

/** Rollups must never crash on a model that isn't in the table. */
const UNKNOWN: ModelPricing = { inputPerMTok: 0, outputPerMTok: 0, cachedInputPerMTok: 0 };

export function pricingFor(modelId: string): { pricing: ModelPricing; known: boolean } {
  const match = Object.keys(PRICING)
    .filter((prefix) => modelId.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];
  return match ? { pricing: PRICING[match], known: true } : { pricing: UNKNOWN, known: false };
}

/** Estimated USD cost of one usage row. Uncached input = input - cached. */
export function estimateCostUsd(row: {
  modelId: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
}): { costUsd: number; known: boolean } {
  const { pricing, known } = pricingFor(row.modelId);
  const cached = row.cachedInputTokens ?? 0;
  const uncachedInput = Math.max(0, (row.inputTokens ?? 0) - cached);
  const costUsd =
    (uncachedInput * pricing.inputPerMTok +
      cached * pricing.cachedInputPerMTok +
      (row.outputTokens ?? 0) * pricing.outputPerMTok) /
    1_000_000;
  return { costUsd, known };
}
