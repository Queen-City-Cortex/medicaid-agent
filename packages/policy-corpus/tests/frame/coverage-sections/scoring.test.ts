import { describe, expect, it } from 'vitest';

import type { AnswerFrameSection } from '../../../src/types.js';
import type { CoverageQueryFlags } from '../../../src/frame/coverage-sections/candidates.js';
// Imported directly from the scoring module (not the selection.ts barrel) to keep
// this a focused unit test of selection/scoring.ts. Runs against the REAL shared.ts
// helpers and term lists — no mocks — so the assertions lock in the actual formula.
import { scoreCoverageSections } from '../../../src/frame/coverage-sections/selection/scoring.js';
import { buildCoverageInitialSelection } from '../../../src/frame/coverage-sections/selection/initial-selection.js';
import { makeSection } from '../../helpers/objects.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeFlags(overrides: Partial<CoverageQueryFlags> = {}): CoverageQueryFlags {
  return {
    generalCriteriaQuery: false,
    eligibilityFrameworkQuery: false,
    notCoveredQuery: false,
    certificationQuery: false,
    telehealthQuery: false,
    telehealthServiceListQuery: false,
    ambulanceNotCoveredQuery: false,
    congregatePcsQuery: false,
    yesNoCoverageQuery: false,
    pediatricQuery: false,
    adultCoverageQuery: false,
    hcwdIncomePremiumQuery: false,
    earnedIncomeLimitQuery: false,
    telehealthAvoidTerms: [],
    ...overrides,
  };
}

/** Convenience: score a single section and return its result. */
function scoreOne(
  section: AnswerFrameSection,
  opts: { focus?: string[]; cluster?: string[]; flags?: Partial<CoverageQueryFlags> } = {},
) {
  const [result] = scoreCoverageSections(
    [section],
    opts.focus ?? [],
    opts.cluster ?? [],
    makeFlags(opts.flags),
  );
  return result;
}

// ── Structural invariants ────────────────────────────────────────────────────

describe('scoreCoverageSections — structure', () => {
  it('returns one result per input section, in order', () => {
    const sections = [makeSection({ id: 'a' }), makeSection({ id: 'b' }), makeSection({ id: 'c' })];
    const results = scoreCoverageSections(sections, [], [], makeFlags());
    expect(results.map((r) => r.section.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns [] for an empty section list', () => {
    expect(scoreCoverageSections([], [], [], makeFlags())).toEqual([]);
  });

  it('passes the original section through by reference and derives text = lowercased title + content', () => {
    const section = makeSection({ id: 'a', title: 'Physical Therapy', content: 'Covered Services' });
    const result = scoreOne(section);
    expect(result.section).toBe(section);
    expect(result.text).toBe('physical therapy covered services');
  });

  it('is deterministic — same input yields identical output', () => {
    const section = makeSection({ id: 'a', title: 'Telehealth', sectionNumber: '4.1' });
    const a = scoreCoverageSections([section], ['telehealth'], [], makeFlags({ telehealthQuery: true }));
    const b = scoreCoverageSections([section], ['telehealth'], [], makeFlags({ telehealthQuery: true }));
    expect(a).toEqual(b);
  });
});

// ── Exact anchors (contamination-free inputs) ────────────────────────────────

describe('scoreCoverageSections — exact scores', () => {
  it('scores an empty section at zero on both axes', () => {
    const result = scoreOne(makeSection({ id: 'empty' }));
    expect(result.primaryScore).toBe(0);
    expect(result.supportScore).toBe(0);
    expect(result.limitation).toBe(false);
    expect(result.text).toBe('');
  });

  it('adds a +0.5 numbered bonus to both scores for a sectionNumber', () => {
    const result = scoreOne(makeSection({ id: 'n', sectionNumber: '1.2' }));
    expect(result.primaryScore).toBe(0.5);
    expect(result.supportScore).toBe(0.5);
  });

  it('applies a -3 attachment penalty to both scores', () => {
    const result = scoreOne(makeSection({ id: 'att', title: 'Attachment A' }));
    expect(result.primaryScore).toBe(-3);
    expect(result.supportScore).toBe(-3);
  });

  it('flags limitation text and routes the +3 bonus to supportScore only', () => {
    const result = scoreOne(makeSection({ id: 'lim', content: 'not covered' }));
    expect(result.limitation).toBe(true);
    expect(result.primaryScore).toBe(0);
    expect(result.supportScore).toBe(3);
  });

  it('weights a focus-term title hit as 1.8 → primary 2.16 / support 1.08', () => {
    const result = scoreOne(makeSection({ id: 'f', title: 'Physical Therapy Services' }), {
      focus: ['physical therapy'],
    });
    // scoreTermMatches: multi-word phrase hit = PHRASE_MATCH_WEIGHT (1.8).
    // primary = focusScore * 1.2, support = focusScore * 0.6.
    expect(result.primaryScore).toBeCloseTo(2.16, 10);
    expect(result.supportScore).toBeCloseTo(1.08, 10);
  });
});

// ── Behavioral properties (robust to weight tuning) ──────────────────────────

describe('scoreCoverageSections — behavior', () => {
  it('ranks a focus-term match above the same section with no matching terms', () => {
    const section = makeSection({ id: 'pt', title: 'Physical Therapy Services' });
    const withMatch = scoreOne(section, { focus: ['physical therapy'] });
    const noMatch = scoreOne(section, { focus: [] });
    expect(withMatch.primaryScore).toBeGreaterThan(noMatch.primaryScore);
    expect(withMatch.supportScore).toBeGreaterThan(noMatch.supportScore);
  });

  it('penalizes an attachment title relative to a neutral one', () => {
    const neutral = scoreOne(makeSection({ id: 'a', title: 'Physical Therapy Coverage' }));
    const attachment = scoreOne(makeSection({ id: 'b', title: 'Attachment A' }));
    expect(attachment.primaryScore).toBeLessThan(neutral.primaryScore);
  });

  describe('flag gating', () => {
    it('only credits the telehealth bonus when telehealthQuery is set', () => {
      const section = makeSection({ id: 't', title: 'Telehealth' });
      const off = scoreOne(section, { flags: { telehealthQuery: false } });
      const on = scoreOne(section, { flags: { telehealthQuery: true } });
      expect(off.primaryScore).toBe(0);
      expect(on.primaryScore).toBeGreaterThan(off.primaryScore);
    });

    it('only credits the certification bonus when certificationQuery is set', () => {
      const section = makeSection({ id: 'c', content: 'certification' });
      const off = scoreOne(section, { flags: { certificationQuery: false } });
      const on = scoreOne(section, { flags: { certificationQuery: true } });
      expect(on.primaryScore).toBeGreaterThan(off.primaryScore);
    });

    it('penalizes telehealth-avoid terms only under a telehealth query', () => {
      const section = makeSection({ id: 'av', content: 'ambulance transport' });
      const baseline = scoreOne(section, { flags: { telehealthQuery: true, telehealthAvoidTerms: [] } });
      const penalized = scoreOne(section, {
        flags: { telehealthQuery: true, telehealthAvoidTerms: ['ambulance'] },
      });
      expect(penalized.primaryScore).toBeLessThan(baseline.primaryScore);
    });
  });

  it('adds the MA-2180 document bonus (+1.5 primary only) under an HCWD income/premium query', () => {
    const flags = { hcwdIncomePremiumQuery: true };
    const target = scoreOne(makeSection({ id: 'd1', policyNumber: 'MA-2180' }), { flags });
    const other = scoreOne(makeSection({ id: 'd2', policyNumber: 'MA-9999' }), { flags });
    // The two sections are identical except policyNumber, so the difference isolates
    // hcwdCurrentDocumentBonus, which contributes to primaryScore only.
    expect(target.primaryScore - other.primaryScore).toBeCloseTo(1.5, 10);
    expect(target.supportScore - other.supportScore).toBeCloseTo(0, 10);
  });
});

describe('a proposed State Plan section under an HCWD income/premium query', () => {
  const flags = { hcwdIncomePremiumQuery: true };
  const scored = (status: string) => scoreOne(makeSection({ id: status, status }), { flags });

  it('takes the primary penalty an amendment takes, without its history bonus as support', () => {
    expect(scored('proposed').primaryScore).toBe(scored('amendment').primaryScore);
    expect(scored('proposed').primaryScore).toBeLessThan(scored('current').primaryScore);
    expect(scored('proposed').supportScore).toBe(scored('current').supportScore);
  });

  it('is kept out of the current primary sections like an amendment', () => {
    const select = (status: string) =>
      buildCoverageInitialSelection({
        scored: scoreCoverageSections(
          [
            makeSection({ id: 'other', title: 'Income limit', content: 'income', status, documentId: 'doc:other' }),
            makeSection({ id: 'rule', title: 'Premiums', content: 'premium', documentId: 'doc:rule' }),
          ],
          [],
          [],
          makeFlags(flags),
        ),
        serviceFocusTerms: [],
        flags: makeFlags(flags),
      }).initialPrimarySections.map((section) => section.id);

    expect(select('current')).toContain('other');
    expect(select('amendment')).toEqual(['rule']);
    expect(select('proposed')).toEqual(['rule']);
  });
});

// Jev only adds a bounded signal to final frame scores, never to hybrid hits.
it('caps independent matching roles at +1 and leaves disabled scores identical', async () => {
  const { SECTION_ROLES, ROLE_SPEC_HASH } = await import('../../../src/jev/section-roles.js');
  const plain = makeSection({ id: 'plain', content: 'medical necessity coverage' });
  const labeled = { ...plain, sectionRoles: {
    model: 'jev-1.13.0' as const, specHash: ROLE_SPEC_HASH, inputHash: 'input',
    probabilities: Object.fromEntries(SECTION_ROLES.map(r => [r, 1])) as Record<typeof SECTION_ROLES[number], number>,
  } };
  const original = process.env.JEV_SECTION_ROLES_ENABLED;
  const originalRoles = process.env.JEV_SECTION_ROLE_ALLOWLIST;
  process.env.JEV_SECTION_ROLE_ALLOWLIST = SECTION_ROLES.join(',');
  try {
    process.env.JEV_SECTION_ROLES_ENABLED = 'false';
    const base = scoreOne(plain);
    expect(scoreOne(labeled).primaryScore).toBe(base.primaryScore);
    expect(scoreOne(labeled).supportScore).toBe(base.supportScore);
    process.env.JEV_SECTION_ROLES_ENABLED = 'true';
    expect(scoreOne(labeled).primaryScore).toBe(base.primaryScore + 1);
    expect(scoreOne(labeled).supportScore).toBe(base.supportScore + 1);
  } finally {
    if (originalRoles === undefined) delete process.env.JEV_SECTION_ROLE_ALLOWLIST;
    else process.env.JEV_SECTION_ROLE_ALLOWLIST = originalRoles;
    if (original === undefined) delete process.env.JEV_SECTION_ROLES_ENABLED;
    else process.env.JEV_SECTION_ROLES_ENABLED = original;
  }
});
