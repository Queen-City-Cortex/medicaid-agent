export interface SessionRecordLike {
  get(key: string): unknown;
}

export interface SessionResultLike {
  records: SessionRecordLike[];
}

export interface SessionLike {
  run(query: string, params?: Record<string, unknown>): Promise<SessionResultLike>;
}

export type SessionExecutor = <T>(fn: (session: SessionLike) => Promise<T>) => Promise<T>;
export type EmbedQuery = (query: string) => Promise<number[]>;

export interface DocumentView {
  id: string;
  title: string | null;
  documentType: string | null;
  policyNumber: string | null;
  effectiveDate: string | null;
  sourceModifiedDate?: string | null;
  retrievedAt?: string | null;
  url: string | null;
  citationLink: string | null;
  status: string | null;
  authorityTier: string | null;
  answerRole: string | null;
  sourceFormat: string | null;
  answerReady: boolean | null;
  corpusBucket: string | null;
  variantGroup: string | null;
  variantDate: string | null;
  retrievalReady: boolean | null;
}

export interface DocumentSectionView {
  id: string;
  number: string | null;
  title: string | null;
  chars?: number | null;
}

export interface DocumentWithSectionsView extends DocumentView {
  sections: DocumentSectionView[];
  /** Structured supersession note when this document has been superseded
   *  (SUPERSEDED_BY edge in the graph): what replaced it, when, and why.
   *  Null for current documents. */
  supersession?: DocumentSupersessionView | null;
}

export interface DocumentSupersessionView {
  byPolicyNumber: string | null;
  byTitle: string | null;
  citationLink: string | null;
  effective: string | null;
  reason: string | null;
}

export interface SectionView {
  id: string;
  title: string | null;
  sectionNumber: string | null;
  content: string | null;
  effectiveDate: string | null;
  sourceModifiedDate?: string | null;
  retrievedAt?: string | null;
  // Per-section revision metadata captured from eCFR `<CITA>` tags. Present for
  // CFR sections that have been revised at least once; null for everything else.
  lastRevised: string | null;
  federalRegisterCite: string | null;
  documentId: string | null;
  documentTitle: string | null;
  documentType: string | null;
  policyNumber: string | null;
  url: string | null;
  citationLink: string | null;
  status: string | null;
  authorityTier: string | null;
  answerRole: string | null;
  sourceFormat: string | null;
  answerReady: boolean | null;
  corpusBucket: string | null;
  variantGroup: string | null;
  variantDate: string | null;
  retrievalReady: boolean | null;
}

export interface SearchSectionsInput {
  query: string;
  documentTypes?: string[];
  topK?: number;
}

export interface CorpusRetrievalHit {
  sectionId: string;
  sectionNumber: string | null;
  sectionTitle: string | null;
  documentTitle: string | null;
  documentType: string | null;
  policyNumber: string | null;
  content: string | null;
  score: number;
  authorityTier: string | null;
  answerRole: string | null;
  sourceFormat: string | null;
  answerReady: boolean | null;
  corpusBucket: string | null;
  variantGroup: string | null;
  variantDate: string | null;
  retrievalReady: boolean | null;
}

export const ANSWER_QUESTION_TYPES = [
  'coverage',
  'prior_authorization',
  'amendment',
  'federal_authority',
  'policy_variant',
  'general',
] as const;

export type AnswerQuestionType = (typeof ANSWER_QUESTION_TYPES)[number];

export const ANSWER_ROUTE_LANES = [
  'baseline_hybrid',
  'graph_reasoning',
  'deterministic_evidence',
] as const;

export type AnswerRouteLane = (typeof ANSWER_ROUTE_LANES)[number];

export const ANSWER_ROUTE_WIDENING_POLICIES = [
  'none',
  'one_step',
  'family_expansion',
] as const;

export type AnswerRouteWideningPolicy = (typeof ANSWER_ROUTE_WIDENING_POLICIES)[number];

export interface AnswerFrameDocument extends DocumentView {
  reason: string | null;
}

export interface AnswerFrameSection extends SectionView {
  reason: string | null;
}

export interface LatestRevisionView {
  marker: string | null;
  document: AnswerFrameDocument | null;
  section: AnswerFrameSection | null;
}

export interface AnswerFrameRouteDeterminismHints {
  numeric_evidence_only: boolean;
  latest_revision_only: boolean;
  cite_scope_and_not_covered: boolean;
}

export interface AnswerFrameRoute {
  lane: AnswerRouteLane;
  rationale: string;
  widening_policy: AnswerRouteWideningPolicy;
  determinism_hints: AnswerFrameRouteDeterminismHints;
}

export interface AnswerFrame {
  coverageScope?: import('./scope/coverage.js').CoverageScope;
  questionType: AnswerQuestionType;
  route: AnswerFrameRoute;
  authoritativeDocuments: AnswerFrameDocument[];
  primarySections: AnswerFrameSection[];
  supportingSections: AnswerFrameSection[];
  avoidSections: AnswerFrameSection[];
  latestRevision: LatestRevisionView | null;
  variantReasoning: string | null;
}

export interface ResolveAnswerFrameInput {
  query: string;
  questionType?: AnswerQuestionType;
}

export interface SearchHit {
  sectionId: string;
  title: string | null;
  policyNumber: string | null;
  documentType: string | null;
  contentSnippet: string | null;
  score: number;
}

export interface SectionContextEntry {
  id: string;
  title: string | null;
  sectionNumber: string | null;
}

export interface SectionContextView {
  ancestors: SectionContextEntry[];
  siblings: SectionContextEntry[];
  children: SectionContextEntry[];
}

export interface ReferenceView {
  targetId: string;
  targetType: 'Section' | 'Document';
  targetTitle: string | null;
  targetPolicyNumber: string | null;
  relationshipType: string;
  referenceText: string | null;
}

export interface AmendmentDocumentView extends DocumentView {
  changeSummary: string | null;
}

export interface AmendmentsView {
  amendments: AmendmentDocumentView[];
  baseDocument: DocumentView | null;
  authoritativeDocument: DocumentView | null;
}

export interface LookupPolicyInput {
  policyNumber: string;
}

export interface ConceptSectionView {
  sectionId: string;
  sectionTitle: string | null;
  sectionNumber: string | null;
  documentId: string | null;
  documentType: string | null;
  policyNumber: string | null;
  relationshipType: string;
}

export const ALLOWED_CONCEPT_RELATIONSHIPS = [
  'COVERS',
  'DEFINES',
  'RESTRICTS',
  'GOVERNS',
  'REFERENCES_CONCEPT',
] as const;

export type ConceptRelationshipType = (typeof ALLOWED_CONCEPT_RELATIONSHIPS)[number];

export interface FindConceptSectionsInput {
  conceptName: string;
  relationshipType?: string;
}

export interface PolicyCorpus {
  searchSections(input: SearchSectionsInput): Promise<SearchHit[]>;
  searchSectionsDetailed(input: SearchSectionsInput): Promise<CorpusRetrievalHit[]>;
  resolveAnswerFrame(input: ResolveAnswerFrameInput): Promise<AnswerFrame>;
  getSection(sectionId: string): Promise<SectionView | null>;
  getDocument(documentId: string): Promise<DocumentWithSectionsView | null>;
  getSectionContext(sectionId: string): Promise<SectionContextView>;
  followReferences(sectionId: string): Promise<ReferenceView[]>;
  getAmendments(documentId: string): Promise<AmendmentsView>;
  lookupPolicy(input: LookupPolicyInput): Promise<DocumentWithSectionsView[]>;
  findConceptSections(input: FindConceptSectionsInput): Promise<ConceptSectionView[]>;
}

export interface PolicyCorpusDependencies {
  withSession: SessionExecutor;
  embedQuery: EmbedQuery;
  defaultTopK?: number;
}
