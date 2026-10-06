import type { SectionRoles } from './jev/section-roles.js';
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
  sectionRoles?: SectionRoles;
  id: string;
  title: string | null;
  sectionNumber: string | null;
  /** One window of the section's text, never the whole of a long section. */
  content: string | null;
  /** Where `content` starts in the section's text. Offsets and lengths count
   *  Unicode characters, as Neo4j and the loader do, not UTF-16 units. */
  contentOffset: number;
  totalChars: number;
  /** Offset of the next window; null when `content` reaches the end. */
  nextOffset: number | null;
  /** The range shown and how to continue; null when `content` is the whole text. */
  contentNote: string | null;
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

export interface GetSectionOptions {
  /** Characters to skip before the returned window (default 0). */
  offset?: number;
  /** Window size, capped at SECTION_WINDOW_MAX_CHARS (default SECTION_WINDOW_CHARS). */
  length?: number;
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

// `siblings` and `children` are bounded windows; the counts are the family
// totals, so a caller can tell a short list from a truncated one.
export interface SectionContextView {
  ancestors: SectionContextEntry[];
  siblings: SectionContextEntry[];
  siblingCount: number;
  siblingsTruncated: boolean;
  children: SectionContextEntry[];
  childCount: number;
  childrenTruncated: boolean;
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
  /** Year and sequence of a DHHS change notice's number ("04-26" is 2026, 4).
   *  The notice carries no date, so these order it within one manual's
   *  series. Null for every other amending document. */
  changeYear: number | null;
  changeSequence: number | null;
}

export interface AmendmentsView {
  /** The document that was asked about. It is the current text; nothing in
   *  `amendments` replaces it. Null when the id is unknown. */
  document: DocumentView | null;
  /** Every document the queried one amends, by policy number then id. */
  amends: DocumentView[];
  /** History of the queried document, newest first. */
  amendments: AmendmentDocumentView[];
  /** `amendments[0]`: what changed most recently, not the current text. */
  latestAmendment: AmendmentDocumentView | null;
  /** True when the history holds more than the returned amendments. */
  truncated: boolean;
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

export interface ConceptSectionsView {
  sections: ConceptSectionView[];
  total: number;
  truncated: boolean;
}

// The relationship types the pipeline writes (ConceptRelationshipType in
// corpus_types.py). Advertising any other type returns an empty list that
// reads as a real negative.
export const ALLOWED_CONCEPT_RELATIONSHIPS = ['COVERS', 'DEFINES', 'RESTRICTS'] as const;

export type ConceptRelationshipType = (typeof ALLOWED_CONCEPT_RELATIONSHIPS)[number];

export interface FindConceptSectionsInput {
  conceptName: string;
  relationshipType?: string;
}

export interface PolicyCorpus {
  searchSections(input: SearchSectionsInput): Promise<SearchHit[]>;
  searchSectionsDetailed(input: SearchSectionsInput): Promise<CorpusRetrievalHit[]>;
  resolveAnswerFrame(input: ResolveAnswerFrameInput): Promise<AnswerFrame>;
  getSection(sectionId: string, options?: GetSectionOptions): Promise<SectionView | null>;
  getDocument(documentId: string): Promise<DocumentWithSectionsView | null>;
  getSectionContext(sectionId: string): Promise<SectionContextView>;
  followReferences(sectionId: string): Promise<ReferenceView[]>;
  getAmendments(documentId: string): Promise<AmendmentsView>;
  lookupPolicy(input: LookupPolicyInput): Promise<DocumentWithSectionsView[]>;
  findConceptSections(input: FindConceptSectionsInput): Promise<ConceptSectionsView>;
}

export interface PolicyCorpusDependencies {
  withSession: SessionExecutor;
  embedQuery: EmbedQuery;
  defaultTopK?: number;
}
