import {
  CERTIFICATION_SECTION_TERMS,
  CONGREGATE_PCS_CRITERIA_SECTION_TERMS,
  CONGREGATE_PCS_COVERED_SERVICE_SECTION_TERMS,
  CONGREGATE_PCS_SUPPORT_SECTION_TERMS,
  COVERAGE_AVOID_TERMS,
  COVERAGE_DETAIL_SECTION_TERMS,
  COVERAGE_SCOPE_SECTION_TERMS,
  ELIGIBILITY_BASELINE_SECTION_TERMS,
  FRAME_PRIMARY_LIMIT,
  GENERAL_CRITERIA_SECTION_TERMS,
  HCWD_PRIMARY_SECTION_TERMS,
  MODIFICATION_SECTION_TERMS,
  NOT_COVERED_SECTION_TERMS,
  PEDIATRIC_COVERAGE_SECTION_TERMS,
  TELEHEALTH_PRIMARY_SECTION_TERMS,
  YES_NO_COVERAGE_SECTION_TERMS,
} from '../../internal/shared.js';
import {
  COVERAGE_SCOPE_AVOID_TERMS,
  HCWD_DOCUMENT_AVOID_TERMS,
  TELEHEALTH_COVERAGE_AVOID_TERMS,
  makeSectionProfile,
} from './document-candidate-profile-helpers.js';
import type { CoverageDocumentCandidateProfile, CoverageDocumentCandidateSignals } from './document-candidate-profile-types.js';

export function buildCoveragePrimaryProfiles(signals: CoverageDocumentCandidateSignals): CoverageDocumentCandidateProfile[] {
  return [
    ...buildEligibilityPrimaryProfiles(signals),
    ...buildYesNoCoveragePrimaryProfiles(signals),
    ...buildPediatricPrimaryProfiles(signals),
    ...buildModificationPrimaryProfiles(signals),
    ...buildTelehealthPrimaryProfiles(signals),
    ...buildCertificationPrimaryProfiles(signals),
    ...buildHcwdPrimaryProfiles(signals),
    ...buildCoverageDetailPrimaryProfiles(signals),
    ...buildCongregatePrimaryProfiles(signals),
  ];
}

function buildEligibilityPrimaryProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.generalCriteriaRequested) return [];
  return [
    makeSectionProfile(
      'eligibility-baseline-primary',
      ELIGIBILITY_BASELINE_SECTION_TERMS,
      COVERAGE_AVOID_TERMS,
      'Baseline Medicaid-program eligibility section from the preferred document.',
      FRAME_PRIMARY_LIMIT,
    ),
    makeSectionProfile(
      'eligibility-general-primary',
      GENERAL_CRITERIA_SECTION_TERMS,
      NOT_COVERED_SECTION_TERMS,
      'General eligibility or coverage section from the preferred document.',
      FRAME_PRIMARY_LIMIT,
    ),
  ];
}

function buildYesNoCoveragePrimaryProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.flags.yesNoCoverageQuery) return [];
  return [
    makeSectionProfile(
      'coverage-scope-primary',
      COVERAGE_SCOPE_SECTION_TERMS,
      COVERAGE_SCOPE_AVOID_TERMS,
      'Scope or description section for the yes/no coverage question.',
      FRAME_PRIMARY_LIMIT,
    ),
    makeSectionProfile(
      'yes-no-coverage-primary',
      YES_NO_COVERAGE_SECTION_TERMS,
      COVERAGE_SCOPE_AVOID_TERMS,
      'Scope or not-covered section for the yes/no coverage question.',
      FRAME_PRIMARY_LIMIT,
    ),
  ];
}

function buildPediatricPrimaryProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.pediatricRequested) return [];
  return [
    makeSectionProfile(
      'pediatric-primary',
      PEDIATRIC_COVERAGE_SECTION_TERMS,
      COVERAGE_AVOID_TERMS,
      'EPSDT or pediatric service section from the preferred document.',
      FRAME_PRIMARY_LIMIT,
    ),
  ];
}

function buildModificationPrimaryProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.modificationRequested) return [];
  return [
    makeSectionProfile(
      'modification-primary',
      MODIFICATION_SECTION_TERMS,
      COVERAGE_AVOID_TERMS,
      'Coverage or documentation section for the requested modification service.',
      FRAME_PRIMARY_LIMIT,
    ),
  ];
}

function buildTelehealthPrimaryProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.flags.telehealthQuery) return [];
  return [
    makeSectionProfile(
      'telehealth-primary',
      TELEHEALTH_PRIMARY_SECTION_TERMS,
      TELEHEALTH_COVERAGE_AVOID_TERMS,
      'Telehealth coverage section from the preferred document.',
      FRAME_PRIMARY_LIMIT,
    ),
  ];
}

function buildCertificationPrimaryProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.flags.certificationQuery) return [];
  return [
    makeSectionProfile(
      'certification-primary',
      CERTIFICATION_SECTION_TERMS,
      COVERAGE_AVOID_TERMS,
      'Certification or recertification section from the preferred document.',
      FRAME_PRIMARY_LIMIT,
    ),
  ];
}

function buildHcwdPrimaryProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.flags.hcwdIncomePremiumQuery) return [];
  return [
    makeSectionProfile(
      'hcwd-primary',
      HCWD_PRIMARY_SECTION_TERMS,
      HCWD_DOCUMENT_AVOID_TERMS,
      'Income, fee, or premium section from the preferred HCWD document.',
      FRAME_PRIMARY_LIMIT,
    ),
  ];
}

function buildCoverageDetailPrimaryProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.coverRequested) return [];
  return [
    makeSectionProfile(
      'coverage-detail-primary',
      COVERAGE_DETAIL_SECTION_TERMS,
      NOT_COVERED_SECTION_TERMS,
      'Direct coverage-detail section from the preferred document.',
      FRAME_PRIMARY_LIMIT,
    ),
  ];
}

function buildCongregatePrimaryProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  if (!signals.flags.congregatePcsQuery) return [];
  return [
    makeSectionProfile(
      'congregate-criteria-primary',
      CONGREGATE_PCS_CRITERIA_SECTION_TERMS,
      COVERAGE_SCOPE_AVOID_TERMS,
      'Congregate PCS beneficiary and facility criteria section from the preferred document.',
      FRAME_PRIMARY_LIMIT,
    ),
    makeSectionProfile(
      'congregate-service-primary',
      CONGREGATE_PCS_COVERED_SERVICE_SECTION_TERMS,
      COVERAGE_SCOPE_AVOID_TERMS,
      'Congregate PCS covered-service section from the preferred document.',
      FRAME_PRIMARY_LIMIT,
    ),
    makeSectionProfile(
      'congregate-support-primary',
      CONGREGATE_PCS_SUPPORT_SECTION_TERMS,
      COVERAGE_SCOPE_AVOID_TERMS,
      'Congregate PCS covered-service or non-covered section from the preferred document.',
      FRAME_PRIMARY_LIMIT,
    ),
  ];
}
