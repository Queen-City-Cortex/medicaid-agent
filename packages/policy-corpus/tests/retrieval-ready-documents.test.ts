// Documents the pipeline marked not retrieval-ready stay in the graph but out
// of search: every backend that returns sections as hits skips them, a frame
// does not route on one, an explicit document-type filter does not bring them
// back, and a read by id or by policy number still returns one, labelled.
// Amendment history, whose revision entries are not retrieval-ready on
// purpose, is reached through the AMENDS edge and is not filtered.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { notArchived, retrievalReady } from '../src/internal/shared.js';
import { createAmendmentPrimitiveService } from '../src/primitives/amendments.js';
import type { SessionExecutor } from '../src/types.js';
import {
  createCorpus,
  documentGraphHandlers,
  hitFor,
  policyLookupHandler,
  queries,
  resolveTypedFrame,
  type GraphDocument,
  type SessionHandler,
} from './helpers/graph-fixtures.js';

const READY_FILTER = /coalesce\((d|base)\.retrieval_ready, true\) = true/;
const ARCHIVED_FILTER = /coalesce\((d|base)\.archived, false\) = false/;

function nonMagiTable(year: number, retrievalReadyValue: boolean | null): GraphDocument {
  return {
    id: `doc-non-magi-${year}`,
    title: `MA-2252 NON-MAGI MEDICAID INCOME/RESERVE LIMITS ${year}`,
    documentType: 'dhhs_policy',
    policyNumber: 'MA-2252',
    effectiveDate: null,
    url: `https://policies.ncdhhs.gov/wp-content/uploads/${year}-NON-MAGI.pdf`,
    // What the loader writes for an older edition the agency has not archived.
    status: retrievalReadyValue === false ? 'superseded' : 'current',
    answerReady: true,
    retrievalReady: retrievalReadyValue,
    sections: [
      {
        id: `sec-non-magi-${year}`,
        number: '1',
        title: 'Income limits for aged, blind and disabled Medicaid',
        content: `Aged, blind and disabled Medicaid income limit and reserve limit table published ${year}.`,
      },
    ],
  };
}

function feeSchedule(id: string, bucket: 'primary' | 'archive', variantDate: string): GraphDocument {
  return {
    id,
    title: `Physician Services Fee Schedule ${variantDate}`,
    documentType: 'fee_schedule',
    policyNumber: null,
    effectiveDate: null,
    url: `https://medicaid.ncdhhs.gov/${id}.xlsx`,
    status: 'current',
    answerReady: true,
    corpusBucket: bucket,
    variantGroup: 'physician-services',
    variantDate,
    retrievalReady: bucket === 'primary',
    sections: [
      {
        id: `sec-${id}`,
        number: null,
        title: 'Physician services rates',
        content: `Physician services fee schedule rates for procedure code 99213, effective ${variantDate}.`,
      },
    ],
  };
}

// The graph on the serving side still holds nodes written before the property
// existed, so the current table carries no value at all.
const CURRENT = nonMagiTable(2026, null);
const NOT_READY = [nonMagiTable(2021, false), nonMagiTable(2019, false)];
const hit = (doc: GraphDocument, score: number) => hitFor(doc, doc.sections[0].id, score);

// The session stub returns canned rows, so the graph's side of the predicate
// is modelled here: a scan that carries the readiness filter sees only ready
// documents, one without it sees every document.
function filteredScan(
  matcher: (query: string, params: Record<string, unknown>) => boolean,
  ready: ReturnType<typeof hit>[],
  all: ReturnType<typeof hit>[],
): SessionHandler[] {
  return [
    {
      label: 'scan with readiness filter',
      match: (query, params) => matcher(query, params) && READY_FILTER.test(query),
      result: { records: ready },
    },
    { label: 'scan without readiness filter', optional: true, match: matcher, result: { records: all } },
  ];
}

const nonMagiScan = () =>
  filteredScan(
    queries.sectionVector('dhhs_policy'),
    [hit(CURRENT, 0.9)],
    [hit(NOT_READY[0], 0.97), hit(NOT_READY[1], 0.95), hit(CURRENT, 0.9)],
  );

const searchQueries = (session: { run: ReturnType<typeof vi.fn> }) =>
  session.run.mock.calls
    .map(([query]) => String(query))
    .filter((query) => query.includes('AS sectionId') && query.includes('AS score'))
    .filter((query) => !queries.hcwdAmendmentHistory()(query, {}));

function frameDocumentIds(frame: Awaited<ReturnType<typeof resolveTypedFrame>>): (string | null)[] {
  return [
    ...frame.authoritativeDocuments.map((document) => document.id),
    ...[...frame.primarySections, ...frame.supportingSections].map((section) => section.documentId),
  ];
}

describe('documents that are not retrieval-ready', () => {
  it('reads a missing value as ready and writes the condition beside the archived one', () => {
    expect(retrievalReady('d')).toBe('coalesce(d.retrieval_ready, true) = true');
    expect(retrievalReady('base')).toMatch(READY_FILTER);
    expect(notArchived('d')).toMatch(ARCHIVED_FILTER);
  });

  it('pairs the readiness condition with the archived one in every search backend', () => {
    const directory = new URL('../src/retrieval/backends/', import.meta.url);
    const files = readdirSync(directory).filter((name) => name.endsWith('.ts'));
    expect(files).toHaveLength(8);
    const uses = (source: string, helper: string) =>
      [...source.matchAll(new RegExp(`AND \\$\\{${helper}\\('(\\w+)'\\)\\}`, 'g'))].map((match) => match[1]);
    let sites = 0;
    for (const file of files) {
      const source = readFileSync(new URL(file, directory), 'utf8');
      const archived = uses(source, 'notArchived');
      // A backend with no condition at all returns sections from any document.
      expect(archived.length, file).toBeGreaterThan(0);
      expect(uses(source, 'retrievalReady'), file).toEqual(archived);
      expect(archived.every((alias) => alias === 'd' || alias === 'base'), file).toBe(true);
      sites += archived.length;
    }
    expect(sites).toBe(12);
  });

  it('keeps not-ready tables out of a coverage frame that names the policy number', async () => {
    const { corpus, session, expectAllHandlersUsed } = createCorpus([
      ...nonMagiScan(),
      // The graph returns every MA-2252 document for the number, not-ready ones first.
      policyLookupHandler('MA-2252', [...NOT_READY, CURRENT]),
      ...[CURRENT, ...NOT_READY].flatMap((doc) => documentGraphHandlers(doc, { policyLookup: false })),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'What is the MA-2252 income limit for aged, blind and disabled Medicaid?',
    );

    const documentIds = frameDocumentIds(frame);
    expect(documentIds).toContain(CURRENT.id);
    expect(documentIds).not.toContain(NOT_READY[0].id);
    expect(documentIds).not.toContain(NOT_READY[1].id);
    expectAllHandlersUsed();

    // Every search backend that ran carries both conditions, on the same node.
    const ran = searchQueries(session);
    expect(ran.length).toBeGreaterThan(5);
    for (const query of ran) {
      expect(query).toMatch(READY_FILTER);
      expect(query).toMatch(ARCHIVED_FILTER);
      expect(query).not.toContain('amend.retrieval_ready');
    }
  });

  it('does not route an inferred frame onto a not-ready document sharing the policy number', async () => {
    const { corpus } = createCorpus([
      ...nonMagiScan(),
      policyLookupHandler('MA-2252', [...NOT_READY, CURRENT]),
      ...[CURRENT, ...NOT_READY].flatMap((doc) => documentGraphHandlers(doc, { policyLookup: false })),
    ]);

    for (const questionType of ['coverage', 'prior_authorization'] as const) {
      const frame = await resolveTypedFrame(
        corpus,
        questionType,
        'What is the income limit and reserve limit for aged, blind and disabled Medicaid?',
      );
      const documentIds = frameDocumentIds(frame);
      expect(documentIds).toContain(CURRENT.id);
      expect(documentIds).not.toContain(NOT_READY[0].id);
      expect(documentIds).not.toContain(NOT_READY[1].id);
    }
  });

  it('returns a document with no readiness value from search', async () => {
    const { corpus } = createCorpus(nonMagiScan());

    const hits = await corpus.searchSections({
      query: 'income limit for aged, blind and disabled Medicaid',
    });

    expect(hits.map((item) => item.sectionId)).toEqual([CURRENT.sections[0].id]);
  });

  it('filters the base document, never the amending node, in the change-notice queries', async () => {
    const { corpus, session } = createCorpus(nonMagiScan());

    await corpus.searchSections({
      query: 'What changed in the MA-2252 change notice for the income limit implementation?',
    });

    const all = session.run.mock.calls.map(([query]) => String(query));
    const titleExpansion = all.filter((query) => query.includes('IN $titles'));
    expect(titleExpansion.length).toBeGreaterThan(0);
    for (const query of titleExpansion) expect(query).toMatch(READY_FILTER);

    const throughAmends = all.filter((query) => query.includes('(amend)-[:AMENDS]->(base:Document)'));
    expect(throughAmends.length).toBeGreaterThan(0);
    for (const query of throughAmends) {
      expect(query).toContain('coalesce(base.retrieval_ready, true) = true');
      expect(query).not.toContain('amend.retrieval_ready');
    }
  });

  it('keeps archive fee schedules out of a search that asks for fee schedules by type', async () => {
    const primary = feeSchedule('fee-physician-2022', 'primary', '2022-07-01');
    const archive = feeSchedule('fee-physician-2019', 'archive', '2019-01-24');
    const { corpus, session, expectAllHandlersUsed } = createCorpus(
      filteredScan(queries.sectionVector('fee_schedule'), [hit(primary, 0.9)], [hit(archive, 0.95), hit(primary, 0.9)]),
    );

    const hits = await corpus.searchSections({
      query: 'physician services fee schedule rate for 99213',
      documentTypes: ['fee_schedule'],
    });

    expect(hits.map((item) => item.sectionId)).toEqual([primary.sections[0].id]);
    expectAllHandlersUsed();
    const ran = searchQueries(session);
    expect(ran.length).toBeGreaterThan(0);
    for (const query of ran) expect(query).toMatch(READY_FILTER);
  });

  it('still reads a not-ready document by id and by policy number, labelled', async () => {
    const archive = feeSchedule('fee-physician-2019', 'archive', '2019-01-24');
    const { corpus, session } = createCorpus([
      ...documentGraphHandlers(archive, { policyLookup: false }),
      policyLookupHandler('MA-2252', [NOT_READY[0]]),
    ]);

    const document = await corpus.getDocument(archive.id);
    const section = await corpus.getSection(archive.sections[0].id);
    const context = await corpus.getSectionContext(archive.sections[0].id);
    const [looked] = await corpus.lookupPolicy({ policyNumber: 'MA-2252' });

    expect(document).toMatchObject({ id: archive.id, retrievalReady: false, corpusBucket: 'archive' });
    expect(section).toMatchObject({ id: archive.sections[0].id, retrievalReady: false });
    expect(context).not.toBeNull();
    expect(looked).toMatchObject({ id: NOT_READY[0].id, retrievalReady: false, status: 'superseded' });
    for (const [query] of session.run.mock.calls) expect(String(query)).not.toMatch(/retrieval_ready, true\)/);
  });

  it('does not filter the amendment history lookup', async () => {
    const run = vi.fn().mockResolvedValue({ records: [] });
    const withSession = (async (fn: (session: { run: typeof run }) => Promise<unknown>) =>
      fn({ run })) as unknown as SessionExecutor;

    await createAmendmentPrimitiveService({ withSession }).getAmendments('doc-1');

    const ran = run.mock.calls.map(([query]) => String(query));
    expect(ran.some((query) => query.includes('OPTIONAL MATCH (amend)-[r:AMENDS]->(d)'))).toBe(true);
    for (const query of ran) expect(query).not.toMatch(/retrieval_ready, true\)/);
  });
});
