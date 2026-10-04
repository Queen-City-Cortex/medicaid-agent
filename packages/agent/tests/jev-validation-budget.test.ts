import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('local validation transport', () => {
  it.each(['NODE_ENV', 'RAILWAY_ENVIRONMENT_ID', 'RAILWAY_SERVICE_ID'])('refuses %s before replacing fetch', async key => {
    vi.stubEnv('JEV_VALIDATION_LEDGER', '/offline/ledger.db');
    vi.stubEnv('JEV_VALIDATION_PRICING', '/offline/pricing.json');
    vi.stubEnv(key, key === 'NODE_ENV' ? 'production' : 'deployed');
    const original = globalThis.fetch;
    const { installValidationBudget } = await import('../src/jev/validation-budget.js');
    expect(() => installValidationBudget()).toThrow('validation_requires_local_environment');
    expect(globalThis.fetch).toBe(original);
  });
});
