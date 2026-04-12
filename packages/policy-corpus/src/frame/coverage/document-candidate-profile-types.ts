import type { CoverageQueryFlags } from './flags.js';

export interface CoverageDocumentCandidateProfile {
  id: string;
  collector: 'section' | 'likely_limitation';
  includeTerms: readonly string[];
  avoidTerms: readonly string[];
  reason: string;
  limit: number;
}

export interface CoverageDocumentCandidateProfileSets {
  primaryProfiles: CoverageDocumentCandidateProfile[];
  supportingProfiles: CoverageDocumentCandidateProfile[];
}

export interface CoverageDocumentCandidateSignals {
  queryLower: string;
  flags: CoverageQueryFlags;
  generalCriteriaRequested: boolean;
  pediatricRequested: boolean;
  modificationRequested: boolean;
  notCoveredRequested: boolean;
  coverRequested: boolean;
}
