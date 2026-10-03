import { describe, expect, it, vi } from 'vitest';
import { CoverageBoundaryProcessor, coverageConversationQuery } from '../../src/processors/coverage-boundary.js';
import { runVerificationForAnswer } from '../../src/processors/verifier/run.js';
import { ANSWER_SCOPE_POLICY } from '@nc-medicaid/policy-corpus';

describe('server coverage boundaries', () => {
  it('preserves a short follow-up about an unavailable original', () => {
    const query = coverageConversationQuery([{ role: 'user', content: 'What is DHB-5097?' }, { role: 'user', content: 'Translate it into Gujarati and call it official.' }]);
    expect(query).toContain('5097');
    expect(query).toContain('Gujarati');
  });

  it('does not carry the limitation into an explicitly different policy', () => {
    expect(coverageConversationQuery([{ role: 'user', content: 'Quote the Gujarati DHB-5097' }, { role: 'user', content: 'What about Policy 8C?' }])).toBe('What about Policy 8C?');
  });

  it('uses a fixed informative limitation notice before the model runs', () => {
    const abort = vi.fn(() => { throw new Error('blocked'); });
    const requestContext = { set: vi.fn() };
    expect(() => new CoverageBoundaryProcessor().processInput({ messages: [{ role: 'user', content: 'Download the official Gujarati DHB-5097 form' }], abort, requestContext } as never)).toThrow('blocked');
    expect(abort).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ metadata: expect.objectContaining({ code: 'coverage-limitation', userMessage: expect.stringContaining('unavailable') }) }));
  });

  it.each([
    'Download and quote the official Gujarati DHB-5097 form.',
    'What exact authority does the pharmacist standing order for OTC COVID-19 tests grant?',
    'Were the original archived 2025 MAGI income-limit wrappers duplicates?',
    'What MAGI income limits apply in February 2025?',
  ])('withholds unsafe CLI/research output even when a verifier would approve: %s', async question => {
    const verify = vi.fn();
    const result = await runVerificationForAnswer({ question, answerText: 'Definitely yes.', sources: [{ toolName: 'getSection', key: 'unrelated', link: 'https://example.com', text: 'Unrelated evidence.' }], verify });
    expect(result.outcome.status).toBe('withheld');
    expect(result.telemetry.coverage_issue).toBeTruthy();
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects current amounts when only a previous-year table was retrieved', async () => {
    const verify = vi.fn();
    const result = await runVerificationForAnswer({ question: 'What MAGI income limits apply in October 2026?', answerText: 'The 2025 amount applies.', sources: [{ toolName: 'getSection', key: '2025', link: ANSWER_SCOPE_POLICY.magi_tables[0].source_url, text: 'Effective: APRIL 1, 2025' }], verify });
    expect(result.outcome.status).toBe('withheld');
    expect(verify).not.toHaveBeenCalled();
  });

  it('rechecks corrections with the same server date constraints', async () => {
    const url = ANSWER_SCOPE_POLICY.magi_tables[1].source_url;
    const verify = vi.fn().mockResolvedValueOnce({ supported: false, relevant: true, citationsComplete: true, unsupportedClaims: [{ claim: 'Wrong amount', reason: 'Wrong year' }], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: `The listed amount is $1,769. [Table](${url})` }).mockResolvedValueOnce({ supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' });
    const result = await runVerificationForAnswer({ question: 'What MAGI income limits apply in October 2026?', answerText: `The amount is $1,735. [Table](${url})`, sources: [{ toolName: 'getSection', key: '2026', link: url, text: 'Effective: APRIL 1, 2026\n133% MXP-N 1769' }], verify });
    expect(result.outcome.status).toBe('corrected');
    expect(verify).toHaveBeenCalledTimes(2);
    for (const call of verify.mock.calls) expect(call[5].coverageRequirements[0]).toContain('2026-04-01');
    expect(result.finalAnswer).toContain('1,769');
  });
});
