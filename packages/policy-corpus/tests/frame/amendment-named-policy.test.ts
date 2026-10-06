// Amendment frames for a clinical policy the question names. The pipeline
// derives one section-less `change_notice` row per revision-table entry, all
// sharing the policy's number; the frame must still lead with the policy.

import { describe, expect, it, vi } from 'vitest';

import { createFrameContext } from '../../src/frame/context.js';
import { resolveAmendmentFrame } from '../../src/frame/pipelines/amendment.js';
import { analyzeQuery } from '../../src/query/analysis.js';
import type { LegalPrimitiveService } from '../../src/contracts.js';
import type { AmendmentDocumentView, AmendmentsView, DocumentView, DocumentWithSectionsView } from '../../src/types.js';
import { makeHit } from '../helpers/objects.js';

const HISTORY_QUESTION = 'What has been amended in Clinical Coverage Policy 8C since 2024?';
const LATEST_QUESTION = 'When was the most recent change notice for Policy 8C?';

function document(overrides: Partial<DocumentView> & { id: string }): DocumentView {
  return {
    title: null,
    documentType: 'clinical_policy',
    policyNumber: '8C',
    effectiveDate: null,
    url: 'https://example.com/8C',
    citationLink: null,
    status: 'current',
    authorityTier: 'state',
    answerRole: 'governing',
    sourceFormat: 'pdf',
    answerReady: true,
    corpusBucket: null,
    variantGroup: null,
    variantDate: null,
    retrievalReady: true,
    ...overrides,
  };
}

const POLICY = document({ id: 'doc:clinical_policy:8C', title: 'Outpatient Behavioral Health Services', effectiveDate: '2025-04-15' });

// Newest first, as getAmendments and lookupPolicy both sort them.
const REVISION_ROWS: AmendmentDocumentView[] = Array.from({ length: 30 }, (_, index) => {
  const year = 2025 - Math.floor(index / 2);
  const iso = `${year}-${index % 2 === 0 ? '04-15' : '01-01'}`;
  return {
    ...document({
      id: `doc:change_notice:8C:${iso}`,
      title: `Policy 8C Revision — ${iso} (Section 3.2)`,
      documentType: 'change_notice',
      effectiveDate: iso,
      status: 'amendment',
      authorityTier: 'supporting',
      answerRole: null,
      sourceFormat: 'derived',
      retrievalReady: false,
    }),
    changeSummary: `Revision effective ${iso}.`,
    changeYear: null,
    changeSequence: null,
  };
});
const NEWEST_ROW = REVISION_ROWS[0];

function withSections(view: DocumentView): DocumentWithSectionsView {
  return { ...view, sections: [] };
}

function resolve(question: string, lookupRows: DocumentView[]) {
  const getAmendments = vi.fn<LegalPrimitiveService['getAmendments']>(async (documentId) =>
    documentId === POLICY.id
      ? { document: POLICY, amends: [], amendments: REVISION_ROWS, latestAmendment: NEWEST_ROW, truncated: false }
      : {
          document: REVISION_ROWS.find((row) => row.id === documentId) ?? null,
          amends: [POLICY],
          amendments: [],
          latestAmendment: null,
          truncated: false,
        },
  );
  const primitives = {
    getSection: vi.fn(async () => null),
    getDocument: vi.fn(async () => null),
    getAmendments,
    lookupPolicy: vi.fn(async ({ policyNumber }: { policyNumber: string }) =>
      policyNumber === '8C' ? lookupRows.map(withSections) : [],
    ),
  } as unknown as LegalPrimitiveService;
  const context = createFrameContext({
    searchSectionsDetailed: async () => [],
    primitives,
    withSession: async () => {
      throw new Error('no session expected');
    },
  });
  const analysis = analyzeQuery(question, 'amendment');
  return { analysis, getAmendments, frame: resolveAmendmentFrame(context, analysis) };
}

describe.each([
  // What lookupPolicy returned while revision rows shared the lookup.
  { lookup: 'the policy and its 30 revision rows', lookupRows: [POLICY, ...REVISION_ROWS] },
  // What it returns once revision rows are left to getAmendments.
  { lookup: 'the policy alone', lookupRows: [POLICY] },
])('amendment frame for a named clinical policy when lookup returns $lookup', ({ lookupRows }) => {
  it.each([
    { route: 'amendment-history', question: HISTORY_QUESTION, latestRevisionOnly: false },
    { route: 'latest-revision', question: LATEST_QUESTION, latestRevisionOnly: true },
  ])('leads with the policy and keeps its newest revision on the $route route', async ({ question, latestRevisionOnly }) => {
    const { analysis, getAmendments, frame } = resolve(question, lookupRows);
    expect(analysis.route.determinism_hints.latest_revision_only).toBe(latestRevisionOnly);

    const documents = (await frame).authoritativeDocuments;

    expect(documents[0]?.id).toBe(POLICY.id);
    expect(documents.map((entry) => entry.id)).toContain(NEWEST_ROW.id);
    expect(getAmendments.mock.calls).toEqual([[POLICY.id]]);
  });
});

describe('amendment trail fan-out', () => {
  it('consults at most three named documents', async () => {
    const manuals = Array.from({ length: 6 }, (_, index) =>
      document({ id: `doc:dhhs_policy:${index}`, documentType: 'dhhs_policy', title: `8C variant ${index}` }),
    );
    const { getAmendments, frame } = resolve(HISTORY_QUESTION, manuals);

    expect((await frame).authoritativeDocuments[0]?.id).toBe(manuals[0].id);
    expect(getAmendments.mock.calls.map(([id]) => id)).toEqual(manuals.slice(0, 3).map((manual) => manual.id));
  });

  it('still reads the trail of a change notice when the lookup returns nothing else', async () => {
    const { getAmendments, frame } = resolve(HISTORY_QUESTION, REVISION_ROWS.slice(0, 5));

    const documents = (await frame).authoritativeDocuments;

    expect(getAmendments.mock.calls).toEqual([[NEWEST_ROW.id]]);
    expect(documents[0]?.id).toBe(NEWEST_ROW.id);
  });
});

// No policy is named, so the trail is read from the documents the hits sit in.
describe('amendment frame for a document found through its sections', () => {
  const QUESTION = 'What has been amended in the non-emergency medical transportation manual?';
  const manual = (id: string, policyNumber: string) =>
    document({ id, documentType: 'dhhs_policy', policyNumber, title: `${policyNumber} manual` });
  const NEMT = manual('doc:dhhs_policy:nemt', 'MA-3550');
  const ABD_TWIN = manual('doc:dhhs_policy:abd', 'MA-2910');
  const notice = (number: string): AmendmentDocumentView => ({
    ...document({
      id: `doc:dhhs_policy:cn-${number}`,
      documentType: 'dhhs_policy',
      policyNumber: null,
      title: `CHANGE NOTICE FOR MANUAL NO. ${number}, NEMT`,
      status: 'amendment',
    }),
    changeSummary: `Notice ${number} revises the transportation manuals.`,
    changeYear: 2026,
    changeSequence: Number.parseInt(number, 10),
  });
  const NOTICES = [notice('04-26'), notice('02-26')];

  function resolveFromHit(hitDocument: DocumentView, views: Record<string, AmendmentsView>) {
    const primitives = {
      getSection: vi.fn(async (sectionId: string) => ({ id: sectionId, documentId: hitDocument.id })),
      getDocument: vi.fn(async (documentId: string) =>
        documentId === hitDocument.id ? withSections(hitDocument) : null,
      ),
      getAmendments: vi.fn(async (documentId: string) => views[documentId]),
      lookupPolicy: vi.fn(async () => []),
    } as unknown as LegalPrimitiveService;
    const context = createFrameContext({
      searchSectionsDetailed: async () => [
        makeHit({ sectionId: 'sec:hit', sectionTitle: 'Content of Change', documentTitle: hitDocument.title }),
      ],
      primitives,
      withSession: async () => {
        throw new Error('no session expected');
      },
    });
    return resolveAmendmentFrame(context, analyzeQuery(QUESTION, 'amendment'));
  }

  it('leads with the manual and ranks its newest notice below it', async () => {
    const frame = await resolveFromHit(NEMT, {
      [NEMT.id]: { document: NEMT, amends: [], amendments: NOTICES, latestAmendment: NOTICES[0], truncated: false },
    });

    expect(frame.authoritativeDocuments.map((entry) => entry.id)).toEqual([NEMT.id, NOTICES[0].id]);
    expect(frame.authoritativeDocuments[1]?.reason).toBe('Amendment describing what changed; not the current text.');
  });

  it('leads with every manual a change notice amends, ahead of the notice', async () => {
    const frame = await resolveFromHit(NOTICES[0], {
      [NOTICES[0].id]: {
        document: NOTICES[0],
        amends: [ABD_TWIN, NEMT],
        amendments: [],
        latestAmendment: null,
        truncated: false,
      },
    });

    expect(frame.authoritativeDocuments.map((entry) => entry.id)).toEqual([ABD_TWIN.id, NEMT.id, NOTICES[0].id]);
  });
});
