import type {
  AnswerFrame,
  CorpusRetrievalHit,
  DocumentWithSectionsView,
  SessionExecutor,
} from '../types.js';
import type { LegalPrimitiveService, SearchService } from '../contracts.js';
import type { FinalizeFrameInput } from './context/finalize.js';
import { createFrameHydrationHelpers } from './context/hydration.js';
import { createFrameRoutingHelpers } from './context/routing.js';
import { createFrameFinalizer } from './context/finalize.js';
import type {
  DocumentCandidate,
  HydratedSectionCandidate,
  SectionCandidate,
} from '../internal/shared.js';

export type { FinalizeFrameInput } from './context/finalize.js';

export interface FrameContext {
  searchSectionsDetailed: SearchService['searchSectionsDetailed'];
  getSection: LegalPrimitiveService['getSection'];
  getDocument: LegalPrimitiveService['getDocument'];
  getAmendments: LegalPrimitiveService['getAmendments'];
  lookupPolicy: LegalPrimitiveService['lookupPolicy'];
  hydrateSectionCandidates(
    candidates: SectionCandidate[],
    limit: number,
    seenSectionIds?: Set<string>,
  ): Promise<HydratedSectionCandidate[]>;
  collectDocumentsForSections(
    sections: import('../types.js').AnswerFrameSection[],
    defaultReason: string,
  ): Promise<DocumentCandidate[]>;
  collectDocumentsForSectionIds(sectionIds: string[], limit?: number): Promise<DocumentWithSectionsView[]>;
  collectLookupDocuments(query: string): Promise<DocumentWithSectionsView[]>;
  collectImplementationLookupDocuments(query: string): Promise<DocumentWithSectionsView[]>;
  collectHcwdIncomeHistoryHits(): Promise<CorpusRetrievalHit[]>;
  collectPolicyDocumentsFromHits(
    query: string,
    hits: CorpusRetrievalHit[],
    limit?: number,
  ): Promise<DocumentWithSectionsView[]>;
  collectCoverageRoutingDocuments(
    query: string,
    hits: CorpusRetrievalHit[],
  ): Promise<{ documents: DocumentWithSectionsView[]; droppedDocuments: DocumentWithSectionsView[] }>;
  collectDocumentSectionCandidates(
    documents: DocumentWithSectionsView[],
    includeTerms: readonly string[],
    avoidTerms: readonly string[],
    reason: string,
    limit?: number,
  ): Promise<HydratedSectionCandidate[]>;
  collectLikelyCoverageLimitationSectionCandidates(
    documents: DocumentWithSectionsView[],
    reason: string,
    limit?: number,
  ): Promise<HydratedSectionCandidate[]>;
  toSectionCandidates(hydrated: HydratedSectionCandidate[]): SectionCandidate[];
  finalizeFrame(input: FinalizeFrameInput): Promise<AnswerFrame>;
}

export function createFrameContext({
  searchSectionsDetailed,
  primitives,
  withSession,
}: {
  searchSectionsDetailed: SearchService['searchSectionsDetailed'];
  primitives: LegalPrimitiveService;
  withSession: SessionExecutor;
}): FrameContext {
  const { getSection, getDocument, getAmendments, lookupPolicy } = primitives;
  const hydration = createFrameHydrationHelpers({ getSection, getDocument });
  const routing = createFrameRoutingHelpers({ withSession, lookupPolicy });
  const finalizer = createFrameFinalizer({
    hydrateSectionCandidates: hydration.hydrateSectionCandidates,
    collectDocumentsForSections: hydration.collectDocumentsForSections,
  });

  return {
    searchSectionsDetailed,
    getSection,
    getDocument,
    getAmendments,
    lookupPolicy,
    ...hydration,
    ...routing,
    ...finalizer,
  };
}
