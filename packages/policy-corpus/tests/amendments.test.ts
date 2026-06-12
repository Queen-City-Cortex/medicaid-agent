// Amendment trail primitive (getAmendments) and the amendment answer frame.

import { describe, expect, it } from 'vitest';
import {
  amendmentRecord,
  createCorpus,
  createCorpusWithRuns,
  documentGraphHandlers,
  documentRecord,
  hitFor,
  queries,
  resolveTypedFrame,
  type GraphDocument,
} from './helpers/graph-fixtures.js';

describe('getAmendments', () => {
  it('returns the latest amendment as authoritative', async () => {
    const { corpus } = createCorpusWithRuns([
      {
        records: [
          documentRecord({
            id: 'doc-1',
            title: 'Current Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2025-01-01',
            url: 'https://example.com/8C',
            status: 'current',
          }),
        ],
      },
      {
        records: [
          amendmentRecord({
            id: 'amend-2',
            title: 'Change Notice 2025-03',
            documentType: 'change_notice',
            policyNumber: '8C-CN-03',
            effectiveDate: '2025-08-01',
            url: 'https://example.com/cn-03',
            status: 'amendment',
            changeDescription: 'This change notice supersedes the prior revision.',
          }),
          amendmentRecord({
            id: 'amend-1',
            title: 'Change Notice 2025-01',
            documentType: 'change_notice',
            policyNumber: '8C-CN-01',
            effectiveDate: '2025-06-01',
            url: 'https://example.com/cn-01',
            status: 'amendment',
            changeDescription: 'MA-2180 is revised in the following way...',
          }),
        ],
      },
      {
        records: [
          documentRecord({
            id: 'doc-base',
            title: 'Original Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2024-01-01',
            url: 'https://example.com/8C',
            status: 'current',
          }),
        ],
      },
    ]);

    const amendments = await corpus.getAmendments('doc-1');

    expect(amendments.amendments).toHaveLength(2);
    expect(amendments.authoritativeDocument?.id).toBe('amend-2');
    expect(amendments.baseDocument?.id).toBe('doc-base');
  });
});

describe('amendment frame', () => {
  const MA_3550: GraphDocument = {
    id: 'doc-ma3550',
    title: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
    documentType: 'dhhs_policy',
    policyNumber: 'MA-3550',
    effectiveDate: '2026-04-01',
    url: 'https://example.com/ma3550',
    sections: [
      { id: 'sec-revised', number: null, title: 'REVISED CHANGE NO. 04-26', content: 'Revision header for the current NEMT manual.', chars: 120 },
      { id: 'sec-content', number: null, title: 'Content of Change', content: 'Older readable change context.', chars: 250 },
    ],
  };

  it('surfaces the latest revision header and authoritative document', async () => {
    const { corpus, expectAllHandlersUsed } = createCorpus([
      {
        label: 'vector dhhs',
        match: queries.sectionVector('dhhs_policy'),
        result: {
          records: [hitFor(MA_3550, 'sec-revised', 0.98), hitFor(MA_3550, 'sec-content', 0.9)],
        },
      },
      // The query explicitly names MA-3550, so the frame consults lookupPolicy
      // first; this fixture intentionally routes document discovery through
      // the hit -> getSection -> getDocument path instead.
      ...documentGraphHandlers(MA_3550, { policyLookup: false }),
      {
        label: 'amendments current document',
        match: queries.documentMetadataById('doc-ma3550'),
        result: {
          records: [
            documentRecord({
              id: 'doc-ma3550',
              title: MA_3550.title,
              documentType: 'dhhs_policy',
              policyNumber: 'MA-3550',
              effectiveDate: '2026-04-01',
              url: 'https://example.com/ma3550',
              status: 'current',
            }),
          ],
        },
      },
      {
        label: 'amendment trail',
        match: queries.amendmentsOf('doc-ma3550'),
        result: {
          records: [
            amendmentRecord({
              id: 'amend-04-26',
              title: 'Change Notice 04-26',
              documentType: 'change_notice',
              policyNumber: 'MA-3550-CN-04-26',
              effectiveDate: '2026-04-01',
              url: 'https://example.com/cn-04-26',
              status: 'amendment',
              changeDescription: 'Updates the current NEMT revision.',
            }),
          ],
        },
      },
      {
        label: 'amendment base',
        match: queries.amendmentBaseOf('doc-ma3550'),
        result: { records: [] },
      },
    ]);

    const frame = await resolveTypedFrame(corpus, 'amendment', 'What is the latest change notice for MA-3550?');

    expect(frame.questionType).toBe('amendment');
    expect(frame.route.lane).toBe('deterministic_evidence');
    expect(frame.route.determinism_hints.latest_revision_only).toBe(true);
    expect(frame.authoritativeDocuments[0]?.id).toBe('doc-ma3550');
    expect(frame.authoritativeDocuments.every((document) => document.policyNumber === 'MA-3550')).toBe(true);
    expect(frame.primarySections[0]?.title).toBe('REVISED CHANGE NO. 04-26');
    expect(frame.supportingSections).toHaveLength(0);
    expect(frame.avoidSections).toHaveLength(0);
    expect(frame.latestRevision?.marker).toContain('04-26');
    expectAllHandlersUsed();
  });
});
