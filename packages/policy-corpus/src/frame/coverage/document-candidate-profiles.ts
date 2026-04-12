import {
  asksForGeneralCriteria,
  isEligibilityCriteriaQuery,
  isModificationReviewQuery,
  isPediatricQuery,
} from '../../internal/shared.js';
import type { CoverageQueryFlags } from './flags.js';
import type {
  CoverageDocumentCandidateProfileSets,
  CoverageDocumentCandidateSignals,
} from './document-candidate-profile-types.js';
export type {
  CoverageDocumentCandidateProfile,
  CoverageDocumentCandidateProfileSets,
  CoverageDocumentCandidateSignals,
} from './document-candidate-profile-types.js';
import { buildCoveragePrimaryProfiles } from './document-candidate-primary.js';
import { buildCoverageSupportingProfiles } from './document-candidate-supporting.js';

export function buildCoverageDocumentCandidateProfiles(
  queryLower: string,
  flags: CoverageQueryFlags,
): CoverageDocumentCandidateProfileSets {
  const signals = buildCoverageDocumentCandidateSignals(queryLower, flags);

  return {
    primaryProfiles: buildCoveragePrimaryProfiles(signals),
    supportingProfiles: buildCoverageSupportingProfiles(signals),
  };
}

function buildCoverageDocumentCandidateSignals(
  queryLower: string,
  flags: CoverageQueryFlags,
): CoverageDocumentCandidateSignals {
  return {
    queryLower,
    flags,
    generalCriteriaRequested: isEligibilityCriteriaQuery(queryLower) || asksForGeneralCriteria(queryLower),
    pediatricRequested: isPediatricQuery(queryLower) || queryLower.includes('epsdt'),
    modificationRequested: isModificationReviewQuery(queryLower),
    notCoveredRequested: flags.notCoveredQuery,
    coverRequested: queryLower.includes('cover'),
  };
}
