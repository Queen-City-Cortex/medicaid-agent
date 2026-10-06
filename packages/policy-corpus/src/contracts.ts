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
  ConceptSectionsView,
  DocumentWithSectionsView,
  LookupPolicyInput,
  ReferenceView,
  ResolveAnswerFrameInput,
  SectionContextView,
  GetSectionOptions,
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

// Names accepted in RetrievalProfile.enabledBackends. Most are independent
// merge-max backends registered in retrieval/backend-registry.ts; 'fulltext'
// and 'document_expansion' are stage flags for the collector's
// fulltext-recovery and document-expansion merge stages (see
// retrieval/collector.ts for the full pipeline).
export type RetrievalBackendName =
  | 'section_vector'
  | 'chunk_vector'
  | 'concept'
  | 'section_keyword'
  | 'document_keyword'
  | 'amendment_context'
  | 'policy_scoped'
  | 'fulltext'
  | 'document_expansion';

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

export interface LegalPrimitiveService {
  getSection(sectionId: string, options?: GetSectionOptions): Promise<SectionView | null>;
  getDocument(documentId: string): Promise<DocumentWithSectionsView | null>;
  getSectionContext(sectionId: string): Promise<SectionContextView>;
  followReferences(sectionId: string): Promise<ReferenceView[]>;
  getAmendments(documentId: string): Promise<AmendmentsView>;
  lookupPolicy(input: LookupPolicyInput): Promise<DocumentWithSectionsView[]>;
  findConceptSections(input: { conceptName: string; relationshipType?: string }): Promise<ConceptSectionsView>;
}

export interface SearchService {
  searchSectionsDetailed(input: SearchSectionsInput): Promise<CorpusRetrievalHit[]>;
}

export interface FrameResolver {
  resolveAnswerFrame(input: ResolveAnswerFrameInput): Promise<AnswerFrame>;
}
