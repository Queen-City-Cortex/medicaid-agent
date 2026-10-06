// Amendment trail primitive (getAmendments) and the amendment answer frame.

import { describe, expect, it } from 'vitest';
import {
  amendmentRecord,
  createCorpus,
  createCorpusWithRuns,
  documentGraphHandlers,
  documentRecord,
  hitFor,
  normalizeQueryText,
  queries,
  resolveTypedFrame,
  type GraphDocument,
} from './helpers/graph-fixtures.js';

const MANUAL = documentRecord({
  id: 'doc-ma3550',
  title: 'MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)',
  documentType: 'dhhs_policy',
  policyNumber: 'MA-3550',
  url: 'https://example.com/ma3550',
  status: 'current',
});

// A DHHS change notice as the loader writes it: no date, the year and
// sequence of its number ("04-26") stored instead.
function notice(number: string, id = `doc-cn-${number}`, effectiveDate: string | null = null) {
  const [sequence, year] = number.split('-').map((part) => Number.parseInt(part, 10));
  return amendmentRecord({
    id,
    title: `CHANGE NOTICE FOR MANUAL NO. ${number}, NEMT`,
    documentType: 'dhhs_policy',
    url: `https://example.com/${id}`,
    effectiveDate,
    status: 'amendment',
    changeYear: 2000 + year,
    changeSequence: sequence,
    changeDescription: `Notice ${number} revises MA-3550.`,
  });
}

// The same notice as graphs loaded before the null-date decision carry it:
// January 1 of the year, no stored year or sequence.
function januaryFirstNotice(number: string, id: string) {
  return amendmentRecord({
    id,
    title: `CHANGE NOTICE FOR MANUAL NO. ${number}, NEMT`,
    documentType: 'dhhs_policy',
    effectiveDate: `20${number.split('-')[1]}-01-01`,
    status: 'amendment',
  });
}

function amendmentsFor(amendmentRecords: ReturnType<typeof amendmentRecord>[], amended: ReturnType<typeof documentRecord>[] = []) {
  return createCorpusWithRuns([{ records: [MANUAL] }, { records: amendmentRecords }, { records: amended }]);
}

describe('getAmendments', () => {
  it('returns the queried manual as the document and its notices as history', async () => {
    // The graph returned 02-26 ahead of 04-26 while both carried 2026-01-01.
    const { corpus } = amendmentsFor([notice('02-26'), notice('04-26')]);

    const view = await corpus.getAmendments('doc-ma3550');

    expect(view.document?.id).toBe('doc-ma3550');
    expect(view.amendments.map((amendment) => amendment.id)).toEqual(['doc-cn-04-26', 'doc-cn-02-26']);
    expect(view.latestAmendment?.id).toBe('doc-cn-04-26');
    expect(view.latestAmendment).toMatchObject({ effectiveDate: null, changeYear: 2026, changeSequence: 4 });
    expect(view.amends).toEqual([]);
    expect(view.truncated).toBe(false);
    expect(view).not.toHaveProperty('authoritativeDocument');
    expect(view).not.toHaveProperty('baseDocument');
  });

  it('orders same-year notices by sequence, then older years, then id', async () => {
    const { corpus } = amendmentsFor([
      notice('11-25'),
      notice('01-26'),
      // ABD and Family and Children's twins share a number; id breaks the tie.
      notice('04-26', 'doc-cn-04-26-fc'),
      notice('02-26'),
      notice('04-26', 'doc-cn-04-26-abd'),
    ]);

    const view = await corpus.getAmendments('doc-ma3550');

    expect(view.amendments.map((amendment) => amendment.id)).toEqual([
      'doc-cn-04-26-abd',
      'doc-cn-04-26-fc',
      'doc-cn-02-26',
      'doc-cn-01-26',
      'doc-cn-11-25',
    ]);
  });

  it('orders notices sharing a header date by sequence, and by number year before date', async () => {
    const { corpus } = amendmentsFor([
      notice('02-26', 'doc-cn-02-26', '2026-03-04'),
      // Numbered in 2025 but dated after every 2026 notice: the number governs.
      notice('11-25', 'doc-cn-11-25', '2026-06-30'),
      notice('04-26', 'doc-cn-04-26', '2026-03-04'),
      notice('03-26', 'doc-cn-03-26', '2026-03-04'),
    ]);

    const view = await corpus.getAmendments('doc-ma3550');

    expect(view.amendments.map((amendment) => amendment.id)).toEqual(['doc-cn-04-26', 'doc-cn-03-26', 'doc-cn-02-26', 'doc-cn-11-25']);
  });

  it('keeps a January 1 header date on a notice that stores its year and sequence', async () => {
    const { corpus } = amendmentsFor([notice('01-26', 'doc-cn-01-26', '2026-01-01')]);

    const view = await corpus.getAmendments('doc-ma3550');

    expect(view.latestAmendment).toMatchObject({ id: 'doc-cn-01-26', changeYear: 2026, changeSequence: 1, effectiveDate: '2026-01-01' });
  });

  it('orders dated revision rows by date and puts undated, unnumbered rows last', async () => {
    const row = (id: string, effectiveDate: string | null) =>
      amendmentRecord({ id, title: `Policy 8C Revision ${id}`, documentType: 'change_notice', effectiveDate, status: 'amendment' });
    const { corpus } = amendmentsFor([row('undated', null), row('2024-03', '2024-03-01'), row('2025-09', '2025-09-01'), row('2024-11', '2024-11-15')]);

    const view = await corpus.getAmendments('doc-ma3550');

    expect(view.amendments.map((amendment) => amendment.id)).toEqual(['2025-09', '2024-11', '2024-03', 'undated']);
  });

  it('reads the number from the title on a graph loaded before the null-date decision', async () => {
    const { corpus } = amendmentsFor([
      januaryFirstNotice('07-25', 'doc-b'),
      januaryFirstNotice('02-26', 'doc-c'),
      januaryFirstNotice('04-26', 'doc-d'),
    ]);

    const view = await corpus.getAmendments('doc-ma3550');

    // That graph stores no year or sequence and a fabricated January 1 date:
    // the title supplies the number, and the fabricated date is not reported.
    expect(view.amendments.map((amendment) => amendment.id)).toEqual(['doc-d', 'doc-c', 'doc-b']);
    expect(view.latestAmendment).toMatchObject({ id: 'doc-d', changeYear: 2026, changeSequence: 4, effectiveDate: null });
  });

  it('lists every amended document for a notice, ordered in the query by policy number then id', async () => {
    const manual = (id: string, policyNumber: string) =>
      documentRecord({ id, title: `${policyNumber} manual`, documentType: 'dhhs_policy', policyNumber, status: 'current' });
    const { corpus, session } = createCorpusWithRuns([
      { records: [amendmentRecord({ id: 'doc-cn-02-26', title: 'CHANGE NOTICE FOR MANUAL NO. 02-26', status: 'amendment' })] },
      { records: [] },
      { records: [manual('doc-abd', 'MA-2270'), manual('doc-fc', 'MA-3322'), manual('doc-nemt', 'MA-3550')] },
    ]);

    const view = await corpus.getAmendments('doc-cn-02-26');

    expect(view.document?.id).toBe('doc-cn-02-26');
    expect(view.amends.map((document) => document.id)).toEqual(['doc-abd', 'doc-fc', 'doc-nemt']);
    expect(view.latestAmendment).toBeNull();
    const amendsQuery = normalizeQueryText(session.run.mock.calls[2][0] as string);
    expect(amendsQuery).toContain('ORDER BY base.policy_number ASC, base.id ASC');
    expect(amendsQuery).not.toContain('LIMIT');
  });

  it('reads history from revision nodes and documents alike, on a graph loaded before or after the relabel', async () => {
    const { corpus, session } = amendmentsFor([]);

    await corpus.getAmendments('doc-ma3550');

    const [documentQuery, trailQuery, amendsQuery] = session.run.mock.calls.map((call) => normalizeQueryText(call[0] as string));
    // Clinical revision entries are :PolicyRevision; before the relabel they
    // were :Document. No label on the amending node matches both.
    expect(trailQuery).toContain('OPTIONAL MATCH (amend)-[r:AMENDS]->(d)');
    for (const query of [documentQuery, trailQuery, amendsQuery]) {
      expect(query).toContain('MATCH (d:Document|PolicyRevision {id: $id})');
    }
    // What a node amends is always a document.
    expect(amendsQuery).toContain('-[:AMENDS]->(base:Document)');
  });

  it('orders the trail in the query by year, sequence, date and id, with no null sort key', async () => {
    const { corpus, session } = amendmentsFor([]);

    await corpus.getAmendments('doc-ma3550');

    expect(normalizeQueryText(session.run.mock.calls[1][0] as string)).toContain(
      'ORDER BY ' +
        'coalesce(amend.change_year, toInteger(substring(amend.effective_date, 0, 4)), 0) DESC, ' +
        'coalesce(amend.change_sequence, 0) DESC, ' +
        "coalesce(amend.effective_date, '') DESC, " +
        'amend.id ASC',
    );
  });

  it('reports a trail longer than the cap as truncated', async () => {
    const rows = Array.from({ length: 51 }, (_, index) =>
      amendmentRecord({ id: `row-${String(index).padStart(2, '0')}`, effectiveDate: `20${String(60 - index).padStart(2, '0')}-01-01` }),
    );
    const { corpus } = amendmentsFor(rows);

    const view = await corpus.getAmendments('doc-ma3550');

    expect(view.amendments).toHaveLength(50);
    expect(view.truncated).toBe(true);
    expect(view.latestAmendment?.id).toBe('row-00');
  });

  it('returns a null document for an unknown id', async () => {
    const { corpus } = createCorpusWithRuns([{ records: [] }, { records: [] }, { records: [] }]);

    await expect(corpus.getAmendments('missing')).resolves.toEqual({
      document: null,
      amends: [],
      amendments: [],
      latestAmendment: null,
      truncated: false,
    });
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
