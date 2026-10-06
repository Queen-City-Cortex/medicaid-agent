// Documents the agency tagged Archived stay in the graph but out of default
// answers: the retrieval backends skip them, coverage frames do not route on
// them, lookupPolicy lists them last, and an exact required source still
// reaches one.

import { describe, expect, it, vi } from 'vitest';
import type { LegalPrimitiveService } from '../src/contracts.js';
import { createAnswerFrameResolver } from '../src/frame/service.js';
import { createPolicyLookupPrimitiveService } from '../src/primitives/policy-lookup.js';
import { ANSWER_SCOPE_POLICY } from '../src/scope/coverage.js';
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

const ARCHIVED_FILTER = /coalesce\((d|base)\.archived, false\) = false/;

function nonMagiTable(year: number, status: 'current' | 'archived'): GraphDocument {
  return {
    id: `doc-non-magi-${year}`,
    title: `MA-2252 NON-MAGI MEDICAID INCOME/RESERVE LIMITS ${year}`,
    documentType: 'dhhs_policy',
    policyNumber: 'MA-2252',
    effectiveDate: null,
    url: `https://policies.ncdhhs.gov/wp-content/uploads/${year}-NON-MAGI.pdf`,
    status,
    answerReady: true,
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

const CURRENT = nonMagiTable(2026, 'current');
const ARCHIVED = [nonMagiTable(2023, 'archived'), nonMagiTable(2022, 'archived')];
const hit = (doc: GraphDocument, score: number) => hitFor(doc, doc.sections[0].id, score);

// The session stub returns canned rows, so the graph's side of the predicate
// is modelled here: a section-vector scan that carries the archived filter
// sees only the current table, one without it sees every table.
function sectionVectorHandlers(): SessionHandler[] {
  return [
    {
      label: 'section vector with archived filter',
      match: (query, params) =>
        queries.sectionVector('dhhs_policy')(query, params) && ARCHIVED_FILTER.test(query),
      result: { records: [hit(CURRENT, 0.9)] },
    },
    {
      label: 'section vector without archived filter',
      optional: true,
      match: queries.sectionVector('dhhs_policy'),
      result: { records: [hit(ARCHIVED[0], 0.97), hit(ARCHIVED[1], 0.95), hit(CURRENT, 0.9)] },
    },
  ];
}

describe('archived documents', () => {
  it('keeps archived Non-MAGI tables out of a coverage frame', async () => {
    const { corpus, session, expectAllHandlersUsed } = createCorpus([
      ...sectionVectorHandlers(),
      // The graph returns every MA-2252 document for the number, archived last.
      policyLookupHandler('MA-2252', [CURRENT, ...ARCHIVED]),
      ...[CURRENT, ...ARCHIVED].flatMap((doc) => documentGraphHandlers(doc, { policyLookup: false })),
    ]);

    const frame = await resolveTypedFrame(
      corpus,
      'coverage',
      'What is the MA-2252 income limit for aged, blind and disabled Medicaid?',
    );

    const documentIds = [
      ...frame.authoritativeDocuments.map((document) => document.id),
      ...[...frame.primarySections, ...frame.supportingSections].map((section) => section.documentId),
    ];
    expect(documentIds).toContain(CURRENT.id);
    expect(documentIds).not.toContain(ARCHIVED[0].id);
    expect(documentIds).not.toContain(ARCHIVED[1].id);
    expectAllHandlersUsed();

    // Every search backend that ran filters archived documents in the graph.
    const retrievalQueries = session.run.mock.calls
      .map(([query]) => String(query))
      .filter((query) => query.includes('AS sectionId') && query.includes('AS score'))
      .filter((query) => !queries.hcwdAmendmentHistory()(query, {}));
    expect(retrievalQueries.length).toBeGreaterThan(5);
    for (const query of retrievalQueries) expect(query).toMatch(ARCHIVED_FILTER);
  });

  it('filters archived documents in the change-notice expansion queries too', async () => {
    const { corpus, session } = createCorpus(sectionVectorHandlers());

    await corpus.searchSections({
      query: 'What changed in the MA-2252 change notice for the income limit implementation?',
    });

    const expansionQueries = session.run.mock.calls
      .map(([query]) => String(query))
      .filter((query) => query.includes('IN $titles'));
    expect(expansionQueries.length).toBeGreaterThan(0);
    for (const query of expansionQueries) expect(query).toMatch(ARCHIVED_FILTER);
  });

  it('sorts archived documents last in lookupPolicy', async () => {
    const run = vi.fn().mockResolvedValue({ records: [] });
    const withSession = (async (fn: (session: { run: typeof run }) => Promise<unknown>) =>
      fn({ run })) as unknown as SessionExecutor;

    await createPolicyLookupPrimitiveService({ withSession }).lookupPolicy({ policyNumber: 'MA-2252' });

    const [returned, orderBy] = String(run.mock.calls[0][0]).split('ORDER BY');
    // The sort follows an aggregation, so it can only read a returned column:
    // sorting on d.archived directly is a Cypher error on a real graph.
    expect(returned).toContain('coalesce(d.archived, false) AS archived');
    expect(orderBy.trimStart()).toMatch(/^CASE WHEN archived THEN 1 ELSE 0 END,/);
    expect(orderBy).not.toContain('d.archived');
  });

  it('still returns MA-3321-1.pdf for the 2025 MAGI scope question when the agency archived it', async () => {
    const url = ANSWER_SCOPE_POLICY.magi_tables[0].source_url;
    expect(url).toContain('MA-3321-1.pdf');
    const document = {
      id: 'doc-magi-2025',
      url,
      status: 'archived',
      answerReady: true,
      sections: [{ id: 'sec-magi-2025' }],
    };
    const primitives = {
      getDocument: vi.fn().mockResolvedValue(document),
      getSection: vi.fn().mockResolvedValue({ id: 'sec-magi-2025', answerReady: true, status: 'archived' }),
    } as unknown as LegalPrimitiveService;
    const session = { run: vi.fn().mockResolvedValue({ records: [{ get: () => document.id }] }) };
    const withSession: SessionExecutor = (fn) => fn(session);
    const resolver = createAnswerFrameResolver({ primitives, withSession, searchSectionsDetailed: vi.fn() });

    const frame = await resolver.resolveAnswerFrame({ query: 'What MAGI income table applies in June 2025?' });

    expect(session.run).toHaveBeenCalledWith(expect.stringContaining('d.source_url IN $urls'), { urls: [url] });
    expect(frame.coverageScope?.notice).toBeNull();
    expect(frame.authoritativeDocuments.map((item) => item.url)).toEqual([url]);
    expect(frame.primarySections.map((section) => section.id)).toEqual(['sec-magi-2025']);
  });
});
