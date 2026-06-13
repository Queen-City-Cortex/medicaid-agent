// Coverage candidate collection: derives query flags from the normalized
// question, expands them into document-candidate profiles (which titled or
// likely-limitation sections to pull from the preferred policy documents),
// and runs those profiles against the frame context.
//
// Public surface (consumed by frame/pipelines/coverage.ts and the rebalance
// module in ./selection.ts):
//   - buildCoverageQueryFlags / CoverageQueryFlags
//   - collectCoverageDocumentHydratedCandidates
//   - buildCoverageDocumentCandidateProfiles (exposed for tests)
// Everything else (profile builders, signals, avoid-term combinations) is an
// implementation detail of this module.

import type { FrameContext } from '../context.js';
import type { DocumentWithSectionsView } from '../../types.js';
import {
  EPSDT_EXCEPTION_SECTION_TERMS,
  CERTIFICATION_SECTION_TERMS,
  CONGREGATE_PCS_CRITERIA_SECTION_TERMS,
  CONGREGATE_PCS_COVERED_SERVICE_SECTION_TERMS,
  CONGREGATE_PCS_NOT_COVERED_SECTION_TERMS,
  CONGREGATE_PCS_SUPPORT_SECTION_TERMS,
  COVERAGE_AVOID_TERMS,
  COVERAGE_DETAIL_SECTION_TERMS,
  COVERAGE_SCOPE_SECTION_TERMS,
  COVERAGE_WORKFLOW_AVOID_TERMS,
  ELIGIBILITY_BASELINE_SECTION_TERMS,
  ELIGIBILITY_SCOPE_SECTION_TERMS,
  FRAME_PRIMARY_LIMIT,
  FRAME_SUPPORT_LIMIT,
  GENERAL_CRITERIA_SECTION_TERMS,
  HCWD_PRIMARY_SECTION_TERMS,
  MODIFICATION_SECTION_TERMS,
  NOT_COVERED_SECTION_TERMS,
  PEDIATRIC_COVERAGE_SECTION_TERMS,
  TELEHEALTH_AVOID_TERMS,
  TELEHEALTH_PRIMARY_SECTION_TERMS,
  TELEHEALTH_SUPPORT_SECTION_TERMS,
  YES_NO_COVERAGE_SECTION_TERMS,
  asksForCertificationDetails,
  asksForEarnedIncomeLimit,
  asksForGeneralCriteria,
  asksForNotCoveredDetails,
  asksForTelehealthServiceList,
  isAmbulanceNotCoveredQuery,
  isCongregatePcsQuery,
  isEligibilityCriteriaQuery,
  isHcwdIncomePremiumQuery,
  isModificationReviewQuery,
  isPediatricQuery,
  isTelehealthQuery,
  isYesNoCoverageQuery,
  uniqueBy,
  type HydratedSectionCandidate,
} from '../../internal/shared.js';

// --- Query flags -----------------------------------------------------------

export interface CoverageQueryFlags {
  generalCriteriaQuery: boolean;
  eligibilityFrameworkQuery: boolean;
  notCoveredQuery: boolean;
  certificationQuery: boolean;
  telehealthQuery: boolean;
  telehealthServiceListQuery: boolean;
  ambulanceNotCoveredQuery: boolean;
  congregatePcsQuery: boolean;
  yesNoCoverageQuery: boolean;
  hcwdIncomePremiumQuery: boolean;
  earnedIncomeLimitQuery: boolean;
  telehealthAvoidTerms: string[];
}

export function buildCoverageQueryFlags(queryLower: string): CoverageQueryFlags {
  return {
    generalCriteriaQuery: isEligibilityCriteriaQuery(queryLower) || asksForGeneralCriteria(queryLower),
    eligibilityFrameworkQuery: isEligibilityCriteriaQuery(queryLower),
    notCoveredQuery: asksForNotCoveredDetails(queryLower),
    certificationQuery: asksForCertificationDetails(queryLower),
    telehealthQuery: isTelehealthQuery(queryLower),
    telehealthServiceListQuery: asksForTelehealthServiceList(queryLower),
    ambulanceNotCoveredQuery: isAmbulanceNotCoveredQuery(queryLower),
    congregatePcsQuery: isCongregatePcsQuery(queryLower),
    yesNoCoverageQuery: isYesNoCoverageQuery(queryLower),
    hcwdIncomePremiumQuery: isHcwdIncomePremiumQuery(queryLower),
    earnedIncomeLimitQuery: asksForEarnedIncomeLimit(queryLower),
    telehealthAvoidTerms: [...TELEHEALTH_AVOID_TERMS, ...COVERAGE_AVOID_TERMS],
  };
}

// --- Profile model ---------------------------------------------------------

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

interface CoverageDocumentCandidateSignals {
  queryLower: string;
  flags: CoverageQueryFlags;
  generalCriteriaRequested: boolean;
  pediatricRequested: boolean;
  modificationRequested: boolean;
  notCoveredRequested: boolean;
  coverRequested: boolean;
}

const COVERAGE_SCOPE_AVOID_TERMS = [...COVERAGE_AVOID_TERMS, ...COVERAGE_WORKFLOW_AVOID_TERMS];
const TELEHEALTH_COVERAGE_AVOID_TERMS = [...COVERAGE_AVOID_TERMS, ...TELEHEALTH_AVOID_TERMS];
const HCWD_DOCUMENT_AVOID_TERMS = [...COVERAGE_AVOID_TERMS, 'notice', 'authorization'];

function makeSectionProfile(
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

function makeLimitationProfile(
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

// --- Primary profiles ------------------------------------------------------

function buildCoveragePrimaryProfiles(signals: CoverageDocumentCandidateSignals): CoverageDocumentCandidateProfile[] {
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

// --- Supporting profiles ---------------------------------------------------

function buildCoverageSupportingProfiles(
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
    ...buildEpsdtExceptionSupportingProfiles(signals),
  ];
}

// Adult coverage/exclusion questions: surface the policy's standard EPSDT
// special-provision section (template heading, usually 2.2.x) so the answer
// can state the under-21 contrast WITH a citation. Pediatric questions
// already get the dedicated pediatric profiles, so this is gated off there.
// Evidence-driven: pulls the section from the preferred document only if it
// actually exists; the planning directive downstream fires only on surfaced
// evidence.
function buildEpsdtExceptionSupportingProfiles(
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  const adultExclusionContext =
    signals.flags.yesNoCoverageQuery || signals.notCoveredRequested || signals.coverRequested;
  if (!adultExclusionContext || signals.pediatricRequested) return [];
  return [
    makeSectionProfile(
      'epsdt-exception-supporting',
      EPSDT_EXCEPTION_SECTION_TERMS,
      COVERAGE_SCOPE_AVOID_TERMS,
      'EPSDT special-provision section that may modify policy limitations for beneficiaries under 21.',
      1,
    ),
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

// --- Profile execution -----------------------------------------------------

export async function collectCoverageDocumentHydratedCandidates({
  context,
  scopedRoutingDocuments,
  queryLower,
  flags,
}: {
  context: FrameContext;
  scopedRoutingDocuments: DocumentWithSectionsView[];
  queryLower: string;
  flags: CoverageQueryFlags;
}): Promise<{
  documentPrimaryHydrated: HydratedSectionCandidate[];
  documentSupportingHydrated: HydratedSectionCandidate[];
}> {
  const profiles = buildCoverageDocumentCandidateProfiles(queryLower, flags);
  const documentPrimaryHydrated = await collectProfiles(context, scopedRoutingDocuments, profiles.primaryProfiles);
  const documentSupportingHydrated = await collectProfiles(context, scopedRoutingDocuments, profiles.supportingProfiles);

  return {
    documentPrimaryHydrated,
    documentSupportingHydrated,
  };
}

async function collectProfiles(
  context: FrameContext,
  scopedRoutingDocuments: DocumentWithSectionsView[],
  profiles: CoverageDocumentCandidateProfile[],
): Promise<HydratedSectionCandidate[]> {
  const collected: HydratedSectionCandidate[] = [];
  for (const profile of profiles) {
    const results =
      profile.collector === 'likely_limitation'
        ? await context.collectLikelyCoverageLimitationSectionCandidates(
            scopedRoutingDocuments,
            profile.reason,
            profile.limit,
          )
        : await context.collectDocumentSectionCandidates(
            scopedRoutingDocuments,
            profile.includeTerms,
            profile.avoidTerms,
            profile.reason,
            profile.limit,
          );
    collected.push(...results);
  }

  return uniqueBy(collected, (candidate) => candidate.section.id);
}
