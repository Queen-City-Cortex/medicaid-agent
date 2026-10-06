import { describe, expect, it } from 'vitest';
import type { AnswerFrameSection } from '../src/types.js';
import { normalizeSearchText } from '../src/internal/shared.js';
import { makeFrame, makeSection as baseMakeSection } from './helpers/objects.js';
import { buildCoverageQueryFlags } from '../src/frame/coverage-sections/candidates.js';
import {
  assembleCoverageSections,
  buildCoverageAnchors,
  buildCoverageInitialSelection,
  collectCoverageSectionGroups,
  scoreCoverageSections,
} from '../src/frame/coverage-sections/selection.js';
import { rebalanceCoverageFrame } from '../src/frame/rebalance/coverage.js';
import { TEMPLATE_POLICY_5B, templateSection, type TemplatePolicy } from './helpers/template-policy-fixtures.js';

describe('coverage rebalance helpers', () => {
  it('assembles a yes/no frame in the pipeline\'s order: description first, criteria sections supporting, empty sections dropped', () => {
    const query = normalizeSearchText('Does NC Medicaid cover diabetic shoes and inserts under Clinical Coverage Policy 5B?');
    const flags = buildCoverageQueryFlags(query);
    const real = (number: string) => fromTemplate(TEMPLATE_POLICY_5B, number);
    // The pipeline read the hit before the description and one empty heading
    // slipped through; 4.1 arrived as a primary candidate.
    const frame = makeFrame({
      primarySections: [real('5.3.1'), real('1.0'), real('4.1'), real('4.2')],
      supportingSections: [real('3.2.1'), real('4.2.1'), real('2.2.1')],
      avoidSections: [real('8.0')],
    });
    const surfacedSections = [...frame.primarySections, ...frame.supportingSections, ...frame.avoidSections];

    const scored = scoreCoverageSections(surfacedSections, ['diabetic', 'shoes'], ['diabetic', 'shoes'], flags);
    const selection = buildCoverageInitialSelection({ scored, serviceFocusTerms: ['diabetic', 'shoes'], flags });
    const groups = collectCoverageSectionGroups(surfacedSections, flags);
    const anchors = buildCoverageAnchors({ surfacedSections, flags, selection });
    const assembled = assembleCoverageSections({ frame, flags, groups, selection, anchors, yesNoStructure: true });

    expect(real('4.2').content).toBe('');
    expect(assembled.primarySections.map((section) => section.sectionNumber)).toEqual(['1.0', '5.3.1']);
    expect(assembled.supportingSections.map((section) => section.sectionNumber).slice(-3)).toEqual(['4.1', '4.2.1', '3.2.1']);
    expect(assembled.avoidSections.map((section) => section.sectionNumber)).toEqual(['8.0']);
  });

  it('strips avoid text after rebalance, so a section promoted out of the avoid list keeps its body', () => {
    const query = normalizeSearchText('What are the requirements for home modifications under CAP/DA?');
    const promoted = makeSection({
      id: 'promoted',
      sectionNumber: '5.9.1',
      title: 'Equipment, Modification, Technology and Supplies',
      content: 'A recommendation by the MDT must state the cost of the home modification being requested.',
    });
    const stillAvoided = makeSection({
      id: 'history',
      sectionNumber: '8.0',
      title: 'Policy Implementation and History',
      content: 'Original effective date and revision table.',
    });
    const frame = makeFrame({
      primarySections: [
        makeSection({
          id: 'plan',
          sectionNumber: '5.4.2',
          title: 'Person-Centered Service Plan Requirements',
          content: 'Summarize the evaluation and assessment information in the service plan.',
        }),
      ],
      avoidSections: [promoted, stillAvoided],
    });

    const rebalanced = rebalanceCoverageFrame(frame, query, ['home', 'modifications'], ['modification']);

    const surfaced = [...rebalanced.primarySections, ...rebalanced.supportingSections];
    expect(surfaced.find((section) => section.id === 'promoted')?.content).toBe(promoted.content);
    expect(rebalanced.avoidSections.every((section) => section.content === null)).toBe(true);
  });

  it('leads the supporting sections with the EPSDT provision for a "not covered" question and never ranks it primary', () => {
    // The provision's heading says "Exception to Policy Limitations", which
    // the not-covered anchors read as a limitation section.
    const query = normalizeSearchText('What orthotic and prosthetic items are not covered under Clinical Coverage Policy 5B?');
    const real = (number: string) => fromTemplate(TEMPLATE_POLICY_5B, number);
    const frame = makeFrame({
      primarySections: [real('2.2.1'), real('4.2.1')],
      supportingSections: [real('4.1'), real('3.2.1')],
    });

    const rebalanced = rebalanceCoverageFrame(frame, query, ['orthotic', 'prosthetic'], []);

    expect(rebalanced.primarySections.map((section) => section.sectionNumber)).toEqual(['4.2.1', '4.1']);
    expect(rebalanced.supportingSections.map((section) => section.sectionNumber)).toEqual(['2.2.1', '3.2.1']);
  });

  it('does not fabricate EPSDT sections when none are surfaced', () => {
    // Every section of the frame names the provision in passing (the 4.0
    // note) or not at all; none of them is it.
    const query = normalizeSearchText('Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?');
    const flags = buildCoverageQueryFlags(query);
    const real = (number: string) => fromTemplate(TEMPLATE_POLICY_5B, number);
    const frame = makeFrame({
      primarySections: [real('1.0'), real('4.0')],
      supportingSections: [real('4.1'), real('4.2.1')],
    });

    expect(real('4.0').content).toContain('EPSDT Exception to Policy Limitations');
    expect(collectCoverageSectionGroups([...frame.primarySections, ...frame.supportingSections], flags).epsdtExceptionSections).toEqual([]);

    const rebalanced = rebalanceCoverageFrame(frame, query, ['chiropractic'], [], true);

    expect([...rebalanced.primarySections, ...rebalanced.supportingSections].map((section) => section.sectionNumber).sort()).toEqual([
      '1.0',
      '4.0',
      '4.1',
      '4.2.1',
    ]);
  });

  it('never selects a section with no body, whatever its heading scores', () => {
    const query = normalizeSearchText('What are the requirements for home modifications under CAP/DA?');
    const frame = makeFrame({
      primarySections: [
        makeSection({ id: 'empty', sectionNumber: '5.9', title: 'Home Modifications Requirements', content: '' }),
        makeSection({ id: 'blank', sectionNumber: '5.9.2', title: 'Home Modifications', content: '  \n' }),
        makeSection({
          id: 'text',
          sectionNumber: '5.9.1',
          title: 'Equipment, Modification, Technology and Supplies',
          content: 'A recommendation by the MDT must state the cost of the home modification being requested.',
        }),
      ],
    });

    const rebalanced = rebalanceCoverageFrame(frame, query, ['home', 'modifications'], ['modification']);

    expect([...rebalanced.primarySections, ...rebalanced.supportingSections].map((section) => section.id)).toEqual(['text']);
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
});

// A real template-policy section as the frame carries it.
function fromTemplate(policy: TemplatePolicy, number: string): AnswerFrameSection {
  const section = templateSection(policy, number);
  return baseMakeSection({
    id: section.id,
    sectionNumber: section.number,
    title: section.title,
    content: section.content,
    documentId: policy.document.id,
    documentTitle: policy.document.title,
    policyNumber: policy.document.policyNumber,
  });
}

// Wrapper over the shared base: this file defaults policyNumber to '5B'.
function makeSection(overrides: Partial<AnswerFrameSection> & { id: string }): AnswerFrameSection {
  return baseMakeSection({ policyNumber: '5B', ...overrides });
}
