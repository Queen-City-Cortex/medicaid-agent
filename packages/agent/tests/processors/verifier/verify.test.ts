import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('ai', async original => ({ ...await original<typeof import('ai')>(), generateObject: vi.fn() }));

import { generateObject } from 'ai';
import { verifyAnswer, VERIFICATION_UNAVAILABLE } from '../../../src/processors/verifier/verify.js';
import { log } from '../../../src/logger.js';

const mockGenerateObject = generateObject as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.restoreAllMocks();
  mockGenerateObject.mockReset();
});

describe('verifyAnswer fail-closed logging', () => {
  it('logs verifier.failed_closed and returns the unavailable verdict when the model call throws', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    mockGenerateObject.mockRejectedValue(new Error('429 rate limit'));

    const result = await verifyAnswer('q', 'a', 'sources');

    expect(error).toHaveBeenCalledWith(
      'verifier.failed_closed',
      expect.objectContaining({ err: '429 rate limit' }),
    );
    expect(error).not.toHaveBeenCalledWith('verifier.deadline_aborted', expect.anything());
    // Fail closed: not trusted, flagged unsupported with the unavailable reason.
    expect(result.supported).toBe(false);
    expect(result.unsupportedClaims[0]?.reason).toBe(VERIFICATION_UNAVAILABLE);
  });

  it('enforces supplementary evidence authority in the system instructions', async () => {
    mockGenerateObject.mockResolvedValue({ object: { supported: true } });
    await verifyAnswer('q', 'a', 'sources', undefined, undefined, {
      unknownUrls: [], unknownQuotes: [], hasSupplementaryEvidence: true,
    });
    expect(mockGenerateObject.mock.calls[0][0].system).toContain('It cannot independently support ANY governing policy claim');
    expect(mockGenerateObject.mock.calls[0][0].system).toContain('matching web URL or quotation proves provenance only');
  });

  it('does not log on a successful verification', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    mockGenerateObject.mockResolvedValue({
      object: {
        supported: true,
        relevant: true,
        citationsComplete: true,
        unsupportedClaims: [],
        missingCitationClaims: [],
        relevanceIssues: [],
        correctedAnswer: '',
      },
    });

    const result = await verifyAnswer('q', 'a', 'sources');
    expect(result.supported).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });
});
