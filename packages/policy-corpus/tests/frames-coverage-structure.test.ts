// Yes/no coverage frames over real template policies: the description section
// leads by structure, the search hits that answer the question keep their
// text, and nothing the plan points at is empty.

import { describe, expect, it } from 'vitest';
import {
  createCorpus,
  documentGraphHandlers,
  hitFor,
  queries,
  resolveTypedFrame,
  type GraphDocument,
  type SessionHandler,
} from './helpers/graph-fixtures.js';
import { expectFrameContentInvariant } from './helpers/frame-invariants.js';
import { makeSection } from './helpers/objects.js';
import { isEpsdtSpecialProvisionSection } from '../src/index.js';
import { isEpsdtCrossReferenceNote, pickTemplateSlotSectionIds } from '../src/frame/coverage-sections/structure.js';
import { buildCoverageQueryFlags } from '../src/frame/coverage-sections/candidates.js';
import { collectCoverageSectionGroups } from '../src/frame/coverage-sections/selection.js';
import { normalizeSearchText } from '../src/internal/shared.js';
import {
  TEMPLATE_POLICY_10A,
  TEMPLATE_POLICY_12B,
  TEMPLATE_POLICY_1A12,
  TEMPLATE_POLICY_1O1,
  TEMPLATE_POLICY_1R1,
  TEMPLATE_POLICY_5B,
  TEMPLATE_POLICY_8C,
  templatePolicyHandlers,
  templateSection,
  templateSectionByTitle,
  type TemplatePolicy,
} from './helpers/template-policy-fixtures.js';

function clinicalHits(document: GraphDocument, hits: Array<[sectionId: string, score: number]>): SessionHandler {
  return {
    label: 'vector clinical',
    match: queries.sectionVector('clinical_policy'),
    result: { records: hits.map(([sectionId, score]) => hitFor(document, sectionId, score)) },
  };
}

function numbers(sections: Array<{ sectionNumber: string | null; title: string | null }>): Array<string | null> {
  return sections.map((section) => section.sectionNumber ?? section.title);
}

// The hits a template policy returns for a service it does not name: the
// general sections, in no helpful order.
function templateHits(policy: TemplatePolicy): Array<[string, number]> {
  return [
    [templateSection(policy, '3.1').id, 0.82],
    [templateSection(policy, '4.1').id, 0.79],
    [templateSection(policy, '2.1.1').id, 0.76],
    [templateSection(policy, '4.2.1').id, 0.72],
  ];
}

describe('yes/no coverage frames on template policies', () => {
  const QUESTIONS: Array<[TemplatePolicy, string]> = [
    [TEMPLATE_POLICY_5B, 'Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?'],
    [TEMPLATE_POLICY_8C, 'Is acupuncture a covered service under Clinical Coverage Policy 8C (Outpatient Behavioral Health)?'],
    [TEMPLATE_POLICY_10A, 'Does Policy 10A cover routine massage therapy for beneficiaries over age 21?'],
    [TEMPLATE_POLICY_1R1, 'Does Clinical Coverage Policy 1R-1 cover acupuncture?'],
    [TEMPLATE_POLICY_1O1, 'Does Clinical Coverage Policy 1-O-1 cover acupuncture?'],
  ];

  it.each(QUESTIONS)('gives every primary and supporting section text ($document.policyNumber)', async (policy, question) => {
    const { corpus } = createCorpus([clinicalHits(policy.document, templateHits(policy)), ...templatePolicyHandlers(policy)]);

    const frame = await resolveTypedFrame(corpus, 'coverage', question);

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe(policy.document.policyNumber);
    expect(frame.primarySections.length).toBeGreaterThan(0);
    expectFrameContentInvariant(frame);
  });

  it('leads with section 1.0 and keeps 4.1, 4.2.1 and 3.2.1 as supporting sections', async () => {
    const policy = TEMPLATE_POLICY_5B;
    const { corpus } = createCorpus([clinicalHits(policy.document, templateHits(policy)), ...templatePolicyHandlers(policy)]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?',
    );

    expect(frame.route.determinism_hints.cite_scope_and_not_covered).toBe(true);
    expect(frame.primarySections[0]?.sectionNumber).toBe('1.0');
    expect(frame.primarySections[0]?.content).toContain('Orthotic and prosthetic devices are covered');
    expect(numbers(frame.supportingSections)).toEqual(expect.arrayContaining(['4.1', '4.2.1', '3.2.1']));
    expect(numbers(frame.primarySections)).not.toEqual(expect.arrayContaining(['4.1']));
    expect(numbers(frame.primarySections)).not.toEqual(expect.arrayContaining(['4.2.1']));
    expect(numbers(frame.primarySections)).not.toEqual(expect.arrayContaining(['3.2.1']));
    expectFrameContentInvariant(frame);
  });

  it('chooses the description section by number, whatever the other sections say in their text', async () => {
    // The real "2.1.1 General" is enrolment boilerplate and the real 2.2.1
    // speaks of "limitations on scope"; neither is the description.
    const policy = TEMPLATE_POLICY_10A;
    const { corpus } = createCorpus([
      clinicalHits(policy.document, [
        [templateSection(policy, '2.2.1').id, 0.95],
        [templateSection(policy, '2.1.1').id, 0.93],
        ...templateHits(policy),
      ]),
      ...templatePolicyHandlers(policy),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Does Policy 10A cover routine massage therapy for beneficiaries over age 21?',
    );

    expect(frame.primarySections[0]?.sectionNumber).toBe('1.0');
    expectFrameContentInvariant(frame);
  });

  it('reads an empty section 1.0 through its linked children', async () => {
    // Policy 1R-1: section 1.0 is a bare heading over 1.1 to 1.3, which the
    // loader linked to it, so reading 1.0 returns their text.
    const policy = TEMPLATE_POLICY_1R1;
    const { corpus } = createCorpus([clinicalHits(policy.document, templateHits(policy)), ...templatePolicyHandlers(policy)]);

    const frame = await resolveTypedFrame(corpus, 'coverage', 'Does Clinical Coverage Policy 1R-1 cover acupuncture?');

    expect(frame.primarySections[0]?.sectionNumber).toBe('1.0');
    expect(frame.primarySections[0]?.content).toContain('Phase II outpatient cardiac rehabilitation');
    expectFrameContentInvariant(frame);
  });

  it('falls back to the first numbered child with text when section 1.0 reads empty', async () => {
    // The same policy with no outline to read 1.0 through, so 1.0 comes back
    // empty: selection finds the child from the dotted number alone.
    const policy = TEMPLATE_POLICY_1R1;
    const { corpus } = createCorpus([
      clinicalHits(policy.document, templateHits(policy)),
      ...documentGraphHandlers(policy.document),
    ]);

    const frame = await resolveTypedFrame(corpus, 'coverage', 'Does Clinical Coverage Policy 1R-1 cover acupuncture?');

    expect(frame.primarySections[0]?.sectionNumber).toBe('1.1');
    expect(frame.primarySections[0]?.content).toContain('Phase II outpatient cardiac rehabilitation');
    expectFrameContentInvariant(frame);
  });

  it('leaves the description slot to the search hits when neither 1.0 nor a numbered child has text', async () => {
    // Policy 1-O-1: 1.0 is empty and its two parts are unnumbered headings
    // the serving graph does not link to it.
    const policy = TEMPLATE_POLICY_1O1;
    const reconstructive = templateSectionByTitle(policy, 'Reconstructive Surgery');
    const { corpus } = createCorpus([
      clinicalHits(policy.document, [[reconstructive.id, 0.97], ...templateHits(policy)]),
      ...templatePolicyHandlers(policy),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Does NC Medicaid cover reconstructive surgery under Clinical Coverage Policy 1-O-1?',
    );

    expect(numbers(frame.primarySections)).not.toContain('1.0');
    expect(frame.primarySections[0]?.title).toBe('Reconstructive Surgery');
    expectFrameContentInvariant(frame);
  });

  it('returns the section that answers the question with its text when it is the top hit', async () => {
    // Oracle probe: the question names a service the policy covers in its own
    // subsection, and search puts that subsection first.
    const policy = TEMPLATE_POLICY_5B;
    const target = templateSection(policy, '5.3.1');
    const { corpus } = createCorpus([
      clinicalHits(policy.document, [[target.id, 0.97], ...templateHits(policy)]),
      ...templatePolicyHandlers(policy),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Does NC Medicaid cover diabetic shoes and inserts under Clinical Coverage Policy 5B?',
    );

    expect(numbers(frame.primarySections).slice(0, 2)).toEqual(['1.0', '5.3.1']);
    expect(frame.primarySections[1]?.content).toBe(target.content);
    expect(numbers(frame.avoidSections)).not.toContain('5.3.1');
    expectFrameContentInvariant(frame);
  });

  it('puts a hit in the avoid list only when its title is a process or history heading', async () => {
    const policy = TEMPLATE_POLICY_5B;
    const { corpus } = createCorpus([
      clinicalHits(policy.document, [
        [templateSection(policy, '8.0').id, 0.96],
        [templateSection(policy, '5.3.1').id, 0.95],
        [templateSection(policy, '5.1').id, 0.94],
        [templateSection(policy, '3.1').id, 0.93],
        [templateSection(policy, '7.0').id, 0.92],
        [templateSection(policy, '5.0').id, 0.91],
        ...templateHits(policy).slice(1),
      ]),
      ...templatePolicyHandlers(policy),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Does NC Medicaid cover diabetic shoes and inserts under Clinical Coverage Policy 5B?',
    );

    // "8.0 Policy Implementation/Revision Information" is the only title here
    // with an avoid term; the leftover hits are simply not in the frame.
    expect(numbers(frame.avoidSections)).toEqual(['8.0']);
    expectFrameContentInvariant(frame);
  });
});

// The provision's opening sentence, the same in every template policy.
const PROVISION_TEXT =
  'Early and Periodic Screening, Diagnostic, and Treatment (EPSDT) is a federal Medicaid requirement that requires the state Medicaid agency to cover services, products, or procedures for Medicaid beneficiary under 21 years of age';
// The one-line note that opens sections 3.0, 4.0, 5.0 and 7.0.
const BANNER_TEXT = 'Refer to Subsection 2.2.1 regarding EPSDT Exception to Policy Limitations';
const BANNER_NUMBERS = ['3.0', '4.0', '5.0', '7.0'];

function asFrameSection(policy: TemplatePolicy, section: { id: string; number: string | null; title: string | null; content: string }) {
  return makeSection({
    id: section.id,
    sectionNumber: section.number,
    title: section.title,
    content: section.content,
    policyNumber: policy.document.policyNumber,
  });
}

describe('the under-21 EPSDT provision in adult yes/no coverage frames', () => {
  it('puts section 2.2.1 first among the supporting sections, with its text, and never a cross-reference banner', async () => {
    const policy = TEMPLATE_POLICY_5B;
    // Search returns the 3.0, 4.0, 5.0 and 7.0 notes, which name the provision
    // in their body, ahead of everything else.
    const { corpus } = createCorpus([
      clinicalHits(policy.document, [
        ...BANNER_NUMBERS.map((number, index): [string, number] => [templateSection(policy, number).id, 0.97 - index * 0.01]),
        ...templateHits(policy),
      ]),
      ...templatePolicyHandlers(policy),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?',
    );

    for (const number of BANNER_NUMBERS) expect(templateSection(policy, number).content).toContain(BANNER_TEXT);
    // The notes are not evidence: none of them is anywhere in the frame, so
    // no plan built from it can name § 4.0.
    expect(numbers([...frame.primarySections, ...frame.supportingSections, ...frame.avoidSections])).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^[3457]\.0$/)]),
    );
    expect(numbers(frame.primarySections)).toEqual(['1.0', '3.1', '2.1.1']);
    expect(numbers(frame.supportingSections)).toEqual(['2.2.1', '4.1', '4.2.1', '3.2.1']);
    expect(frame.supportingSections[0]?.content).toContain(PROVISION_TEXT);
    expect(numbers(frame.primarySections)).not.toContain('2.2.1');
    expectFrameContentInvariant(frame);
  });

  it('selects the "42 U.S.C. § 1396d(r)" heading in place of an empty section 2.2.1', async () => {
    // Policy 8C: 2.2.1 is a bare heading and the provision's text sits under
    // the unnumbered heading after it, which the serving graph does not link.
    const policy = TEMPLATE_POLICY_8C;
    const { corpus } = createCorpus([clinicalHits(policy.document, templateHits(policy)), ...templatePolicyHandlers(policy)]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Is acupuncture a covered service under Clinical Coverage Policy 8C (Outpatient Behavioral Health)?',
    );

    expect(templateSection(policy, '2.2.1').content).toBe('');
    expect(frame.supportingSections[0]?.title).toBe('a. 42 U.S.C. § 1396d(r) [1905(r) of the Social Security Act]');
    expect(frame.supportingSections[0]?.sectionNumber).toBeNull();
    expect(frame.supportingSections[0]?.content).toContain(PROVISION_TEXT);
    expect(numbers([...frame.primarySections, ...frame.supportingSections, ...frame.avoidSections])).not.toContain('2.2.1');
    expectFrameContentInvariant(frame);
  });

  it.each([
    [TEMPLATE_POLICY_10A, 'Does Policy 10A cover routine massage therapy for beneficiaries over age 21?'],
    [TEMPLATE_POLICY_1O1, 'Does Clinical Coverage Policy 1-O-1 cover acupuncture?'],
    [TEMPLATE_POLICY_1R1, 'Does Clinical Coverage Policy 1R-1 cover acupuncture?'],
  ] as Array<[TemplatePolicy, string]>)('carries the provision text for $document.policyNumber', async (policy, question) => {
    const { corpus } = createCorpus([clinicalHits(policy.document, templateHits(policy)), ...templatePolicyHandlers(policy)]);

    const frame = await resolveTypedFrame(corpus, 'coverage', question);

    expect(frame.supportingSections[0]?.content).toContain(PROVISION_TEXT);
    expectFrameContentInvariant(frame);
  });

  it('keeps the provision supporting when search ranks it first', async () => {
    const policy = TEMPLATE_POLICY_10A;
    const { corpus } = createCorpus([
      clinicalHits(policy.document, [[templateSection(policy, '2.2.1').id, 0.97], ...templateHits(policy)]),
      ...templatePolicyHandlers(policy),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Does Policy 10A cover routine massage therapy for beneficiaries over age 21?',
    );

    expect(frame.primarySections[0]?.sectionNumber).toBe('1.0');
    expect(numbers(frame.primarySections)).not.toContain('2.2.1');
    expect(frame.supportingSections[0]?.sectionNumber).toBe('2.2.1');
  });

  // Adult coverage questions that do not open with does/is/can. The top hit is
  // the specific not-covered section, as for a service the policy excludes.
  it.each([
    'What does Medicaid cover for acupuncture?',
    'Would Medicaid cover a gym membership?',
    'My mom needs dentures, are they covered?',
    'What does Policy 5B cover for orthotic devices?',
  ])('carries the provision for an adult coverage question that is not a leading yes/no: %s', async (question) => {
    const policy = TEMPLATE_POLICY_5B;
    const { corpus } = createCorpus([
      clinicalHits(policy.document, [[templateSection(policy, '4.2.1').id, 0.97], ...templateHits(policy).slice(0, 3)]),
      ...templatePolicyHandlers(policy),
    ]);

    const frame = await resolveTypedFrame(corpus, 'coverage', question);

    expect(frame.route.determinism_hints.cite_scope_and_not_covered).toBe(false);
    const provision = frame.supportingSections.find((section) => section.sectionNumber === '2.2.1');
    expect(provision?.content).toContain(PROVISION_TEXT);
    expect(numbers(frame.primarySections)).not.toContain('2.2.1');
    expectFrameContentInvariant(frame);
  });

  it('reads the provision from section 2.2 when the 2.2.1 heading was parsed into its body', async () => {
    // Policy 12B: no section is headed 2.2.1 or "a. 42 U.S.C."; both lines
    // open the body of "2.2 Special Provisions".
    const policy = TEMPLATE_POLICY_12B;
    const { corpus } = createCorpus([clinicalHits(policy.document, templateHits(policy)), ...templatePolicyHandlers(policy)]);

    const frame = await resolveTypedFrame(corpus, 'coverage', 'Does Clinical Coverage Policy 12B cover acupuncture?');

    expect(policy.document.sections.map((section) => section.number)).not.toContain('2.2.1');
    expect(frame.supportingSections[0]?.sectionNumber).toBe('2.2');
    expect(frame.supportingSections[0]?.content).toContain(
      'Early and Periodic Screening, Diagnostic, and Treatment (EPSDT) is a federal Medicaid requirement',
    );
    expect(numbers(frame.primarySections)).not.toContain('2.2');
    expectFrameContentInvariant(frame);
  });
});

describe('sections that read as text and say nothing', () => {
  const placed = (frame: { primarySections: Array<{ sectionNumber: string | null; title: string | null }>; supportingSections: Array<{ sectionNumber: string | null; title: string | null }> }) =>
    numbers([...frame.primarySections, ...frame.supportingSections]);

  it('does not lead with a section 1.0 that reads as "1.1 Definitions: None Apply."', async () => {
    // Policy 1A-12: 1.0 is empty, its parts are unnumbered headings, and the
    // only section numbered under it is the "None Apply." definitions stub.
    const policy = TEMPLATE_POLICY_1A12;
    const { corpus, session } = createCorpus([clinicalHits(policy.document, templateHits(policy)), ...templatePolicyHandlers(policy)]);

    const frame = await resolveTypedFrame(corpus, 'coverage', 'Does Clinical Coverage Policy 1A-12 cover acupuncture?');

    // The read of 1.0 itself comes back with the stub's text.
    expect((await corpus.getSection(templateSection(policy, '1.0').id))?.content).toBe('### 1.1 Definitions\nNone Apply.\n\n');
    expect(session.run).toHaveBeenCalled();
    expect(placed(frame)).not.toContain('1.0');
    expect(placed(frame)).not.toContain('1.1');
    expect(frame.primarySections[0]?.sectionNumber).toBe('3.1');
    expectFrameContentInvariant(frame);
  });

  it('does not place a not-covered section whose body is only a list stem', async () => {
    // Policy 1-O-1: the body of 4.2.1 is "Medicaid shall not cover the
    // following:" and the items are the lettered headings after it.
    const policy = TEMPLATE_POLICY_1O1;
    const items = templateSectionByTitle(policy, 'a. Cosmetic Surgery');
    const { corpus } = createCorpus([
      clinicalHits(policy.document, [[items.id, 0.9], ...templateHits(policy)]),
      ...templatePolicyHandlers(policy),
    ]);

    const frame = await resolveTypedFrame(corpus, 'coverage', 'Does Clinical Coverage Policy 1-O-1 cover cosmetic surgery?');

    expect(templateSection(policy, '4.2.1').content).toBe('Medicaid shall not cover the following:');
    expect(placed(frame)).not.toContain('4.2.1');
    expect(frame.primarySections.find((section) => section.id === items.id)?.content).toBe(items.content);
    expectFrameContentInvariant(frame);
  });

  it('reads the first numbered item of a criteria section that is only a stem', async () => {
    // Policy 8C § 3.2.1 is "Medicaid shall cover ... meets the following
    // criteria:" and the criteria are 3.2.1.1 onward.
    const policy = TEMPLATE_POLICY_8C;
    const { corpus } = createCorpus([clinicalHits(policy.document, templateHits(policy)), ...templatePolicyHandlers(policy)]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Is acupuncture a covered service under Clinical Coverage Policy 8C (Outpatient Behavioral Health)?',
    );

    expect(templateSection(policy, '3.2.1').content.endsWith('criteria:')).toBe(true);
    expect(placed(frame)).not.toContain('3.2.1');
    expect(numbers(frame.supportingSections)).toContain('3.2.1.1');
    expectFrameContentInvariant(frame);
  });

  it('offers the sections under a template slot, then the "additional criteria" section beside it', () => {
    // Policy 1A-2 reads "None Apply." at 4.2.1 and states its exclusion at 4.2.2.
    const listing = ['4.1', '4.2', '4.2.1', '4.2.1.1', '4.2.2', '3.2.1', '3.2.2'].map((number) => ({ id: `s:${number}`, number, title: number }));

    expect(pickTemplateSlotSectionIds(listing, '4.2.1')).toEqual(['s:4.2.1', 's:4.2.1.1', 's:4.2.2']);
    expect(pickTemplateSlotSectionIds(listing, '3.2.1')).toEqual(['s:3.2.1', 's:3.2.2']);
    expect(pickTemplateSlotSectionIds(listing, '4.1')).toEqual(['s:4.1']);
  });

  it('does not place a "None Apply." section', async () => {
    const policy = TEMPLATE_POLICY_5B;
    const { corpus } = createCorpus([
      clinicalHits(policy.document, [[templateSection(policy, '4.2.2').id, 0.97], ...templateHits(policy)]),
      ...templatePolicyHandlers(policy),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?',
    );

    expect(templateSection(policy, '4.2.2').content).toBe('None Apply.');
    expect(placed(frame)).not.toContain('4.2.2');
  });

  it('keeps a short 4.0 that states the answer and drops only the cross-reference note', async () => {
    const policy = TEMPLATE_POLICY_5B;
    const answering: TemplatePolicy = {
      ...policy,
      document: {
        ...policy.document,
        sections: policy.document.sections.map((section) =>
          section.number === '4.0' ? { ...section, content: 'Medicaid shall not cover chiropractic services.', chars: undefined } : section,
        ),
      },
    };
    const question = 'Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?';
    const frameFor = async (fixture: TemplatePolicy) => {
      const { corpus } = createCorpus([
        clinicalHits(fixture.document, [[templateSection(fixture, '4.0').id, 0.97], ...templateHits(fixture)]),
        ...templatePolicyHandlers(fixture),
      ]);
      return resolveTypedFrame(corpus, 'coverage', question);
    };

    const withAnswer = await frameFor(answering);
    expect(withAnswer.primarySections.find((section) => section.sectionNumber === '4.0')?.content).toBe(
      'Medicaid shall not cover chiropractic services.',
    );
    expect(placed(await frameFor(policy))).not.toContain('4.0');
  });

  it.each([
    'Note: Refer to Subsection 2.2.1 regarding EPSDT Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age.',
    'Note: Refer to Subsection 2.2.1 regarding EPSDT Exception to Policy Limitations for Medicaid Beneficiaries under 21 Years of Age.',
    'Note: Refer to Subsection 2.2 regarding EPSDT Exception to Policy Limitations for Medicaid Beneficiaries under 21 Years of Age.',
    'Note: Refer to Subsection 2.2.1 regarding EPSDT Exception to Policy Limitations for Medicaid Recipients under 21 Years of Age.',
    'Note: Refer to Subsection 2.2 .1regarding EPSDT Exception to Policy Limitations for Medicaid Beneficiaries under 21 Years of Age.',
    'Note: Refer to Subsection 2.2.1 regarding EPSDT Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age. Amended Date: December 15, 2023',
    'Note: Refer to Subsection 2.2.1 regarding EPSDT Exception to Policy Limitations for Medicaid Beneficiaries Under 21 Years of Age',
    'Refer to Subsection 2.2.1 regarding EPSDT Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age.',
  ])('recognises the cross-reference note as the parsed policies word it: %s', (content) => {
    expect(isEpsdtCrossReferenceNote({ content })).toBe(true);
  });

  it('does not take a section that says more than the note for the note', () => {
    const note = templateSection(TEMPLATE_POLICY_5B, '4.0').content;
    expect(isEpsdtCrossReferenceNote({ content: note })).toBe(true);
    expect(isEpsdtCrossReferenceNote({ content: `${note}\nMedicaid shall not cover chiropractic services.` })).toBe(false);
    expect(isEpsdtCrossReferenceNote({ content: 'Medicaid shall not cover chiropractic services.' })).toBe(false);
    expect(isEpsdtCrossReferenceNote({ content: '' })).toBe(false);
  });

  it('drops a heading read through its sections when one of those sections is placed too', async () => {
    // 3.2 and 4.2 of Policy 5B have no text of their own: read, they return
    // the text of 3.2.1 and of 4.2.1, which are in the frame already.
    const policy = TEMPLATE_POLICY_5B;
    const { corpus } = createCorpus([
      clinicalHits(policy.document, [
        [templateSection(policy, '3.2').id, 0.95],
        [templateSection(policy, '3.2.1').id, 0.93],
        [templateSection(policy, '4.2').id, 0.91],
        [templateSection(policy, '3.1').id, 0.8],
      ]),
      ...templatePolicyHandlers(policy),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?',
    );

    expect((await corpus.getSection(templateSection(policy, '4.2').id))?.content).toContain(templateSection(policy, '4.2.1').content);
    expect(placed(frame)).toEqual(expect.arrayContaining(['3.2.1', '4.2.1']));
    expect(placed(frame)).not.toContain('3.2');
    expect(placed(frame)).not.toContain('4.2');
    expectFrameContentInvariant(frame);
  });

  it('keeps the service-focused selection for a manual that happens to have a section 1.0', async () => {
    const MANUAL: GraphDocument = {
      id: 'doc-ma-3540',
      title: 'MA-3540 Dental Services',
      documentType: 'dhhs_policy',
      policyNumber: 'MA-3540',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/ma-3540',
      sections: [
        { id: 'ma-3540:1.0', number: '1.0', title: '1.0 Background', content: 'This section gives the background of the dental program.' },
        {
          id: 'ma-3540:whitening',
          number: 'IV.B',
          title: 'B. Cosmetic Dental Whitening',
          content: 'Cosmetic dental whitening for adults is not a covered dental service.',
        },
      ],
    };
    const { corpus } = createCorpus([
      {
        label: 'vector dhhs',
        match: queries.sectionVector('dhhs_policy'),
        result: { records: [hitFor(MANUAL, 'ma-3540:whitening', 0.95), hitFor(MANUAL, 'ma-3540:1.0', 0.6)] },
      },
      ...documentGraphHandlers(MANUAL),
    ]);

    const frame = await resolveTypedFrame(corpus, 'coverage', 'Does MA-3540 cover cosmetic dental whitening for adults?');

    expect(frame.authoritativeDocuments[0]?.policyNumber).toBe('MA-3540');
    expect(frame.primarySections[0]?.title).toBe('B. Cosmetic Dental Whitening');
    expect([...frame.primarySections, ...frame.supportingSections].map((section) => section.reason)).not.toContain(
      'Description section of the policy for the yes/no coverage question.',
    );
  });
});

describe('isEpsdtSpecialProvisionSection', () => {
  it('accepts section 2.2.1 with text and the statute heading that stands in for it', () => {
    expect(isEpsdtSpecialProvisionSection(asFrameSection(TEMPLATE_POLICY_5B, templateSection(TEMPLATE_POLICY_5B, '2.2.1')))).toBe(true);
    expect(
      isEpsdtSpecialProvisionSection(asFrameSection(TEMPLATE_POLICY_8C, templateSectionByTitle(TEMPLATE_POLICY_8C, 'a. 42 U.S.C.'))),
    ).toBe(true);
  });

  it('rejects an empty section 2.2.1', () => {
    expect(isEpsdtSpecialProvisionSection(asFrameSection(TEMPLATE_POLICY_8C, templateSection(TEMPLATE_POLICY_8C, '2.2.1')))).toBe(false);
  });

  it.each(BANNER_NUMBERS)('rejects the section %s note that only names the provision', (number) => {
    const banner = asFrameSection(TEMPLATE_POLICY_5B, templateSection(TEMPLATE_POLICY_5B, number));
    expect(banner.content).toContain(BANNER_TEXT);
    expect(isEpsdtSpecialProvisionSection(banner)).toBe(false);
  });

  it('accepts section 2.2 only when its own body opens with the 2.2.1 heading', () => {
    const parsedIntoBody = asFrameSection(TEMPLATE_POLICY_12B, templateSection(TEMPLATE_POLICY_12B, '2.2'));
    expect(parsedIntoBody.content?.startsWith('2.2.1 EPSDT Special Provision: Exception to Policy Limitations')).toBe(true);
    expect(isEpsdtSpecialProvisionSection(parsedIntoBody)).toBe(true);
    // A 2.2 read through the sections under it repeats 2.2.1 and is not it.
    expect(
      isEpsdtSpecialProvisionSection({
        ...parsedIntoBody,
        contentNote: 'This heading has no text of its own. The text is that of the 1 section under it, each below a "###" line with its title: 2.2.1.',
      }),
    ).toBe(false);
    expect(isEpsdtSpecialProvisionSection({ ...parsedIntoBody, content: 'Special provisions that mention EPSDT and 42 U.S.C. § 1396d(r).' })).toBe(false);
    expect(isEpsdtSpecialProvisionSection({ ...parsedIntoBody, sectionNumber: '5.2' })).toBe(false);
  });

  it('rejects the prior-approval heading that follows the provision', () => {
    expect(
      isEpsdtSpecialProvisionSection(
        asFrameSection(TEMPLATE_POLICY_5B, templateSectionByTitle(TEMPLATE_POLICY_5B, 'b. EPSDT and Prior Approval Requirements')),
      ),
    ).toBe(false);
  });

  it('groups only real provision sections, the numbered one first', () => {
    const flags = buildCoverageQueryFlags(
      normalizeSearchText('Is acupuncture a covered service under Clinical Coverage Policy 8C (Outpatient Behavioral Health)?'),
    );
    const policy = TEMPLATE_POLICY_8C;
    const statute = asFrameSection(policy, templateSectionByTitle(policy, 'a. 42 U.S.C.'));
    const surfaced = [
      asFrameSection(policy, templateSection(policy, '4.0')),
      asFrameSection(policy, templateSection(policy, '4.1')),
      asFrameSection(policy, templateSection(policy, '2.2.1')),
      statute,
    ];

    expect(collectCoverageSectionGroups(surfaced, flags).epsdtExceptionSections).toEqual([statute]);
    expect(collectCoverageSectionGroups(surfaced.slice(0, 3), flags).epsdtExceptionSections).toEqual([]);

    const numbered = asFrameSection(TEMPLATE_POLICY_5B, templateSection(TEMPLATE_POLICY_5B, '2.2.1'));
    expect(collectCoverageSectionGroups([statute, numbered], flags).epsdtExceptionSections).toEqual([numbered, statute]);
  });
});
