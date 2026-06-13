import { describe, expect, it } from 'vitest';
import type { AnswerFrame, AnswerFrameSection } from '../src/types.js';
import { normalizeSearchText } from '../src/internal/shared.js';
import { buildCoverageQueryFlags } from '../src/frame/coverage-sections/candidates.js';
import {
  assembleCoverageSections,
  buildCoverageAnchors,
  buildCoverageInitialSelection,
  collectCoverageSectionGroups,
  scoreCoverageSections,
} from '../src/frame/coverage-sections/selection.js';

describe('coverage rebalance helpers', () => {
  it('keeps yes/no coverage queries off request attachments during initial selection', () => {
    const query = normalizeSearchText('Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?');
    const flags = buildCoverageQueryFlags(query);
    const surfacedSections = [
      makeSection({
        id: 'attachment',
        sectionNumber: 'Attachment C',
        title: 'Attachment C: Requesting Prior Approval',
        content: 'Requesting approval for chiropractic services requires submitting documentation and forms.',
      }),
      makeSection({
        id: 'scope',
        sectionNumber: '2.1.1',
        title: 'Description of the Procedure, Product, or Service',
        content: 'This policy describes physician services and does not list chiropractic treatment as a covered service.',
      }),
      makeSection({
        id: 'not-covered',
        sectionNumber: '4.1',
        title: 'General Criteria Not Covered',
        content: 'Chiropractic services are not covered under this clinical coverage policy.',
      }),
    ];

    const scored = scoreCoverageSections(surfacedSections, ['chiropractic'], ['chiropractic'], flags);
    const selection = buildCoverageInitialSelection({
      scored,
      serviceFocusTerms: ['chiropractic'],
      flags,
    });

    expect(selection.initialPrimarySections.map((section) => section.id)).toContain('scope');
    expect(selection.initialPrimarySections.map((section) => section.id)).not.toContain('attachment');
  });

  it('keeps HCWD income questions on current MA-2180 sections while retaining the change notice as support', () => {
    const query = normalizeSearchText('What are the current HCWD income and premium rules?');
    const flags = buildCoverageQueryFlags(query);
    const surfacedSections = [
      makeSection({
        id: 'current',
        sectionNumber: 'III.B',
        title: 'Income, Enrollment Fee, and Premium',
        documentTitle: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES',
        policyNumber: 'MA-2180',
        content:
          'Those whose total countable monthly income exceeds 200% of FPL must pay a monthly premium. Unearned income limits still apply.',
      }),
      makeSection({
        id: 'historical-chart',
        sectionNumber: 'Attachment A',
        title: '2019 HCWD Premiums (Effective April 1, 2019)',
        documentTitle: 'MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES – 2019 HCWD Premiums',
        policyNumber: 'MA-2180',
        content: '2019 premium chart for HCWD beneficiaries.',
      }),
      makeSection({
        id: 'change-notice',
        sectionNumber: 'I.B.1.c',
        title: 'Change Summary',
        documentTitle: 'CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III',
        policyNumber: 'MA-2180',
        status: 'amendment',
        content:
          'Remove the 150% FPL earned-income limit from policy and keep the unearned-income limit for HCWD beneficiaries.',
      }),
    ];

    const scored = scoreCoverageSections(surfacedSections, ['hcwd', 'income', 'premium'], ['income', 'premium'], flags);
    const selection = buildCoverageInitialSelection({
      scored,
      serviceFocusTerms: ['hcwd', 'income', 'premium'],
      flags,
    });

    expect(selection.initialPrimarySections.map((section) => section.id)).toEqual(['current']);
    expect(selection.initialSupportingSections.map((section) => section.id)).toContain('change-notice');
    expect(selection.initialSupportingSections.map((section) => section.id)).not.toContain('historical-chart');
  });

  it('promotes ambulance-specific non-covered sections over general exclusions in final assembly', () => {
    const query = normalizeSearchText('What ambulance services are NOT covered by NC Medicaid?');
    const flags = buildCoverageQueryFlags(query);
    const surfacedSections = [
      makeSection({
        id: 'general',
        sectionNumber: '4.1',
        title: 'General Criteria Not Covered',
        content: 'General criteria not covered by Medicaid for ambulance transportation.',
      }),
      makeSection({
        id: 'specific',
        sectionNumber: '4.2.1.4',
        title: 'Other Non-Covered Ambulance Services',
        content: 'The following ambulance services are not covered except as otherwise provided.',
      }),
      makeSection({
        id: 'contrast',
        sectionNumber: '3.4',
        title: 'Air Medical Ambulance',
        content: 'Air medical ambulance may be covered when medical necessity criteria are met.',
      }),
    ];
    const scored = scoreCoverageSections(surfacedSections, ['ambulance'], ['ambulance'], flags);
    const selection = buildCoverageInitialSelection({
      scored,
      serviceFocusTerms: ['ambulance'],
      flags,
    });
    const groups = collectCoverageSectionGroups(surfacedSections, flags);
    const anchors = buildCoverageAnchors({
      surfacedSections,
      groups,
      flags,
      selection,
    });
    const assembled = assembleCoverageSections({
      frame: makeFrame(),
      flags,
      groups,
      selection,
      anchors,
    });

    expect(assembled.primarySections.map((section) => section.id)[0]).toBe('specific');
    expect([...assembled.primarySections, ...assembled.supportingSections].map((section) => section.id)).toContain('contrast');
    expect(assembled.avoidSections.map((section) => section.id)).toContain('general');
  });

  it('keeps a surfaced EPSDT special-provision section in supporting for adult exclusion frames', () => {
    const query = normalizeSearchText('Does Policy 10A cover routine massage therapy for beneficiaries over age 21?');
    const flags = buildCoverageQueryFlags(query);
    const surfacedSections = [
      makeSection({
        id: 'scope',
        sectionNumber: '2.1.1',
        title: 'Description of the Procedure, Product, or Service',
        content: 'Outpatient specialized therapies include physical, occupational, speech, and respiratory therapy.',
      }),
      makeSection({
        id: 'not-covered',
        sectionNumber: '4.1',
        title: 'General Criteria Not Covered',
        content: 'Routine massage therapy is not covered for beneficiaries 21 years of age and older.',
      }),
      makeSection({
        id: 'epsdt',
        sectionNumber: '2.2.1',
        title: 'EPSDT Special Provision: Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age',
        content: 'EPSDT requires coverage of medically necessary services for beneficiaries under 21 even when the policy limits them.',
      }),
    ];
    const scored = scoreCoverageSections(surfacedSections, ['massage'], ['therapy'], flags);
    const selection = buildCoverageInitialSelection({
      scored,
      serviceFocusTerms: ['massage'],
      flags,
    });
    const groups = collectCoverageSectionGroups(surfacedSections, flags);
    const anchors = buildCoverageAnchors({
      surfacedSections,
      groups,
      flags,
      selection,
    });
    const assembled = assembleCoverageSections({
      frame: makeFrame(),
      flags,
      groups,
      selection,
      anchors,
    });

    const surfacedIds = [...assembled.primarySections, ...assembled.supportingSections].map((section) => section.id);
    expect(surfacedIds).toContain('epsdt');
    expect(assembled.avoidSections.map((section) => section.id)).not.toContain('epsdt');
  });

  it('does not fabricate EPSDT sections when none are surfaced', () => {
    const query = normalizeSearchText('Does Policy 10A cover routine massage therapy for beneficiaries over age 21?');
    const flags = buildCoverageQueryFlags(query);
    const surfacedSections = [
      makeSection({
        id: 'scope',
        sectionNumber: '2.1.1',
        title: 'Description of the Procedure, Product, or Service',
        content: 'Outpatient specialized therapies include physical, occupational, speech, and respiratory therapy.',
      }),
    ];
    const groups = collectCoverageSectionGroups(surfacedSections, flags);

    expect(groups.epsdtExceptionSections).toEqual([]);
  });
});

function makeSection(overrides: Partial<AnswerFrameSection> & { id: string }): AnswerFrameSection {
  return {
    title: null,
    sectionNumber: null,
    content: null,
    effectiveDate: null,
    lastRevised: null,
    federalRegisterCite: null,
    documentId: 'doc:test',
    documentTitle: 'Test Document',
    documentType: 'clinical_policy',
    policyNumber: '5B',
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

function makeFrame(): AnswerFrame {
  return {
    questionType: 'coverage',
    route: {
      lane: 'baseline_hybrid',
      rationale: 'test',
      widening_policy: 'none',
      determinism_hints: {
        numeric_evidence_only: false,
        latest_revision_only: false,
        cite_scope_and_not_covered: false,
      },
    },
    authoritativeDocuments: [],
    primarySections: [],
    supportingSections: [],
    avoidSections: [],
    latestRevision: null,
    variantReasoning: null,
  };
}
