import { describe, expect, it } from 'vitest';
import { validateAnswerQuotes, validateAnswerUrls } from '../../src/processors/verifier/answer-validation.js';

const source = { toolName: 'getSection', key: 'policy', link: 'https://example.gov/policy',
  text: 'The service requires prior approval before treatment begins.' };

describe('outgoing citation surfaces', () => {
  it.each([
    'See https://example.gov/fabricated.',
    'See <https://example.gov/fabricated>.',
    'See [the policy][policy].\n\n[policy]: https://example.gov/fabricated',
  ])('rejects an unknown URL outside an inline markdown link: %s', answer => {
    expect(validateAnswerUrls(answer, [source]).unknownUrls).toContain('https://example.gov/fabricated');
  });

  it('accepts a retrieved bare URL followed by sentence punctuation', () => {
    expect(validateAnswerUrls('See https://example.gov/policy.', [source]).unknownUrls).toEqual([]);
  });

  it('rejects an unsupported block quotation', () => {
    expect(validateAnswerQuotes('The policy says:\n\n> Every service is covered without any prior approval.', [source]).unknownQuotes).toHaveLength(1);
  });

  it('accepts a sourced block quotation across wrapped lines', () => {
    expect(validateAnswerQuotes('> The service requires prior approval\n> before treatment begins.', [source]).unknownQuotes).toEqual([]);
  });

  it('does not treat routing hints as evidence for a quotation', () => {
    const quote = 'Every service is covered without any prior approval.';
    expect(validateAnswerQuotes(`"${quote}"`, [{ toolName: 'resolveAnswerFrame', key: 'frame', text: quote }]).unknownQuotes).toEqual([quote]);
  });
});
