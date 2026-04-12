import {
  COVERAGE_AVOID_TERMS,
  COVERAGE_WORKFLOW_AVOID_TERMS,
  TELEHEALTH_AVOID_TERMS,
} from '../../internal/shared.js';
import type { CoverageDocumentCandidateProfile } from './document-candidate-profile-types.js';

export const COVERAGE_SCOPE_AVOID_TERMS = [...COVERAGE_AVOID_TERMS, ...COVERAGE_WORKFLOW_AVOID_TERMS];
export const TELEHEALTH_COVERAGE_AVOID_TERMS = [...COVERAGE_AVOID_TERMS, ...TELEHEALTH_AVOID_TERMS];
export const HCWD_DOCUMENT_AVOID_TERMS = [...COVERAGE_AVOID_TERMS, 'notice', 'authorization'];

export function makeSectionProfile(
  id: string,
  includeTerms: readonly string[],
  avoidTerms: readonly string[],
  reason: string,
  limit: number,
): CoverageDocumentCandidateProfile {
  return {
    id,
    collector: 'section',
    includeTerms,
    avoidTerms,
    reason,
    limit,
  };
}

export function makeLimitationProfile(
  id: string,
  reason: string,
  limit: number,
): CoverageDocumentCandidateProfile {
  return {
    id,
    collector: 'likely_limitation',
    includeTerms: [],
    avoidTerms: [],
    reason,
    limit,
  };
}
