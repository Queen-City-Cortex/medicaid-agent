// Coverage candidate collection: derives query flags from the normalized
// question, expands them into document-candidate profiles (which titled or
// likely-limitation sections to pull from the preferred policy documents),
// and runs those profiles against the frame context.
//
// Public surface (consumed by frame/pipelines/coverage.ts and the rebalance
// module in ./selection.ts):
//   - buildCoverageQueryFlags / CoverageQueryFlags
//   - collectCoverageDocumentHydratedCandidates
//   - collectYesNoStructuralCandidates / hasCoverageTheme
//   - buildCoverageDocumentCandidateProfiles (exposed for tests)
// Everything else (profile builders, signals, avoid-term combinations) is an
// implementation detail of this module.

import type { FrameContext } from '../context.js';
import type { DocumentWithSectionsView } from '../../types.js';
import {
  CERTIFICATION_SECTION_TERMS,
  CONGREGATE_PCS_CRITERIA_SECTION_TERMS,
  CONGREGATE_PCS_COVERED_SERVICE_SECTION_TERMS,
  CONGREGATE_PCS_NOT_COVERED_SECTION_TERMS,
  CONGREGATE_PCS_SUPPORT_SECTION_TERMS,
  COVERAGE_AVOID_TERMS,
  COVERAGE_DETAIL_SECTION_TERMS,
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
  toAnswerFrameSection,
  uniqueBy,
  type HydratedSectionCandidate,
} from '../../internal/shared.js';
import {
  YES_NO_SUPPORTING_SECTION_NUMBERS,
  hasSubstantiveText,
  isEpsdtSpecialProvisionSection,
  pickDescriptionSectionIds,
  pickEpsdtProvisionSectionIds,
  pickTemplateSlotSectionIds,
} from './structure.js';

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
  pediatricQuery: boolean;
  adultCoverageQuery: boolean;
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
    pediatricQuery: isPediatricCoverageQuestion(queryLower),
    adultCoverageQuery: isAdultCoverageQuestion(queryLower),
    hcwdIncomePremiumQuery: isHcwdIncomePremiumQuery(queryLower),
    earnedIncomeLimitQuery: asksForEarnedIncomeLimit(queryLower),
    telehealthAvoidTerms: [...TELEHEALTH_AVOID_TERMS, ...COVERAGE_AVOID_TERMS],
  };
}

function isPediatricCoverageQuestion(queryLower: string): boolean {
  return isPediatricQuery(queryLower) || queryLower.includes('epsdt') || queryLower.includes('under age 21');
}

/**
 * A question about whether something is covered that does not already ask
 * about a child: the questions whose "no" must carry the under-21 EPSDT
 * exception. It is the one gate for surfacing the provision (the supporting
 * profile rule and the selection group here) and for the agent's answer-plan
 * directive that tells the model to read it, so the two cannot disagree.
 * Any wording that mentions coverage counts ("What does Medicaid cover for
 * ...", "are they covered?"), not only a leading does/is/can.
 */
export function isAdultCoverageQuestion(queryLower: string): boolean {
  return (
    (isYesNoCoverageQuery(queryLower) || asksForNotCoveredDetails(queryLower) || /\bcover(s|ed|ing|age)?\b/.test(queryLower)) &&
    !isPediatricCoverageQuestion(queryLower)
  );
}

// The themes whose rebalance branch chooses its own lead sections
// (selection/assembly.ts), whether or not the question is also yes/no.
export function hasCoverageTheme(flags: CoverageQueryFlags): boolean {
  return (
    flags.telehealthQuery ||
    flags.eligibilityFrameworkQuery ||
    flags.congregatePcsQuery ||
    flags.ambulanceNotCoveredQuery ||
    flags.notCoveredQuery
  );
}

// --- Profile model ---------------------------------------------------------

// All-readonly: profiles are module-level singletons shared across every
// call since the rule-table conversion — an accidental write would corrupt
// results for all callers for the lifetime of the module.
export interface CoverageDocumentCandidateProfile {
  readonly id: string;
  readonly collector: 'section' | 'likely_limitation' | 'epsdt_provision';
  readonly includeTerms: readonly string[];
  readonly avoidTerms: readonly string[];
  readonly reason: string;
  readonly limit: number;
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
  // The frame is built from the policy template's structure, which places
  // the covered and not-covered criteria sections itself.
  yesNoStructure: boolean;
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
  yesNoStructure = false,
): CoverageDocumentCandidateProfileSets {
  const signals = { ...buildCoverageDocumentCandidateSignals(queryLower, flags), yesNoStructure };

  return {
    primaryProfiles: profilesFor(COVERAGE_PRIMARY_PROFILE_RULES, signals),
    supportingProfiles: profilesFor(COVERAGE_SUPPORTING_PROFILE_RULES, signals),
  };
}

function buildCoverageDocumentCandidateSignals(
  queryLower: string,
  flags: CoverageQueryFlags,
): Omit<CoverageDocumentCandidateSignals, 'yesNoStructure'> {
  return {
    queryLower,
    flags,
    generalCriteriaRequested: isEligibilityCriteriaQuery(queryLower) || asksForGeneralCriteria(queryLower),
    pediatricRequested: flags.pediatricQuery,
    modificationRequested: isModificationReviewQuery(queryLower),
    notCoveredRequested: flags.notCoveredQuery,
    coverRequested: queryLower.includes('cover'),
  };
}

// --- Profile rules ----------------------------------------------------------
//
// Each rule pairs a gate over the derived signals with the static profiles it
// contributes. profilesFor() walks a table in order and concatenates matching
// rules' profiles — TABLE ORDER IS LOAD-BEARING: selection downstream is
// positional and collectProfiles() dedupes first-wins on section id, so
// reordering rules changes which profile claims a shared section.

interface CoverageProfileRule {
  when: (signals: CoverageDocumentCandidateSignals) => boolean;
  profiles: readonly CoverageDocumentCandidateProfile[];
}

function profilesFor(
  rules: readonly CoverageProfileRule[],
  signals: CoverageDocumentCandidateSignals,
): CoverageDocumentCandidateProfile[] {
  return rules.filter((rule) => rule.when(signals)).flatMap((rule) => [...rule.profiles]);
}

const COVERAGE_PRIMARY_PROFILE_RULES: readonly CoverageProfileRule[] = [
  {
    when: (s) => s.generalCriteriaRequested,
    profiles: [
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
    ],
  },
  {
    when: (s) => s.pediatricRequested,
    profiles: [
      makeSectionProfile(
        'pediatric-primary',
        PEDIATRIC_COVERAGE_SECTION_TERMS,
        COVERAGE_AVOID_TERMS,
        'EPSDT or pediatric service section from the preferred document.',
        FRAME_PRIMARY_LIMIT,
      ),
    ],
  },
  {
    when: (s) => s.modificationRequested,
    profiles: [
      makeSectionProfile(
        'modification-primary',
        MODIFICATION_SECTION_TERMS,
        COVERAGE_AVOID_TERMS,
        'Coverage or documentation section for the requested modification service.',
        FRAME_PRIMARY_LIMIT,
      ),
    ],
  },
  {
    when: (s) => s.flags.telehealthQuery,
    profiles: [
      makeSectionProfile(
        'telehealth-primary',
        TELEHEALTH_PRIMARY_SECTION_TERMS,
        TELEHEALTH_COVERAGE_AVOID_TERMS,
        'Telehealth coverage section from the preferred document.',
        FRAME_PRIMARY_LIMIT,
      ),
    ],
  },
  {
    when: (s) => s.flags.certificationQuery,
    profiles: [
      makeSectionProfile(
        'certification-primary',
        CERTIFICATION_SECTION_TERMS,
        COVERAGE_AVOID_TERMS,
        'Certification or recertification section from the preferred document.',
        FRAME_PRIMARY_LIMIT,
      ),
    ],
  },
  {
    when: (s) => s.flags.hcwdIncomePremiumQuery,
    profiles: [
      makeSectionProfile(
        'hcwd-primary',
        HCWD_PRIMARY_SECTION_TERMS,
        HCWD_DOCUMENT_AVOID_TERMS,
        'Income, fee, or premium section from the preferred HCWD document.',
        FRAME_PRIMARY_LIMIT,
      ),
    ],
  },
  {
    when: (s) => s.coverRequested && !s.yesNoStructure,
    profiles: [
      makeSectionProfile(
        'coverage-detail-primary',
        COVERAGE_DETAIL_SECTION_TERMS,
        NOT_COVERED_SECTION_TERMS,
        'Direct coverage-detail section from the preferred document.',
        FRAME_PRIMARY_LIMIT,
      ),
    ],
  },
  {
    when: (s) => s.flags.congregatePcsQuery,
    profiles: [
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
    ],
  },
];

const COVERAGE_SUPPORTING_PROFILE_RULES: readonly CoverageProfileRule[] = [
  // Adult coverage questions (isAdultCoverageQuestion): the policy's under-21 EPSDT
  // provision comes first, because only the first four supporting candidates
  // are read and a "not covered" answer that omits the exception is wrong for
  // a child. Pediatric questions already get the pediatric profiles. The
  // section is found by its heading and must have text; the planning
  // directive downstream fires only on that surfaced evidence.
  {
    when: (s) => s.flags.adultCoverageQuery,
    profiles: [
      {
        id: 'epsdt-exception-supporting',
        collector: 'epsdt_provision',
        includeTerms: [],
        avoidTerms: [],
        reason: 'EPSDT special-provision section that may modify policy limitations for beneficiaries under 21.',
        limit: 1,
      },
    ],
  },
  {
    when: (s) => s.notCoveredRequested,
    profiles: [
      makeSectionProfile(
        'not-covered-supporting',
        NOT_COVERED_SECTION_TERMS,
        [],
        'Not-covered section from the preferred document.',
        FRAME_SUPPORT_LIMIT,
      ),
    ],
  },
  {
    when: (s) => s.flags.eligibilityFrameworkQuery,
    profiles: [
      makeSectionProfile(
        'eligibility-scope-supporting',
        ELIGIBILITY_SCOPE_SECTION_TERMS,
        COVERAGE_AVOID_TERMS,
        'Program scope or description section from the preferred document.',
        FRAME_SUPPORT_LIMIT,
      ),
    ],
  },
  {
    when: (s) => s.pediatricRequested,
    profiles: [
      makeSectionProfile(
        'pediatric-supporting',
        PEDIATRIC_COVERAGE_SECTION_TERMS,
        COVERAGE_AVOID_TERMS,
        'Additional EPSDT or pediatric service section from the preferred document.',
        FRAME_SUPPORT_LIMIT,
      ),
    ],
  },
  {
    when: (s) => s.modificationRequested,
    profiles: [
      makeSectionProfile(
        'modification-supporting',
        MODIFICATION_SECTION_TERMS,
        COVERAGE_AVOID_TERMS,
        'Additional coverage or documentation section for the requested modification service.',
        FRAME_SUPPORT_LIMIT,
      ),
    ],
  },
  {
    when: (s) => s.flags.telehealthQuery,
    profiles: [
      makeSectionProfile(
        'telehealth-supporting',
        TELEHEALTH_SUPPORT_SECTION_TERMS,
        TELEHEALTH_COVERAGE_AVOID_TERMS,
        'Service-specific telehealth section from the preferred document.',
        FRAME_SUPPORT_LIMIT,
      ),
    ],
  },
  {
    when: (s) => s.flags.certificationQuery,
    profiles: [
      makeSectionProfile(
        'certification-supporting',
        CERTIFICATION_SECTION_TERMS,
        COVERAGE_AVOID_TERMS,
        'Additional certification or recertification section from the preferred document.',
        FRAME_SUPPORT_LIMIT,
      ),
    ],
  },
  {
    when: (s) => s.flags.hcwdIncomePremiumQuery,
    profiles: [
      makeSectionProfile(
        'hcwd-supporting',
        HCWD_PRIMARY_SECTION_TERMS,
        HCWD_DOCUMENT_AVOID_TERMS,
        'Additional income, fee, or premium section from the preferred HCWD document.',
        FRAME_SUPPORT_LIMIT,
      ),
    ],
  },
  {
    when: (s) => (s.flags.yesNoCoverageQuery && !s.yesNoStructure) || s.notCoveredRequested,
    profiles: [
      makeLimitationProfile(
        'likely-limitation-supporting',
        'Likely limitation or non-covered subsection from the preferred document.',
        FRAME_SUPPORT_LIMIT,
      ),
    ],
  },
  {
    when: (s) => s.flags.congregatePcsQuery,
    profiles: [
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
    ],
  },
];

// --- Profile execution -----------------------------------------------------

export async function collectCoverageDocumentHydratedCandidates({
  context,
  scopedRoutingDocuments,
  queryLower,
  flags,
  yesNoStructure,
}: {
  context: FrameContext;
  scopedRoutingDocuments: DocumentWithSectionsView[];
  queryLower: string;
  flags: CoverageQueryFlags;
  yesNoStructure: boolean;
}): Promise<{
  documentPrimaryHydrated: HydratedSectionCandidate[];
  documentSupportingHydrated: HydratedSectionCandidate[];
}> {
  const profiles = buildCoverageDocumentCandidateProfiles(queryLower, flags, yesNoStructure);
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
      profile.collector === 'epsdt_provision'
        ? await collectEpsdtProvisionCandidates(context, scopedRoutingDocuments, profile.reason)
        : profile.collector === 'likely_limitation'
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

// --- Structural picks for yes/no questions ----------------------------------

export interface YesNoStructuralCandidates {
  descriptionHydrated: HydratedSectionCandidate[];
  templateSupportingHydrated: HydratedSectionCandidate[];
}

// Reads the sections a yes/no answer rests on from the first (preferred)
// routing document: the description section, or failing that its first
// numbered child with text, and the template covered and not-covered
// sections. A section that reads empty is skipped, so on the graph as it is
// served a policy whose 1.0 is a bare heading over unnumbered parts gets no
// description here; once those parts are loaded as its children, reading 1.0
// returns their text and it is chosen.
export async function collectYesNoStructuralCandidates({
  context,
  scopedRoutingDocuments,
}: {
  context: FrameContext;
  scopedRoutingDocuments: DocumentWithSectionsView[];
}): Promise<YesNoStructuralCandidates> {
  const sections = scopedRoutingDocuments[0]?.sections ?? [];
  const templateSupportingHydrated: HydratedSectionCandidate[] = [];
  for (const number of YES_NO_SUPPORTING_SECTION_NUMBERS) {
    templateSupportingHydrated.push(
      ...(await readFirstSubstantiveSection(
        context,
        pickTemplateSlotSectionIds(sections, number),
        'Covered or not-covered criteria section of the policy for the yes/no coverage question.',
      )),
    );
  }
  return {
    descriptionHydrated: await readFirstSubstantiveSection(
      context,
      pickDescriptionSectionIds(sections),
      'Description section of the policy for the yes/no coverage question.',
    ),
    templateSupportingHydrated,
  };
}

// The first routing document's EPSDT provision: section 2.2.1 when it has
// text, otherwise the "a. 42 U.S.C. § 1396d(r)" heading that holds it. On the
// graph as it is served that heading is not a child of 2.2.1, so 2.2.1 reads
// empty in those policies; once it is loaded as a child, 2.2.1 reads with the
// text and is chosen. Last comes section 2.2, for the policies where the
// provision was parsed into its body.
async function collectEpsdtProvisionCandidates(
  context: FrameContext,
  scopedRoutingDocuments: DocumentWithSectionsView[],
  reason: string,
): Promise<HydratedSectionCandidate[]> {
  for (const sectionId of pickEpsdtProvisionSectionIds(scopedRoutingDocuments[0]?.sections ?? [])) {
    const section = await context.getSection(sectionId);
    if (section && isEpsdtSpecialProvisionSection(section)) return [{ section: toAnswerFrameSection(section, reason) }];
  }
  return [];
}

// The first of these sections that reads with substantive text: not empty,
// not a heading read as "### 1.1 Definitions / None Apply.", not a lone list
// stem.
async function readFirstSubstantiveSection(
  context: FrameContext,
  sectionIds: string[],
  reason: string,
): Promise<HydratedSectionCandidate[]> {
  for (const sectionId of sectionIds) {
    const section = await context.getSection(sectionId);
    if (section && hasSubstantiveText(section)) return [{ section: toAnswerFrameSection(section, reason) }];
  }
  return [];
}
