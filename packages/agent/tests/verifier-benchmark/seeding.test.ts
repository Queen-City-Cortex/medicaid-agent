import { describe, expect, it } from 'vitest';
import { SEED_KINDS, hasNumber, seedDate, seedFault, seedFigure, seedQualifier, seedSectionLabel, seedSurvives } from '../../scripts/verifier-benchmark/seeding.js';
import type { SourceEntry } from '../../src/processors/verifier/evidence.js';

const URL_8C = 'https://example.test/8c/download?attachment';
const section = (sectionNumber: string, text: string): SourceEntry => ({
  toolName: 'getSection', key: `sec:8c:${sectionNumber}`, link: URL_8C, sectionNumber,
  text: `[getSection]\nSection: ${sectionNumber}\nContent:\n${text}`,
});
const sources: SourceEntry[] = [
  section('3.2.1', 'The provider must submit the request within 30 calendar days. The monthly limit is $2,829. Reviewed 04/15/2025.'),
  section('5.3', 'Services are limited to 8 visits per year for a beneficiary under 21.'),
  { toolName: 'resolveAnswerFrame', key: 'frame', text: 'Routing hint: 45 calendar days', link: URL_8C },
];
const answer = [
  'The provider must submit the request within 30 calendar days of the notice [Policy 8C § 3.2.1](' + URL_8C + ').',
  'The monthly limit is $2,829, and the policy was revised on April 15, 2025.',
  'A beneficiary under 21 is not covered for more than 8 visits per year [Policy 8C § 5.3](' + URL_8C + ').',
].join('\n');

/** The one span that differs between two strings. */
function difference(before: string, after: string) {
  let start = 0;
  while (before[start] === after[start]) start += 1;
  let end = 0;
  while (before[before.length - 1 - end] === after[after.length - 1 - end] && before.length - end > start && after.length - end > start) end += 1;
  return { start, removed: before.slice(start, before.length - end), added: after.slice(start, after.length - end) };
}

describe('seeded faults', () => {
  it('changes exactly the recorded span, for every kind', () => {
    for (const kind of SEED_KINDS) {
      const seeded = seedFault(kind, answer, sources)!;
      const { offset, original, replacement } = seeded.change;
      expect(seeded.change.kind).toBe(kind);
      expect(answer.slice(offset, offset + original.length)).toBe(original);
      expect(seeded.text).toBe(answer.slice(0, offset) + replacement + answer.slice(offset + original.length));
      expect(replacement).not.toBe(original);
      expect(seeded.change.seededLine).toContain(replacement);
      // Deterministic: the same input seeds the same error.
      expect(seedFault(kind, answer, sources)).toEqual(seeded);
    }
  });

  it('leaves links and quotations alone, so the deterministic checks cannot be what catches a seed', () => {
    for (const kind of SEED_KINDS) {
      const seeded = seedFault(kind, answer, sources)!;
      expect(seeded.text.match(/\]\(([^)]+)\)/g)).toEqual(answer.match(/\]\(([^)]+)\)/g));
    }
    const quoted = 'The policy says "the provider must respond within 30 calendar days of the notice".';
    expect(seedFigure(quoted, sources)).toBeNull();
    expect(seedQualifier(quoted)).toBeNull();
    expect(seedQualifier('> Services are not covered.\n')).toBeNull();
  });
});

describe('seedFigure', () => {
  it('changes one figure the evidence states to a value the evidence does not state', () => {
    const seeded = seedFigure(answer, sources)!;
    expect(seeded.change).toMatchObject({ original: '30', replacement: '45' });
    expect(difference(answer, seeded.text)).toMatchObject({ removed: '30', added: '45' });
    expect(hasNumber(sources[0].text, '30')).toBe(true);
    expect(hasNumber(sources.slice(0, 2).map(source => source.text).join('\n'), '45')).toBe(false);
  });

  it('transposes digits of a larger amount and keeps its formatting', () => {
    const seeded = seedFigure('The monthly limit is $2,829.', sources)!;
    expect(seeded.text).toBe('The monthly limit is $2,892.');
  });

  it('skips a figure the evidence does not state and a replacement the evidence does state', () => {
    // 12 is in no source, so the first eligible figure is 8; 12 = 8 + 4 is
    // then free, but put it in the evidence and the next candidate is used.
    expect(seedFigure('Up to 12 hours, or 8 visits.', sources)!.change).toMatchObject({ original: '8', replacement: '12' });
    const withTwelve = [...sources, section('5.4', 'A further 12 visits need prior approval.')];
    expect(seedFigure('Up to 8 visits.', withTwelve)!.change).toMatchObject({ original: '8', replacement: '9' });
  });

  it('returns null when the answer states no figure with a unit, percent or dollar sign', () => {
    expect(seedFigure('See Policy 8C and 42 CFR 441.301 for 2025.', sources)).toBeNull();
  });

  it('matches whole numbers only', () => {
    expect(hasNumber('within 130 days', '30')).toBe(false);
    expect(hasNumber('section 30.5 applies', '30')).toBe(false);
    expect(hasNumber('the limit is 2,829 dollars', '2829')).toBe(true);
    expect(hasNumber('within 30.', '30')).toBe(true);
  });
});

describe('seedDate', () => {
  it('shifts one date by a year in each supported form', () => {
    expect(seedDate(answer, sources)!.change).toMatchObject({ original: 'April 15, 2025', replacement: 'April 15, 2026' });
    expect(seedDate('Amended 04/15/2025.', [])!.text).toBe('Amended 04/15/2026.');
    expect(seedDate('Effective 2025-09-01.', [])!.text).toBe('Effective 2026-09-01.');
    expect(seedDate('Revised in March 2024.', [])!.text).toBe('Revised in March 2025.');
  });

  it('moves the other way when the evidence already has the shifted date', () => {
    expect(seedDate('Amended 04/15/2024.', sources)!.text).toBe('Amended 04/15/2023.');
  });

  it('returns null when the answer has no date', () => {
    expect(seedDate('No dates here, only 30 days.', sources)).toBeNull();
  });
});

describe('seedQualifier', () => {
  it.each([
    ['The provider must submit it.', 'The provider may submit it.'],
    ['A beneficiary under 21 qualifies.', 'A beneficiary 21 and over qualifies.'],
    ['A beneficiary under age 21 qualifies.', 'A beneficiary age 21 and over qualifies.'],
    ['Whitening is not covered.', 'Whitening is covered.'],
    ['Not covered: whitening.', 'Covered: whitening.'],
    ['The service is covered.', 'The service is not covered.'],
    ['Prior approval is required.', 'Prior approval is not required.'],
    ['The provider may not bill.', 'The provider may bill.'],
    ['It lasts at least 30 days.', 'It lasts at most 30 days.'],
  ])('%s', (before, after) => {
    expect(seedQualifier(before)!.text).toBe(after);
  });

  it('flips only the first qualifier', () => {
    const seeded = seedQualifier(answer)!;
    expect(seeded.change).toMatchObject({ original: 'must', replacement: 'may', offset: answer.indexOf('must') });
    expect(seeded.text.slice(seeded.change.offset + 3)).toBe(answer.slice(seeded.change.offset + 4));
  });

  it('returns null when there is nothing to flip', () => {
    expect(seedQualifier('The policy describes the service.')).toBeNull();
  });
});

describe('seedSectionLabel', () => {
  it('moves a label to another retrieved section of the same document and keeps the link', () => {
    const seeded = seedSectionLabel('Submit within 30 days [Policy 8C § 3.2.1](' + URL_8C + ').', sources)!;
    expect(seeded.text).toBe('Submit within 30 days [Policy 8C § 5.3](' + URL_8C + ').');
    expect(seeded.change).toMatchObject({ original: '3.2.1', replacement: '5.3', siblingRetrieved: true });
  });

  it('uses the next section number when no other section of that document was retrieved', () => {
    const seeded = seedSectionLabel('See [42 CFR § 441.301](https://example.test/cfr).', sources)!;
    expect(seeded.text).toBe('See [42 CFR § 441.302](https://example.test/cfr).');
    expect(seeded.change.siblingRetrieved).toBe(false);
  });

  it('does not pick a section the answer already cites, or a parent or child of the cited one', () => {
    const family = [section('3.2', 'Parent.'), section('3.2.1', 'Child.'), section('5.3', 'Other.')];
    // 3.2 is the parent of 3.2.1, and 5.3 is cited already: fall back to 3.2.2.
    expect(seedSectionLabel(answer, family)!.change).toMatchObject({ original: '3.2.1', replacement: '3.2.2', siblingRetrieved: false });
  });

  it('returns null when no citation names a numbered section', () => {
    expect(seedSectionLabel('See [Policy 8C](' + URL_8C + ') and [MA-2270 § F. Income](' + URL_8C + ').', sources)).toBeNull();
  });
});

describe('seedSurvives', () => {
  const seeded = seedFigure(answer, sources)!;

  it('finds the seeded error in text that kept it and not in the original', () => {
    expect(seedSurvives(seeded, answer, seeded.text)).toBe(true);
    expect(seedSurvives(seeded, answer, answer)).toBe(false);
    expect(seedSurvives(seeded, answer, 'The request is due on time.')).toBe(false);
  });

  it('finds a seeded figure in a reworded sentence', () => {
    expect(seedSurvives(seeded, answer, 'Providers have 45 calendar days to submit.')).toBe(true);
  });

  it('needs the surrounding words for a qualifier, which is an ordinary word', () => {
    const flipped = seedQualifier(answer)!;
    expect(seedSurvives(flipped, answer, flipped.text)).toBe(true);
    expect(seedSurvives(flipped, answer, 'A provider may ask for help.')).toBe(false);
  });
});
