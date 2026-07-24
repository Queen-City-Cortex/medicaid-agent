import { describe, expect, it } from 'vitest';
import { validateDeepResearchConfig } from '../../src/deep-research/config.js';

const valid = {
  maxSubQuestions: 6,
  maxReflectionRounds: 2,
  workerMaxSteps: 16,
  plannerMaxSteps: 6,
  researchConcurrency: 3,
  noveltyMinNewIds: 2,
  webSearchMaxResults: 5,
};

describe('validateDeepResearchConfig', () => {
  it('accepts bounded production tuning', () => {
    expect(() => validateDeepResearchConfig(valid)).not.toThrow();
  });

  it.each([
    ['researchConcurrency', 0],
    ['researchConcurrency', 7],
    ['maxSubQuestions', 9],
    ['maxReflectionRounds', 6],
    ['workerMaxSteps', 33],
    ['plannerMaxSteps', 13],
  ] as const)('rejects unsafe %s=%s', (key, value) => {
    expect(() => validateDeepResearchConfig({ ...valid, [key]: value })).toThrow(key);
  });
});
