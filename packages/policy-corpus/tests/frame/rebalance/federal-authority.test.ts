import { describe, it, expect } from 'vitest';
import { rebalanceFederalAuthorityFrame } from '../../../src/frame/rebalance/federal-authority.js';
import type { AnswerFrame, AnswerFrameSection } from '../../../src/types.js';

function makeSection(overrides: Partial<AnswerFrameSection>): AnswerFrameSection {
  return {
    id: overrides.id ?? 'sec:x',
    title: overrides.title ?? null,
    sectionNumber: overrides.sectionNumber ?? null,
    content: overrides.content ?? null,
    effectiveDate: null,
    lastRevised: null,
    federalRegisterCite: null,
    documentId: overrides.documentId ?? null,
    documentTitle: overrides.documentTitle ?? null,
    documentType: overrides.documentType ?? 'federal_regulation',
    policyNumber: overrides.policyNumber ?? null,
    url: null,
    citationLink: null,
    status: null,
    authorityTier: null,
    answerRole: null,
    sourceFormat: null,
    answerReady: null,
    corpusBucket: null,
    variantGroup: null,
    variantDate: null,
    retrievalReady: null,
    reason: null,
  };
}

function makeFrame(sections: AnswerFrameSection[]): AnswerFrame {
  return {
    questionType: 'federal_authority',
    route: { lane: 'graph_reasoning', rationale: '', widening_policy: 'family_expansion', determinism_hints: { numeric_evidence_only: false, latest_revision_only: false, cite_scope_and_not_covered: false } },
    authoritativeDocuments: [],
    primarySections: sections,
    supportingSections: [],
    avoidSections: [],
    latestRevision: null,
    variantReasoning: null,
  } as any;
}

describe('rebalanceFederalAuthorityFrame — widened beyond waiver queries', () => {
  it('promotes 42 CFR 430.12 to primary on a SPA timeliness question', () => {
    const spa430 = makeSection({
      id: 'sec:430.12',
      sectionNumber: '430.12',
      policyNumber: '42-CFR-430',
      documentId: 'doc:federal_regulation:42-CFR-430',
      documentType: 'federal_regulation',
    });
    const chip457 = makeSection({
      id: 'sec:457.60',
      sectionNumber: '457.60',
      policyNumber: '42-CFR-457',
      documentId: 'doc:federal_regulation:42-CFR-457',
      documentType: 'federal_regulation',
    });
    const frame = makeFrame([chip457, spa430]);

    const result = rebalanceFederalAuthorityFrame(
      frame,
      'which federal regulation governs timeliness requirements for state medicaid plan amendments',
    );

    expect(result.primarySections[0].id).toBe('sec:430.12');
  });

  it('promotes 42 CFR Part 441 Subpart G on a 1915(c) authority question (q-046)', () => {
    const authority441 = makeSection({
      id: 'sec:441.301',
      sectionNumber: '441.301',
      policyNumber: '42-CFR-441',
      documentId: 'doc:federal_regulation:42-CFR-441',
    });
    const crossRef430 = makeSection({
      id: 'sec:430.25',
      sectionNumber: '430.25',
      policyNumber: '42-CFR-430',
      documentId: 'doc:federal_regulation:42-CFR-430',
    });
    const frame = makeFrame([crossRef430, authority441]);

    const result = rebalanceFederalAuthorityFrame(
      frame,
      'what federal regulation authorizes nc medicaid 1915(c) hcbs waivers such as cap/da',
    );

    expect(result.primarySections[0].id).toBe('sec:441.301');
  });

  it('does not fire WAIVER_AUTHORITY on a SPA-style question that lacks 1915(c)', () => {
    const spa430 = makeSection({
      id: 'sec:430.12',
      sectionNumber: '430.12',
      policyNumber: '42-CFR-430',
      documentId: 'doc:federal_regulation:42-CFR-430',
    });
    const authority441 = makeSection({
      id: 'sec:441.301',
      sectionNumber: '441.301',
      policyNumber: '42-CFR-441',
      documentId: 'doc:federal_regulation:42-CFR-441',
    });
    const frame = makeFrame([authority441, spa430]);

    const result = rebalanceFederalAuthorityFrame(
      frame,
      'which federal regulation governs timeliness for state medicaid plan amendments',
    );

    // SPA_HINT must win (no 1915(c) phrase → WAIVER_AUTHORITY doesn't match).
    expect(result.primarySections[0].id).toBe('sec:430.12');
  });

  it('promotes 42 CFR 441 Subpart B on an EPSDT federal-authority question', () => {
    const epsdt = makeSection({
      id: 'sec:441.56',
      sectionNumber: '441.56',
      policyNumber: '42-CFR-441',
      documentId: 'doc:federal_regulation:42-CFR-441',
    });
    const unrelated = makeSection({
      id: 'sec:457.1',
      sectionNumber: '457.1',
      policyNumber: '42-CFR-457',
      documentId: 'doc:federal_regulation:42-CFR-457',
    });
    const frame = makeFrame([unrelated, epsdt]);

    const result = rebalanceFederalAuthorityFrame(
      frame,
      'what is the federal authority for medicaid epsdt services',
    );

    expect(result.primarySections[0].id).toBe('sec:441.56');
  });

  it('returns frame unchanged when no hint matches', () => {
    const sec = makeSection({ id: 'sec:foo', policyNumber: '42-CFR-440' });
    const frame = makeFrame([sec]);
    const result = rebalanceFederalAuthorityFrame(frame, 'totally unrelated query');
    expect(result).toBe(frame);
  });

  it('preserves the existing waiver behavior', () => {
    const waiverPrimary = makeSection({
      id: 'sec:441.301',
      sectionNumber: '441.301',
      policyNumber: '42-CFR-441',
      documentId: 'doc:federal_regulation:42-CFR-441',
    });
    const noticeProcedural = makeSection({
      id: 'sec:431.408',
      sectionNumber: '431.408',
      policyNumber: '42-CFR-431',
      documentId: 'doc:federal_regulation:42-CFR-431',
      title: 'Public notice',
    });
    const frame = makeFrame([noticeProcedural, waiverPrimary]);

    const result = rebalanceFederalAuthorityFrame(
      frame,
      'how does a state submit a 1915(c) waiver application',
    );

    expect(result.primarySections.map((s) => s.id)).toContain('sec:441.301');
    expect(result.avoidSections.map((s) => s.id)).toContain('sec:431.408');
  });
});

  it('does not treat Community First Choice (441.5xx) as EPSDT Subpart B', () => {
    // parseFloat('441.500') === parseFloat('441.50') — the old numeric range
    // check promoted Subpart K sections on EPSDT questions.
    const communityFirstChoice = makeSection({
      id: 'sec:441.500',
      sectionNumber: '441.500',
      policyNumber: '42-CFR-441',
      documentId: 'doc:federal_regulation:42-CFR-441',
    });
    const epsdt = makeSection({
      id: 'sec:441.56',
      sectionNumber: '441.56',
      policyNumber: '42-CFR-441',
      documentId: 'doc:federal_regulation:42-CFR-441',
    });
    const frame = makeFrame([communityFirstChoice, epsdt]);

    const result = rebalanceFederalAuthorityFrame(
      frame,
      'what is the federal authority for medicaid epsdt services',
    );

    expect(result.primarySections.map((s) => s.id)).toContain('sec:441.56');
    expect(result.primarySections.map((s) => s.id)).not.toContain('sec:441.500');
  });
