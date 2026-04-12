import {
  CERTIFICATION_SECTION_TERMS,
  CONGREGATE_PCS_COVERED_SERVICE_SECTION_TERMS,
  CONGREGATE_PCS_NOT_COVERED_SECTION_TERMS,
  CONGREGATE_PCS_SUPPORT_SECTION_TERMS,
  COVERAGE_AVOID_TERMS,
  COVERAGE_SCOPE_SECTION_TERMS,
  ELIGIBILITY_SCOPE_SECTION_TERMS,
  FRAME_SUPPORT_LIMIT,
  HCWD_PRIMARY_SECTION_TERMS,
  MODIFICATION_SECTION_TERMS,
  NOT_COVERED_SECTION_TERMS,
  PEDIATRIC_COVERAGE_SECTION_TERMS,
  TELEHEALTH_SUPPORT_SECTION_TERMS,
  YES_NO_COVERAGE_SECTION_TERMS,
} from '../../internal/shared.js';
import {
  COVERAGE_SCOPE_AVOID_TERMS,
  HCWD_DOCUMENT_AVOID_TERMS,
  TELEHEALTH_COVERAGE_AVOID_TERMS,
  makeLimitationProfile,
  makeSectionProfile,
} from './document-candidate-profile-helpers.js';
import type { CoverageDocumentCandidateProfile, CoverageDocumentCandidateSignals } from './document-candidate-profile-types.js';

export function buildCoverageSupportingProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  return [
    ...buildNotCoveredSupportingProfiles(signals),
    ...buildEligibilitySupportingProfiles(signals),
    ...buildYesNoCoverageSupportingProfiles(signals),
    ...buildPediatricSupportingProfiles(signals),
    ...buildModificationSupportingProfiles(signals),
    ...buildTelehealthSupportingProfiles(signals),
    ...buildCertificationSupportingProfiles(signals),
    ...buildHcwdSupportingProfiles(signals),
    ...buildLimitationSupportingProfiles(signals),
    ...buildCongregateSupportingProfiles(signals),
  ];
}

function buildNotCoveredSupportingProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.notCoveredRequested) return [];
  return [
    makeSectionProfile(
      'not-covered-supporting',
      NOT_COVERED_SECTION_TERMS,
      [],
      'Not-covered section from the preferred document.',
      FRAME_SUPPORT_LIMIT,
    ),
  ];
}

function buildEligibilitySupportingProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.flags.eligibilityFrameworkQuery) return [];
  return [
    makeSectionProfile(
      'eligibility-scope-supporting',
      ELIGIBILITY_SCOPE_SECTION_TERMS,
      COVERAGE_AVOID_TERMS,
      'Program scope or description section from the preferred document.',
      FRAME_SUPPORT_LIMIT,
    ),
  ];
}

function buildYesNoCoverageSupportingProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.flags.yesNoCoverageQuery) return [];
  return [
    makeSectionProfile(
      'coverage-scope-supporting',
      COVERAGE_SCOPE_SECTION_TERMS,
      COVERAGE_SCOPE_AVOID_TERMS,
      'Additional scope or description section for the yes/no coverage question.',
      FRAME_SUPPORT_LIMIT,
    ),
    makeSectionProfile(
      'yes-no-coverage-supporting',
      YES_NO_COVERAGE_SECTION_TERMS,
      COVERAGE_SCOPE_AVOID_TERMS,
      'Additional scope or not-covered section for the yes/no coverage question.',
      FRAME_SUPPORT_LIMIT,
    ),
  ];
}

function buildPediatricSupportingProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.pediatricRequested) return [];
  return [
    makeSectionProfile(
      'pediatric-supporting',
      PEDIATRIC_COVERAGE_SECTION_TERMS,
      COVERAGE_AVOID_TERMS,
      'Additional EPSDT or pediatric service section from the preferred document.',
      FRAME_SUPPORT_LIMIT,
    ),
  ];
}

function buildModificationSupportingProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.modificationRequested) return [];
  return [
    makeSectionProfile(
      'modification-supporting',
      MODIFICATION_SECTION_TERMS,
      COVERAGE_AVOID_TERMS,
      'Additional coverage or documentation section for the requested modification service.',
      FRAME_SUPPORT_LIMIT,
    ),
  ];
}

function buildTelehealthSupportingProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.flags.telehealthQuery) return [];
  return [
    makeSectionProfile(
      'telehealth-supporting',
      TELEHEALTH_SUPPORT_SECTION_TERMS,
      TELEHEALTH_COVERAGE_AVOID_TERMS,
      'Service-specific telehealth section from the preferred document.',
      FRAME_SUPPORT_LIMIT,
    ),
  ];
}

function buildCertificationSupportingProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.flags.certificationQuery) return [];
  return [
    makeSectionProfile(
      'certification-supporting',
      CERTIFICATION_SECTION_TERMS,
      COVERAGE_AVOID_TERMS,
      'Additional certification or recertification section from the preferred document.',
      FRAME_SUPPORT_LIMIT,
    ),
  ];
}

function buildHcwdSupportingProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.flags.hcwdIncomePremiumQuery) return [];
  return [
    makeSectionProfile(
      'hcwd-supporting',
      HCWD_PRIMARY_SECTION_TERMS,
      HCWD_DOCUMENT_AVOID_TERMS,
      'Additional income, fee, or premium section from the preferred HCWD document.',
      FRAME_SUPPORT_LIMIT,
    ),
  ];
}

function buildLimitationSupportingProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.flags.yesNoCoverageQuery && !signals.notCoveredRequested) return [];
  return [
    makeLimitationProfile(
      'likely-limitation-supporting',
      'Likely limitation or non-covered subsection from the preferred document.',
      FRAME_SUPPORT_LIMIT,
    ),
  ];
}

function buildCongregateSupportingProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.flags.congregatePcsQuery) return [];
  return [
    makeSectionProfile(
      'congregate-service-supporting',
      CONGREGATE_PCS_COVERED_SERVICE_SECTION_TERMS,
      COVERAGE_SCOPE_AVOID_TERMS,
      'Additional congregate PCS covered-service section from the preferred document.',
      FRAME_SUPPORT_LIMIT,
    ),
    makeSectionProfile(
      'congregate-not-covered-supporting',
      CONGREGATE_PCS_NOT_COVERED_SECTION_TERMS,
      COVERAGE_SCOPE_AVOID_TERMS,
      'Room-and-board or specific non-covered congregate PCS section from the preferred document.',
      FRAME_SUPPORT_LIMIT,
    ),
    makeSectionProfile(
      'congregate-support-supporting',
      CONGREGATE_PCS_SUPPORT_SECTION_TERMS,
      COVERAGE_SCOPE_AVOID_TERMS,
      'Additional congregate PCS covered-service or non-covered section from the preferred document.',
      FRAME_SUPPORT_LIMIT,
    ),
  ];
}
