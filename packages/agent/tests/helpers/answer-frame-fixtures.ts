import type {
  AnswerFrame,
  AnswerFrameDocument,
  AnswerFrameRoute,
  AnswerFrameSection,
} from '@nc-medicaid/policy-corpus';

// Frame fixtures flow through message content as plain JSON, so tests only
// need the fields the processors actually read — hence Partial<> shapes
// derived from the canonical types rather than fully-populated objects.
export type SectionFixture = Partial<AnswerFrameSection>;
export type DocumentFixture = Partial<AnswerFrameDocument>;

export interface LatestRevisionFixture {
  marker: string | null;
  document?: DocumentFixture | null;
  section?: SectionFixture | null;
}

export interface FrameFixture
  extends Omit<
    Partial<AnswerFrame>,
    'authoritativeDocuments' | 'primarySections' | 'supportingSections' | 'avoidSections' | 'latestRevision'
  > {
  authoritativeDocuments?: DocumentFixture[];
  primarySections?: SectionFixture[];
  supportingSections?: SectionFixture[];
  avoidSections?: SectionFixture[];
  latestRevision?: LatestRevisionFixture | null;
}

export function makeRoute(overrides: Partial<AnswerFrameRoute> = {}): AnswerFrameRoute {
  return {
    lane: 'baseline_hybrid',
    rationale: 'single_document_coverage',
    widening_policy: 'one_step',
    determinism_hints: {
      numeric_evidence_only: false,
      latest_revision_only: false,
      cite_scope_and_not_covered: false,
    },
    ...overrides,
  };
}

export function makeSection(overrides: SectionFixture = {}): SectionFixture {
  return {
    id: 'sec-x',
    title: '',
    sectionNumber: null,
    content: '',
    effectiveDate: null,
    documentId: 'doc-x',
    documentTitle: 'Test Document',
    documentType: 'clinical_policy',
    policyNumber: 'TEST',
    reason: 'test',
    ...overrides,
  };
}

/**
 * Bind the shared document fields once (documentId/documentTitle/etc.) and get
 * back a makeSection that only needs the per-section overrides.
 */
export function sectionMaker(docDefaults: SectionFixture) {
  return (overrides: SectionFixture = {}): SectionFixture =>
    makeSection({ ...docDefaults, ...overrides });
}

export function makeDocument(overrides: DocumentFixture = {}): DocumentFixture {
  return {
    id: 'doc-x',
    title: 'Test Document',
    documentType: 'clinical_policy',
    policyNumber: 'TEST',
    effectiveDate: null,
    url: 'https://example.com/doc',
    status: 'current',
    reason: 'test',
    ...overrides,
  };
}

export function makeFrame(overrides: FrameFixture = {}): FrameFixture {
  return {
    questionType: 'coverage',
    route: makeRoute(),
    authoritativeDocuments: [],
    primarySections: [],
    supportingSections: [],
    avoidSections: [],
    latestRevision: null,
    variantReasoning: null,
    ...overrides,
  };
}
