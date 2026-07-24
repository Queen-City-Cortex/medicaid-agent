import { describe, expect, it } from 'vitest';
import {
  isSystemicWorkerError,
  runSettledBatches,
} from '../../src/deep-research/worker-pool.js';

describe('runSettledBatches', () => {
  it('preserves successful work and reports individual failures', async () => {
    const result = await runSettledBatches([1, 2, 3], 2, async (value) => {
      if (value === 2) throw new Error('one source failed');
      return value * 10;
    });

    expect(result.values).toEqual([10, 30]);
    expect(result.failures).toMatchObject([{ item: 2 }]);
  });
});

describe('isSystemicWorkerError', () => {
  it.each([
    new Error('401 Unauthorized'),
    new Error('invalid API key'),
    new Error('provider authentication failed'),
    new Error('provider returned 503 Service Unavailable'),
  ])('recognizes provider/authentication failures', (error) => {
    expect(isSystemicWorkerError(error)).toBe(true);
  });

  it('does not treat a single document parsing failure as systemic', () => {
    expect(isSystemicWorkerError(new Error('one source failed'))).toBe(false);
  });
});
