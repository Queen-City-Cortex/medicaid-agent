import { describe, expect, it } from 'vitest';

import {
  createCorpus,
  documentGraphHandlers,
  hitFor,
  queries,
  type GraphDocument,
  type SessionHandler,
} from '../helpers/graph-fixtures.js';

// SAFE-1b frame routing. The appeal alias feeds search only; frame document
// routing must stay on the coverage policy for a mixed coverage-and-appeal
// question, whether or not the hearing statutes are in the graph yet.

const DOC_DENTAL: GraphDocument = {
  id: 'doc-4a',
  title: 'Clinical Coverage Policy 4A: Dental Services',
  documentType: 'clinical_policy',
  policyNumber: '4A',
  effectiveDate: '2025-01-01',
  url: 'https://example.com/4A',
  sections: [
    { id: 'sec-4a-implants', number: '4.2.1', title: '4.2.1 Dental Implants', content: 'Dental implants are not covered except under EPSDT for beneficiaries under 21.', chars: 900 },
    { id: 'sec-4a-pa', number: '5.1', title: '5.1 Prior Approval', content: 'Prior approval is required. A denied request may be appealed.', chars: 700 },
  ],
};

const statute = (policyNumber: string, content: string): GraphDocument => ({
  id: `doc-ncgs-${policyNumber}`,
  title: `N.C.G.S. ${policyNumber}`,
  documentType: 'nc_statute',
  policyNumber,
  effectiveDate: '2025-07-01',
  url: `https://www.ncleg.gov/${policyNumber}`,
  sections: [{ id: `sec-ncgs-${policyNumber}`, number: policyNumber, title: `G.S. ${policyNumber}`, content, chars: 800 }],
});

const STATUTES = [
  statute('108A-70.9A', 'A recipient may appeal an adverse determination within 60 days of the notice.'),
  statute('108D-14', 'An enrollee shall request a plan appeal within 60 days of the notice of adverse benefit determination.'),
  statute('108D-15', 'An enrollee may request a contested case hearing within 120 days after the plan appeal decision.'),
  statute('108A-79', 'An applicant may appeal a county denial of an application within 60 days.'),
];

function corpusFor(withStatutes: boolean, coverageHit: boolean) {
  const handlers: SessionHandler[] = [];
  if (coverageHit) {
    handlers.push({
      label: 'vector clinical',
      match: queries.sectionVector('clinical_policy'),
      result: { records: [hitFor(DOC_DENTAL, 'sec-4a-implants', 0.93), hitFor(DOC_DENTAL, 'sec-4a-pa', 0.9)] },
    });
    handlers.push(...documentGraphHandlers(DOC_DENTAL));
  }
  if (withStatutes) {
    handlers.push({
      label: 'vector nc_statute',
      match: queries.sectionVector('nc_statute'),
      result: { records: STATUTES.map((doc, index) => hitFor(doc, doc.sections[0]!.id, 0.92 - index * 0.01)) },
    });
    for (const doc of STATUTES) handlers.push(...documentGraphHandlers(doc));
  }
  return createCorpus(handlers).corpus;
}

const summary = (frame: Awaited<ReturnType<ReturnType<typeof corpusFor>['resolveAnswerFrame']>>) => ({
  questionType: frame.questionType,
  documents: frame.authoritativeDocuments.map((doc) => doc.policyNumber),
  primary: frame.primarySections.map((section) => `${section.policyNumber ?? '?'}:${section.sectionNumber}:${section.content ? 'text' : 'no-text'}`),
  supporting: frame.supportingSections.map((section) => `${section.policyNumber ?? '?'}:${section.sectionNumber}:${section.content ? 'text' : 'no-text'}`),
});

const MIXED = 'Does Medicaid cover dental implants, and how do I appeal if it is denied?';
const PURE_APPEAL = 'How long do I have to appeal a Medicaid service denial?';

describe('SAFE-1b frame routing for appeal questions', () => {
  for (const withStatutes of [false, true]) {
    it(`keeps the mixed question on the dental policy ${withStatutes ? 'after' : 'before'} the statute release`, async () => {
      const frame = summary(await corpusFor(withStatutes, true).resolveAnswerFrame({ query: MIXED }));
      // Same frame on both graph states: no statute or county manual displaces 4A.
      expect(frame).toEqual({
        questionType: 'coverage',
        documents: ['4A'],
        primary: ['4A:5.1:text'],
        supporting: ['4A:4.2.1:text'],
      });
    });
  }

  it('reports the pure appeal frame when statute sections are among the hits', async () => {
    const frame = summary(await corpusFor(true, false).resolveAnswerFrame({ query: PURE_APPEAL }));
    // Classified general, not coverage. The frame documents are the three
    // service-denial statutes the alias names; 108A-79 (county eligibility) is
    // not a frame document, yet its section still lands among the primary
    // sections because it was a search hit. Every statute section carries text.
    expect(frame).toEqual({
      questionType: 'general',
      documents: ['108A-70.9A', '108D-14', '108D-15'],
      primary: ['108A-70.9A:108A-70.9A:text', '108D-14:108D-14:text', '108D-15:108D-15:text', '108A-79:108A-79:text'],
      supporting: [],
    });
  });
});
