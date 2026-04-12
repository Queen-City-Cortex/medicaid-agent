import type {
  AnswerFrame,
  AnswerQuestionType,
  AnswerRouteLane,
  AnswerRouteWideningPolicy,
  AnswerFrameRoute,
  CorpusRetrievalHit,
  SearchSectionsInput,
  SessionLike,
  AmendmentsView,
  ConceptSectionView,
  DocumentWithSectionsView,
  LookupPolicyInput,
  ReferenceView,
  ResolveAnswerFrameInput,
  SectionContextView,
  SectionView,
} from './types.js';

export interface QueryFlags {
  asksForCertificationDetails: boolean;
  asksForGeneralCriteria: boolean;
  asksForHistory: boolean;
  asksForImplementation: boolean;
  asksForNotCoveredDetails: boolean;
  asksForPriorAuthSubmissionProcess: boolean;
  asksForPublicNoticeDetails: boolean;
  asksForTelehealthServiceList: boolean;
  isBillingWorkflowQuery: boolean;
  isChangeNoticeQuery: boolean;
  isClinicalCriteriaLifecycleQuery: boolean;
  isCongregatePcsQuery: boolean;
  isCoverageQuestion: boolean;
  isEligibilityCriteriaQuery: boolean;
  isFederalAuthorityQuery: boolean;
  isHcwdIncomePremiumQuery: boolean;
  isHistoricalReimbursementQuery: boolean;
  isLatestChangeNoticeQuery: boolean;
  isManagedCareContractQuery: boolean;
  isManagedCareOperationsQuery: boolean;
  isMlrQuery: boolean;
  isOperationalRoutingQuery: boolean;
  isPediatricQuery: boolean;
  isPolicyVariantQuery: boolean;
  isPriorAuthorizationQuery: boolean;
  isReimbursementQuery: boolean;
  isTelehealthQuery: boolean;
  isWaiverApplicationQuery: boolean;
  isYesNoCoverageQuery: boolean;
}

export interface QueryAnalysis {
  query: string;
  normalizedQuery: string;
  questionType: AnswerQuestionType;
  route: AnswerFrameRoute;
  searchTerms: string[];
  focusTerms: string[];
  serviceFocusTerms: string[];
  procedureCodes: string[];
  explicitPolicyNumbers: string[];
  aliasedPolicyNumbers: string[];
  quotedPhrases: string[];
  requestedYears: string[];
  focusedFederalQuery: string | null;
  flags: QueryFlags;
}

export type RetrievalBackendName =
  | 'section_vector'
  | 'chunk_vector'
  | 'concept'
  | 'section_keyword'
  | 'document_keyword'
  | 'amendment_context'
  | 'policy_scoped'
  | 'fulltext'
  | 'document_expansion'
  | 'change_notice_header';

export interface RetrievalProfile {
  name: string;
  lane: AnswerRouteLane;
  wideningPolicy: AnswerRouteWideningPolicy;
  hasExplicitDocumentTypes: boolean;
  typeGroups: string[][];
  perGroupK: number;
  enabledBackends: RetrievalBackendName[];
}

export interface RetrievalBackendArgs {
  session: SessionLike;
  input: SearchSectionsInput;
  analysis: QueryAnalysis;
  profile: RetrievalProfile;
  embedding: number[];
}

export interface RetrievalBackend {
  name: RetrievalBackendName;
  retrieve(args: RetrievalBackendArgs): Promise<CorpusRetrievalHit[]>;
}

export interface CorpusRerankerArgs {
  query: string;
  analysis: QueryAnalysis;
  profile: RetrievalProfile;
  topK: number;
  candidates: CorpusRetrievalHit[];
}

export interface CorpusRerankerResult {
  sectionIds: string[];
  reason?: string | null;
}

export type CorpusReranker = (args: CorpusRerankerArgs) => Promise<CorpusRerankerResult | null>;

export interface LegalPrimitiveService {
  getSection(sectionId: string): Promise<SectionView | null>;
  getDocument(documentId: string): Promise<DocumentWithSectionsView | null>;
  getSectionContext(sectionId: string): Promise<SectionContextView>;
  followReferences(sectionId: string): Promise<ReferenceView[]>;
  getAmendments(documentId: string): Promise<AmendmentsView>;
  lookupPolicy(input: LookupPolicyInput): Promise<DocumentWithSectionsView[]>;
  findConceptSections(input: { conceptName: string; relationshipType?: string }): Promise<ConceptSectionView[]>;
}

export interface SearchService {
  searchSectionsDetailed(input: SearchSectionsInput): Promise<CorpusRetrievalHit[]>;
}

export interface FrameResolver {
  resolveAnswerFrame(input: ResolveAnswerFrameInput): Promise<AnswerFrame>;
  resolveCoverageFrame(query: string): Promise<AnswerFrame>;
  resolvePriorAuthFrame(query: string): Promise<AnswerFrame>;
  resolveAmendmentFrame(query: string): Promise<AnswerFrame>;
  resolveFederalAuthorityFrame(query: string): Promise<AnswerFrame>;
  resolvePolicyVariantFrame(query: string): Promise<AnswerFrame>;
}
