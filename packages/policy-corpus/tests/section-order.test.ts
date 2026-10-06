// Section listing order: the graph returns a document's sections in no fixed
// order, so the listing, the title picks made from it, and the frames built
// from those picks must not depend on the order the graph happened to use.

import { describe, expect, it } from 'vitest';
import { mapDocumentSections, pickDocumentSectionsByTitle } from '../src/internal/shared.js';
import type { DocumentWithSectionsView } from '../src/types.js';
import {
  createCorpus,
  documentGraphHandlers,
  hitFor,
  queries,
  resolveTypedFrame,
  type GraphDocument,
} from './helpers/graph-fixtures.js';

/** Reversal, a rotation, and seeded Fisher-Yates shuffles of a listing. */
function listingOrders<T>(items: readonly T[]): T[][] {
  const orders = [[...items].reverse(), [...items.slice(3), ...items.slice(0, 3)]];
  let state = 0x9e3779b9;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let round = 0; round < 12; round += 1) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(next() * (index + 1));
      [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }
    orders.push(shuffled);
  }
  return orders;
}

// Every title scores the same against "prior approval", so only the tie-break
// decides which sections fill a capped pick.
const TIED_SECTIONS = [
  { id: 'doc-9a_s0', number: null, title: 'Prior Approval' },
  { id: 'doc-9a_s7', number: '5.1', title: 'Prior Approval' },
  { id: 'doc-9a_s8', number: '5.2', title: 'Prior Approval' },
  { id: 'doc-9a_s9', number: '5.10', title: 'Prior Approval' },
  { id: 'doc-9a_s12', number: '10.1', title: 'Prior Approval' },
  { id: 'doc-9a_s14', number: 'Attachment B', title: 'Prior Approval' },
  { id: 'doc-9a_s15', number: 'Attachment B', title: 'Prior Approval' },
  { id: 'doc-9a_s20', number: 'Attachment A', title: 'Prior Approval' },
];
const LISTING_ORDER = [
  'doc-9a_s0',
  'doc-9a_s7',
  'doc-9a_s8',
  'doc-9a_s9',
  'doc-9a_s12',
  'doc-9a_s20',
  'doc-9a_s14',
  'doc-9a_s15',
];

describe('mapDocumentSections', () => {
  it('lists sections by natural section number, then id, whatever order the graph returns', () => {
    for (const order of [TIED_SECTIONS, ...listingOrders(TIED_SECTIONS)]) {
      expect(mapDocumentSections(order).map((section) => section.id)).toEqual(LISTING_ORDER);
    }
  });

  it('keeps unnumbered sections in parse order past nine', () => {
    const unnumbered = ['doc_s10', 'doc_s2', 'doc_s1'].map((id) => ({ id, number: null, title: null }));

    expect(mapDocumentSections(unnumbered).map((section) => section.id)).toEqual(['doc_s1', 'doc_s2', 'doc_s10']);
  });
});

describe('pickDocumentSectionsByTitle', () => {
  const documentWith = (sections: typeof TIED_SECTIONS) => ({ sections }) as unknown as DocumentWithSectionsView;

  it('breaks tied title matches by listing order, not input order', () => {
    for (const order of [TIED_SECTIONS, ...listingOrders(TIED_SECTIONS)]) {
      expect(pickDocumentSectionsByTitle(documentWith(order), ['prior approval'], [], 3)).toEqual(
        LISTING_ORDER.slice(0, 3),
      );
    }
  });

  it('still ranks a stronger title match above an earlier section', () => {
    const sections = [
      ...TIED_SECTIONS,
      { id: 'doc-9a_s30', number: 'Attachment C', title: 'Prior Approval Criteria' },
    ];

    for (const order of [sections, ...listingOrders(sections)]) {
      expect(pickDocumentSectionsByTitle(documentWith(order), ['prior approval', 'criteria'], [], 2)).toEqual([
        'doc-9a_s30',
        'doc-9a_s0',
      ]);
    }
  });
});

describe('answer frames and section listing order', () => {
  const resolveWithListing = async (sections: typeof TIED_SECTIONS) => {
    const DOC_9A: GraphDocument = {
      id: 'doc-9a',
      title: 'Clinical Coverage Policy 9A',
      documentType: 'clinical_policy',
      policyNumber: '9A',
      effectiveDate: '2025-01-01',
      url: 'https://example.com/9A',
      sections: sections.map((section) => ({
        ...section,
        content: `Prior approval is required under ${section.number ?? 'the introduction'}.`,
        chars: 400,
      })),
    };
    const { corpus } = createCorpus([
      {
        label: 'vector clinical',
        match: queries.sectionVector('clinical_policy'),
        result: { records: [hitFor(DOC_9A, 'doc-9a_s20', 0.9)] },
      },
      ...documentGraphHandlers(DOC_9A),
    ]);
    return resolveTypedFrame(corpus, 'prior_authorization', 'What prior approval criteria apply under Policy 9A?');
  };

  it('resolves the same frame however the graph lists the document sections', async () => {
    const baseline = await resolveWithListing(TIED_SECTIONS);

    // More tied sections than the frame has slots, so the tie-break shows.
    const framed = [...baseline.primarySections, ...baseline.supportingSections].map((section) => section.id);
    expect(framed.length).toBeGreaterThan(0);
    expect(framed.length).toBeLessThan(TIED_SECTIONS.length);

    for (const order of listingOrders(TIED_SECTIONS)) {
      expect(await resolveWithListing(order)).toEqual(baseline);
    }
  });
});
