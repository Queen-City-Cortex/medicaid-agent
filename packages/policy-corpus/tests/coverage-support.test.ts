import { describe, expect, it } from 'vitest';
import type { AnswerFrameSection } from '../src/types.js';
import { normalizeSearchText } from '../src/internal/shared.js';
import { buildCoverageQueryFlags } from '../src/frame/coverage/flags.js';
import { collectCoverageSectionGroups } from '../src/frame/coverage/groups.js';
import { scoreCoverageSections } from '../src/frame/coverage/scoring.js';

describe('coverage support seams', () => {
  it('collects eligibility anchors, context, and administrative sections separately', () => {
    const flags = buildCoverageQueryFlags(
      normalizeSearchText('What are the general eligibility criteria for CAP/DA services under NC Medicaid?'),
    );
    const surfacedSections = [
      makeSection({
        id: 'scope',
        sectionNumber: '2.1.1',
        title: 'General Provisions',
        content: 'The beneficiary must be enrolled in the NC Medicaid program.',
      }),
      makeSection({
        id: 'criteria',
        sectionNumber: '3.1',
        title: 'General Criteria Covered',
        content: 'The beneficiary must be an adult with disabilities and at risk of institutionalization.',
      }),
      makeSection({
        id: 'admin',
        sectionNumber: '7.0',
        title: 'Claim Reimbursement',
        content: 'Billing instructions for providers.',
      }),
      makeSection({
        id: 'limit',
        sectionNumber: '4.1',
        title: 'General Criteria Not Covered',
        content: 'Room and board is not covered under this policy.',
      }),
    ];

    const groups = collectCoverageSectionGroups(surfacedSections, flags);

    expect(groups.generalEligibilityAnchorSections.map((section) => section.id)).toEqual(['scope', 'criteria']);
    expect(groups.generalEligibilityContextSections.map((section) => section.id)).toEqual(['scope', 'criteria']);
    expect(groups.generalEligibilityAdministrativeSections.map((section) => section.id)).toEqual(['admin']);
    expect(groups.generalEligibilityLimitationSections.map((section) => section.id)).toEqual(['limit']);
  });

  it('scores telehealth governing sections above tables and tangential cross-policy sections', () => {
    const flags = buildCoverageQueryFlags(
      normalizeSearchText('Under what conditions can speech therapy be provided via telehealth under NC Medicaid?'),
    );
    const surfacedSections = [
      makeSection({
        id: 'telehealth-rule',
        sectionNumber: '5.7',
        title: 'e. Telehealth',
        content: 'Speech therapy may be provided by telehealth when medically necessary for the beneficiary.',
      }),
      makeSection({
        id: 'telehealth-table',
        sectionNumber: null,
        title: 'Telehealth Eligible Services',
        content: 'Speech/language evaluation and speech/language treatment are telehealth eligible services.',
      }),
      makeSection({
        id: 'tangential',
        sectionNumber: '1.9',
        title: 'Related Clinical Coverage Policies',
        content: 'Background and cross-policy context.',
      }),
    ];

    const scored = scoreCoverageSections(surfacedSections, ['speech', 'therapy'], ['speech', 'therapy'], flags);
    const byId = new Map(scored.map((entry) => [entry.section.id, entry]));

    expect(byId.get('telehealth-rule')!.primaryScore).toBeGreaterThan(byId.get('telehealth-table')!.primaryScore);
    expect(byId.get('telehealth-rule')!.primaryScore).toBeGreaterThan(byId.get('tangential')!.primaryScore);
    expect(byId.get('telehealth-table')!.primaryScore).toBeGreaterThan(byId.get('tangential')!.primaryScore);
  });
});

function makeSection(overrides: Partial<AnswerFrameSection> & { id: string }): AnswerFrameSection {
  return {
    id: overrides.id,
    title: null,
    sectionNumber: null,
    content: null,
    effectiveDate: null,
    documentId: 'doc:test',
    documentTitle: 'Test Document',
    documentType: 'clinical_policy',
    policyNumber: '10A',
    url: null,
    citationLink: null,
    status: 'current',
    authorityTier: 'state',
    answerRole: 'governing',
    sourceFormat: 'pdf',
    answerReady: true,
    corpusBucket: 'state_policy',
    variantGroup: null,
    variantDate: null,
    retrievalReady: true,
    reason: null,
    ...overrides,
  };
}
