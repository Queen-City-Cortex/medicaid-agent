import type { CorpusRetrievalHit, DocumentWithSectionsView } from '../../types.js';
import type { DocumentCandidate, SectionCandidate } from '../../internal/shared.js';

export interface FederalAuthoritySignals {
  queryLower: string;
  waiverApplicationQuery: boolean;
  publicNoticeQuery: boolean;
  mlrQuery: boolean;
  implementationQuery: boolean;
  focusTerms: string[];
  quotedPhrases: string[];
  implementationSectionTerms: string[];
  focusedFederalQuery: string | null;
}

export interface FederalAuthorityEvidence {
  waiverRankedFederalHits: CorpusRetrievalHit[];
  filteredPrimaryFederalHits: CorpusRetrievalHit[];
  primaryFederalDocuments: DocumentWithSectionsView[];
  primaryCandidates: SectionCandidate[];
  authoritativeCandidates: DocumentCandidate[];
}

export interface FederalImplementationEvidence {
  scopedImplementationHits: CorpusRetrievalHit[];
  implementationDocuments: DocumentWithSectionsView[];
}
