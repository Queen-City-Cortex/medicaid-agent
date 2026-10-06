import { describe, expect, it } from 'vitest';

import { policyNumberKey } from '../../src/internal/base.js';
import { analyzeQuery } from '../../src/query/analysis.js';
import { candidatePolicyNumbers } from '../../src/primitives/policy-lookup.js';

// SAFE-1b lookup. lookupPolicy matches a stored policy_number when the Cypher
// key (policyNumberKeyCypher: upper-case, hyphens and spaces removed) of any
// candidate equals the stored number's key; policyNumberKey is its TS twin.

const resolvesTo = (raw: string, stored: string) =>
  candidatePolicyNumbers(raw).some((candidate) => policyNumberKey(candidate) === policyNumberKey(stored));

describe('SAFE-1b statute lookup', () => {
  it('keys the four statutes apart from the clinical and manual numbers in the corpus', () => {
    expect(['108A-70.9A', '108A-79', '108D-14', '108D-15'].map(policyNumberKey)).toEqual([
      '108A70.9A',
      '108A79',
      '108D14',
      '108D15',
    ]);
    const existing = ['10A', '8A', '1A-14', '3L-1', 'MA-2420', 'MA-3430'].map(policyNumberKey);
    expect(existing).toEqual(['10A', '8A', '1A14', '3L1', 'MA2420', 'MA3430']);
    for (const key of ['108A70.9A', '108A79', '108D14', '108D15']) expect(existing).not.toContain(key);
  });

  it('resolves the bare statute number', () => {
    expect(candidatePolicyNumbers('108A-70.9A')).toEqual(['108A-70.9A']);
    expect(resolvesTo('108A-70.9A', '108A-70.9A')).toBe(true);
  });

  // candidatePolicyNumbers reuses NC_STATUTE_RE, the pattern search names a
  // statute with, so a citation reaches the stored section number. A cited
  // subsection resolves to the section's document, not to the child section.
  it.each([
    ['G.S. 108A-70.9A', '108A-70.9A'],
    ['N.C.G.S. § 108D-15', '108D-15'],
    ['108A-70.9A(d)', '108A-70.9A'],
    ['n.c.g.s. 108d-15(b)', '108D-15'],
  ])('resolves the cited form %s to %s', (raw, stored) => {
    expect(candidatePolicyNumbers(raw)).toEqual([raw, stored]);
    expect(resolvesTo(raw, stored)).toBe(true);
    expect(analyzeQuery(`What does ${raw} say?`).explicitPolicyNumbers).toContain(stored);
  });

  it.each(['10A', '1A-14', '8A', '3L-1', 'MA-2420', 'Policy 10A', '42 CFR 108', '1108A-79', 'X108A-79'])(
    'adds no statute candidate for %s',
    (raw) => {
      const statutes = ['108A-70.9A', '108A-79', '108D-14', '108D-15'].map(policyNumberKey);
      for (const candidate of candidatePolicyNumbers(raw)) {
        expect(candidate).not.toMatch(/^108[AD]-/);
        expect(statutes).not.toContain(policyNumberKey(candidate));
      }
    },
  );
});
