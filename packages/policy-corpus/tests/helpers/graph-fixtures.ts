// Shared Neo4j-session fixtures for the policy-corpus test suite.
//
// Three things live here:
//
//   1. Typed record builders (`sectionHit`, `sectionRecord`, `documentRecord`,
//      `amendmentRecord`, ...). Every builder produces a STRICT record:
//      reading a field the fixture never declared throws instead of silently
//      returning undefined. The builders supply explicit nulls for the full
//      record shape each src mapper reads, so a test that wants a sparse
//      value states it as an explicit null rather than relying on permissive
//      fallthrough.
//
//   2. Centralized query matchers (`queries.*`). All coupling to raw Cypher
//      text lives here, expressed as positive markers (no negation chains in
//      individual tests).
//
//   3. Session stubs: `createCorpus` (match-based handlers, with
//      `expectAllHandlersUsed()` to flush dead handlers) and
//      `createCorpusWithRuns` (sequential scripted runs that THROW on
//      unexpected extra queries unless a test opts out).

import { vi } from 'vitest';
import {
  createNeo4jPolicyCorpus,
  type AnswerQuestionType,
  type PolicyCorpus,
} from '../../src/index.js';

export interface MockQueryParams {
  pns?: string[];
  id?: string;
  docTypes?: string[];
  [key: string]: unknown;
}

export interface StubRecord {
  get(key: string): unknown;
}

export function resolveTypedFrame(corpus: PolicyCorpus, questionType: AnswerQuestionType, query: string) {
  return corpus.resolveAnswerFrame({ query, questionType });
}

// ---------------------------------------------------------------------------
// Strict records and builders
// ---------------------------------------------------------------------------

/** A record whose missing-field access fails loudly. */
export function strictRecord(data: Record<string, unknown>): StubRecord {
  return {
    get(key: string) {
      if (!(key in data)) {
        throw new Error(
          `Missing test record field: ${key}. Declare it explicitly (use null for intentionally absent values).`,
        );
      }
      return data[key];
    },
  };
}

/** Document-level enrichment metadata shared by every record shape. */
export interface TierFields {
  authorityTier?: string | null;
  answerRole?: string | null;
  sourceFormat?: string | null;
  answerReady?: boolean | null;
  corpusBucket?: string | null;
  variantGroup?: string | null;
  variantDate?: string | null;
  retrievalReady?: boolean | null;
}

const TIER_DEFAULTS: Required<TierFields> = {
  authorityTier: null,
  answerRole: null,
  sourceFormat: null,
  answerReady: null,
  corpusBucket: null,
  variantGroup: null,
  variantDate: null,
  retrievalReady: null,
};

export interface SectionHitFields extends TierFields {
  sectionId: string;
  score: number;
  sectionNumber?: string | null;
  sectionTitle?: string | null;
  documentTitle?: string | null;
  policyNumber?: string | null;
  documentType?: string | null;
  content?: string | null;
}

/** A retrieval-hit row (search backends; mapped by recordToRetrievalHit). */
export function sectionHit(fields: SectionHitFields): StubRecord {
  return strictRecord({
    sectionNumber: null,
    sectionTitle: null,
    documentTitle: null,
    policyNumber: null,
    documentType: null,
    content: null,
    ...TIER_DEFAULTS,
    ...fields,
  });
}

export interface SectionRecordFields extends TierFields {
  id: string;
  title?: string | null;
  sectionNumber?: string | null;
  content?: string | null;
  lastRevised?: string | null;
  federalRegisterCite?: string | null;
  documentId?: string | null;
  documentTitle?: string | null;
  documentType?: string | null;
  policyNumber?: string | null;
  effectiveDate?: string | null;
  url?: string | null;
  status?: string | null;
}

/** A `getSection` hydration row (mapped by buildSectionView). */
export function sectionRecord(fields: SectionRecordFields): StubRecord {
  return strictRecord({
    title: null,
    sectionNumber: null,
    content: null,
    lastRevised: null,
    federalRegisterCite: null,
    documentId: null,
    documentTitle: null,
    documentType: null,
    policyNumber: null,
    effectiveDate: null,
    url: null,
    status: null,
    ...TIER_DEFAULTS,
    ...fields,
  });
}

export interface DocumentSectionEntry {
  id: string | null;
  number: string | null;
  title: string | null;
  chars?: number | null;
}

export interface DocumentRecordFields extends TierFields {
  id: string;
  title?: string | null;
  documentType?: string | null;
  policyNumber?: string | null;
  effectiveDate?: string | null;
  url?: string | null;
  status?: string | null;
  /** Only declare for queries that RETURN a sections collection. */
  sections?: DocumentSectionEntry[];
}

/** A document-metadata row (mapped by mapDocumentMetadataRecord). */
export function documentRecord(fields: DocumentRecordFields): StubRecord {
  const { sections, ...rest } = fields;
  return strictRecord({
    title: null,
    documentType: null,
    policyNumber: null,
    effectiveDate: null,
    url: null,
    status: null,
    ...TIER_DEFAULTS,
    ...rest,
    ...(sections !== undefined ? { sections } : {}),
  });
}

export interface AmendmentRecordFields extends DocumentRecordFields {
  changeDescription?: string | null;
}

/** A row from the AMENDS lookup (document metadata + change description). */
export function amendmentRecord(fields: AmendmentRecordFields): StubRecord {
  const { sections, changeDescription = null, ...rest } = fields;
  return strictRecord({
    title: null,
    documentType: null,
    policyNumber: null,
    effectiveDate: null,
    url: null,
    status: null,
    ...TIER_DEFAULTS,
    changeDescription,
    ...rest,
    ...(sections !== undefined ? { sections } : {}),
  });
}

export interface ContainerChildrenRecordFields extends TierFields {
  children: Array<{ id: string; title: string | null; sectionNumber: string | null; content: string | null }>;
  documentId?: string | null;
  documentTitle?: string | null;
  documentType?: string | null;
  policyNumber?: string | null;
  effectiveDate?: string | null;
  url?: string | null;
  status?: string | null;
}

/** A `getSection` container-heading child-aggregation row. */
export function containerChildrenRecord(fields: ContainerChildrenRecordFields): StubRecord {
  return strictRecord({
    documentId: null,
    documentTitle: null,
    documentType: null,
    policyNumber: null,
    effectiveDate: null,
    url: null,
    status: null,
    ...TIER_DEFAULTS,
    ...fields,
  });
}

/** A `getSectionContext` ancestor/child/sibling row. */
export function contextEntryRecord(fields: { id: string; title?: string | null; sectionNumber?: string | null }): StubRecord {
  return strictRecord({ title: null, sectionNumber: null, ...fields });
}

export interface ReferenceRecordFields {
  targetId: string;
  targetType: 'Section' | 'Document';
  targetTitle?: string | null;
  targetPolicyNumber?: string | null;
  relationshipType: string;
  referenceText?: string | null;
}

/** A `followReferences` row. */
export function referenceRecord(fields: ReferenceRecordFields): StubRecord {
  return strictRecord({ targetTitle: null, targetPolicyNumber: null, referenceText: null, ...fields });
}

// ---------------------------------------------------------------------------
// Query matchers — every piece of raw-Cypher coupling lives here.
// ---------------------------------------------------------------------------

const normalizeQueryText = (query: string) => query.replace(/\s+/g, ' ');

const docTypesInclude = (params: MockQueryParams, docType: string) =>
  Array.isArray(params.docTypes) && (params.docTypes as string[]).includes(docType);

export type QueryMatcher = (query: string, params: MockQueryParams) => boolean;

export const queries = {
  /** Section-embedding vector scans (section_vector and policy_scoped). */
  sectionVector:
    (docType?: string): QueryMatcher =>
    (query, params) =>
      query.includes("CALL db.index.vector.queryNodes('section_embeddings'") &&
      (docType === undefined || docTypesInclude(params, docType)),

  /** Chunk-embedding vector scans. */
  chunkVector:
    (docType?: string): QueryMatcher =>
    (query, params) =>
      query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'") &&
      (docType === undefined || docTypesInclude(params, docType)),

  /** Lucene fulltext recovery. */
  fulltext: (): QueryMatcher => (query) => query.includes('section_fulltext'),

  /** Concept-graph hits. */
  conceptHits: (): QueryMatcher => (query) => query.includes('MATCH (c:PolicyConcept)'),

  /** Document-keyword fallback (positive marker: its docScore reducer). */
  documentKeyword:
    (docType?: string): QueryMatcher =>
    (query, params) =>
      query.includes('MATCH (d:Document)') &&
      query.includes('docScore') &&
      (docType === undefined || docTypesInclude(params, docType)),

  /** Change-notice revision-header expansion over dominant documents. */
  changeNoticeHeaders: (): QueryMatcher => (query) =>
    query.includes('d.title IN $titles') && query.includes("CONTAINS 'change no'"),

  /** HCWD income/premium change-notice history scan. */
  hcwdAmendmentHistory: (): QueryMatcher => (query) =>
    query.includes("coalesce(d.status, '') = 'amendment'") && query.includes("CONTAINS 'hcwd'"),

  /** lookupPolicy by policy number (candidate list starts with the raw input). */
  policyLookup:
    (policyNumber: string): QueryMatcher =>
    (query, params) =>
      query.includes('any(pn IN $pns WHERE') && Array.isArray(params.pns) && params.pns[0] === policyNumber,

  /** getSection main hydration query. */
  sectionById:
    (id: string): QueryMatcher =>
    (query, params) =>
      normalizeQueryText(query).includes('MATCH (s:Section {id: $id}) OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)') &&
      params.id === id,

  /** getSection container-heading child aggregation. */
  sectionChildrenById:
    (id: string): QueryMatcher =>
    (query, params) =>
      query.includes('MATCH (s:Section {id: $id})-[:PARENT_OF]->(child:Section)') && params.id === id,

  /** getDocument (metadata + sections collection). */
  documentById:
    (id: string): QueryMatcher =>
    (query, params) =>
      normalizeQueryText(query).includes('MATCH (d:Document {id: $id}) OPTIONAL MATCH (d)-[:HAS_SECTION]->(s:Section)') &&
      params.id === id,

  /** getAmendments current-document metadata query (no joins). */
  documentMetadataById:
    (id: string): QueryMatcher =>
    (query, params) =>
      normalizeQueryText(query).includes('MATCH (d:Document {id: $id}) RETURN d.id AS id') && params.id === id,

  /** getAmendments amendment-trail query. */
  amendmentsOf:
    (id: string): QueryMatcher =>
    (query, params) =>
      query.includes('OPTIONAL MATCH (amend:Document)-[r:AMENDS]->(d)') && params.id === id,

  /** getAmendments base-document query. */
  amendmentBaseOf:
    (id: string): QueryMatcher =>
    (query, params) =>
      query.includes('MATCH (d:Document {id: $id})-[:AMENDS]->(base:Document)') && params.id === id,
};

// ---------------------------------------------------------------------------
// Session stubs
// ---------------------------------------------------------------------------

export interface SessionHandler {
  match: QueryMatcher;
  result?: { records: StubRecord[] };
  error?: Error;
  /**
   * Generated convenience handlers (documentGraphHandlers) may legitimately
   * go unused — expectAllHandlersUsed ignores them.
   */
  optional?: boolean;
  /** Diagnostic name surfaced by expectAllHandlersUsed. */
  label?: string;
}

export interface CorpusStub {
  corpus: PolicyCorpus;
  session: { run: ReturnType<typeof vi.fn> };
  embedQuery: ReturnType<typeof vi.fn>;
  /** Fails if any non-optional handler never matched a query — flushes dead handlers. */
  expectAllHandlersUsed: () => void;
}

/**
 * Match-based session stub. Unmatched queries return empty records (most
 * backends are best-effort and tolerate empties); handlers that are never
 * exercised can be flushed via `expectAllHandlersUsed()`.
 */
export function createCorpus(handlers: SessionHandler[]): CorpusStub {
  const used = new Set<SessionHandler>();
  const session = {
    run: vi.fn(async (query: string, params: MockQueryParams = {}) => {
      const handler = handlers.find((candidate) => candidate.match(query, params));
      if (!handler) return { records: [] };
      used.add(handler);
      if (handler.error) throw handler.error;
      return handler.result ?? { records: [] };
    }),
  };

  const embedQuery = vi.fn(async () => [0.1, 0.2, 0.3]);
  const corpus = createNeo4jPolicyCorpus({
    withSession: async (fn) => fn(session),
    embedQuery,
    defaultTopK: 10,
  });

  const expectAllHandlersUsed = () => {
    const dead = handlers
      .map((handler, index) => ({ handler, index }))
      .filter(({ handler }) => !handler.optional && !used.has(handler));
    if (dead.length > 0) {
      throw new Error(
        `Dead session handlers (never matched any query): ${dead
          .map(({ handler, index }) => handler.label ?? `handler #${index}`)
          .join(', ')}`,
      );
    }
  };

  return { corpus, session, embedQuery, expectAllHandlersUsed };
}

export type ScriptedRun = { records: StubRecord[] } | { error: Error };

/**
 * Sequential scripted session stub. Queries consume runs in call order; a
 * query beyond the script THROWS (so a re-ordered or newly added src query
 * fails loudly instead of silently receiving empty records). Tests that
 * intentionally exercise trailing empty results can opt out via
 * `allowExtraQueries`.
 */
export function createCorpusWithRuns(
  runs: ScriptedRun[],
  options: { allowExtraQueries?: boolean } = {},
): { corpus: PolicyCorpus; session: { run: ReturnType<typeof vi.fn> } } {
  let callIndex = 0;
  const session = {
    run: vi.fn(async (query: string) => {
      const run = runs[callIndex];
      callIndex += 1;
      if (!run) {
        if (options.allowExtraQueries) return { records: [] };
        throw new Error(
          `Unexpected session.run call #${callIndex} (only ${runs.length} scripted): ` +
            normalizeQueryText(query).slice(0, 120),
        );
      }
      if ('error' in run) throw run.error;
      return run;
    }),
  };

  const corpus = createNeo4jPolicyCorpus({
    withSession: async (fn) => fn(session),
    embedQuery: vi.fn(async () => [0.1, 0.2, 0.3]),
    defaultTopK: 10,
  });

  return { corpus, session };
}

// ---------------------------------------------------------------------------
// Composite document fixtures
// ---------------------------------------------------------------------------

export interface GraphSection {
  id: string;
  title: string | null;
  number: string | null;
  content: string;
  /** Section size reported in getDocument section listings (defaults to content length). */
  chars?: number;
  /** Title shown in lookupPolicy section listings when it differs from the section title. */
  listTitle?: string | null;
  /** Excludes the section from lookupPolicy listings (still hydratable and listed by getDocument). */
  lookupOmit?: boolean;
}

export interface GraphDocument extends TierFields {
  id: string;
  title: string;
  documentType: string;
  policyNumber: string | null;
  effectiveDate: string | null;
  url: string;
  status?: string;
  sections: GraphSection[];
}

function tierFieldsOf(doc: GraphDocument): Required<TierFields> {
  return {
    authorityTier: doc.authorityTier ?? null,
    answerRole: doc.answerRole ?? null,
    sourceFormat: doc.sourceFormat ?? null,
    answerReady: doc.answerReady ?? null,
    corpusBucket: doc.corpusBucket ?? null,
    variantGroup: doc.variantGroup ?? null,
    variantDate: doc.variantDate ?? null,
    retrievalReady: doc.retrievalReady ?? null,
  };
}

/** lookupPolicy handler returning the given documents for one policy number. */
export function policyLookupHandler(
  policyNumber: string,
  docs: GraphDocument[],
  options: { includeChars?: boolean } = {},
): SessionHandler {
  return {
    label: `policyLookup(${policyNumber})`,
    optional: true,
    match: queries.policyLookup(policyNumber),
    result: {
      records: docs.map((doc) =>
        documentRecord({
          id: doc.id,
          title: doc.title,
          documentType: doc.documentType,
          policyNumber: doc.policyNumber,
          effectiveDate: doc.effectiveDate,
          url: doc.url,
          status: doc.status ?? 'current',
          ...tierFieldsOf(doc),
          sections: doc.sections
            .filter((section) => !section.lookupOmit)
            .map((section) => ({
              id: section.id,
              number: section.number,
              title: section.listTitle !== undefined ? section.listTitle : section.title,
              ...(options.includeChars ? { chars: section.chars ?? section.content.length } : {}),
            })),
        }),
      ),
    },
  };
}

/**
 * Full hydration fixture for one document: lookupPolicy by its policy number
 * (unless disabled), getSection for every section, and getDocument with the
 * section listing (unless disabled). Generated handlers are `optional` (a
 * frame is not required to hydrate every section).
 */
export function documentGraphHandlers(
  doc: GraphDocument,
  options: { policyLookup?: boolean; documentById?: boolean } = {},
): SessionHandler[] {
  const status = doc.status ?? 'current';
  const tier = tierFieldsOf(doc);
  const handlers: SessionHandler[] = [];

  if ((options.policyLookup ?? true) && doc.policyNumber) {
    handlers.push(policyLookupHandler(doc.policyNumber, [doc]));
  }

  for (const section of doc.sections) {
    handlers.push({
      label: `sectionById(${section.id})`,
      optional: true,
      match: queries.sectionById(section.id),
      result: {
        records: [
          sectionRecord({
            id: section.id,
            title: section.title,
            sectionNumber: section.number,
            content: section.content,
            documentId: doc.id,
            documentTitle: doc.title,
            documentType: doc.documentType,
            policyNumber: doc.policyNumber,
            effectiveDate: doc.effectiveDate,
            url: doc.url,
            status,
            ...tier,
          }),
        ],
      },
    });
  }

  if (options.documentById ?? true) {
    handlers.push({
      label: `documentById(${doc.id})`,
      optional: true,
      match: queries.documentById(doc.id),
      result: {
        records: [
          documentRecord({
            id: doc.id,
            title: doc.title,
            documentType: doc.documentType,
            policyNumber: doc.policyNumber,
            effectiveDate: doc.effectiveDate,
            url: doc.url,
            status,
            ...tier,
            sections: doc.sections.map((section) => ({
              id: section.id,
              number: section.number,
              title: section.title,
              chars: section.chars ?? section.content.length,
            })),
          }),
        ],
      },
    });
  }

  return handlers;
}

/** Builds a retrieval hit from a section that already exists on a GraphDocument. */
export function hitFor(
  doc: GraphDocument,
  sectionId: string,
  score: number,
  overrides: Partial<SectionHitFields> = {},
): StubRecord {
  const section = doc.sections.find((candidate) => candidate.id === sectionId);
  if (!section) {
    throw new Error(`hitFor: section ${sectionId} is not declared on document ${doc.id}`);
  }
  return sectionHit({
    sectionId: section.id,
    sectionNumber: section.number,
    sectionTitle: section.title,
    documentTitle: doc.title,
    policyNumber: doc.policyNumber,
    documentType: doc.documentType,
    content: section.content,
    score,
    ...tierFieldsOf(doc),
    ...overrides,
  });
}
