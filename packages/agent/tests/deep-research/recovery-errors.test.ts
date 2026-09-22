import { describe, expect, it } from 'vitest';
import { isRetryableResearchError } from '../../src/deep-research/recovery-errors.js';

describe('checkpoint failure classification', () => {
  it.each([
    new Error('ECONNRESET while persisting research checkpoint'),
    new Error('Research checkpoint write timed out'),
    Object.assign(new Error('Checkpoint provider unavailable'), { statusCode: 503 }),
    new Error('Could not save checkpoint', { cause: new Error('fetch failed') }),
  ])('retries transient checkpoint failures: %s', error => {
    expect(isRetryableResearchError(error)).toBe(true);
  });

  it.each([
    new Error('Incompatible research checkpoint; start a new run'),
    new Error('Incompatible research checkpoint: approved plan is missing; start a new run'),
    new Error('Checkpoint version is incompatible'),
    new Error('Incompatible research checkpoint', { cause: new Error('ECONNRESET') }),
  ])('keeps incompatible checkpoints terminal: %s', error => {
    expect(isRetryableResearchError(error)).toBe(false);
  });
});
