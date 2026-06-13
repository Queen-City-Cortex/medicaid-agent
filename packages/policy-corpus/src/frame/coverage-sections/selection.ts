// Coverage rebalance selection: takes the sections surfaced by the coverage
// pipeline and re-derives the primary/supporting/avoid split. The stages run
// in order and are all exported because frame/rebalance/coverage.ts (and the
// coverage tests) drive them individually:
//
//   1. scoreCoverageSections      — per-section primary/support scores
//   2. collectCoverageSectionGroups — flag-driven section groupings
//   3. buildCoverageInitialSelection — score-ranked initial primary/support pick
//   4. buildCoverageAnchors       — flag-specific anchor sections that must lead
//   5. assembleCoverageSections   — final primary/supporting/avoid assembly
//
// Everything not needed to drive those stages is private to this module.

import type { AnswerFrame, AnswerFrameSection } from '../../types.js';
import {
  CERTIFICATION_SECTION_TERMS,
  CONGREGATE_PCS_CRITERIA_SECTION_TERMS,
  CONGREGATE_PCS_COVERED_SERVICE_SECTION_TERMS,
  CONGREGATE_PCS_NOT_COVERED_SECTION_TERMS,
  FRAME_PRIMARY_LIMIT,
  FRAME_SUPPORT_LIMIT,
  GENERAL_CRITERIA_SECTION_TERMS,
  HCWD_INCOME_RULE_TERMS,
  HCWD_PRIMARY_SECTION_TERMS,
  NOT_COVERED_SECTION_TERMS,
  REQUIREMENT_EVIDENCE_TERMS,
  TELEHEALTH_DOCUMENTATION_TERMS,
  TELEHEALTH_PRIMARY_SECTION_TERMS,
  TELEHEALTH_SUPPORT_SECTION_TERMS,
  YES_NO_COVERAGE_SECTION_TERMS,
  combineText,
  includesPhrase,
  isAdministrativeFormTitle,
  isAttachmentTitle,
  isCoverageAdministrativeTitle,
  isCoverageBoilerplateTitle,
  isCoverageLimitationText,
  isCoverageProcessTitle,
  isGenericSectionTitle,
  isHcwdProcessTitle,
  isTelehealthServiceTableSection,
  isYearSpecificPremiumTitle,
  normalizeSearchText,
  scorePhraseMatches,
  scoreTermMatches,
  sectionNumberDepth,
  uniqueBy,
} from '../../internal/shared.js';
import type { CoverageQueryFlags } from './candidates.js';

export interface CoverageScoredSection {
  section: AnswerFrameSection;
  text: string;
  limitation: boolean;
  primaryScore: number;
  supportScore: number;
}

export interface CoverageSectionGroups {
  generalEligibilityAnchorSections: AnswerFrameSection[];
  generalEligibilityContextSections: AnswerFrameSection[];
  generalEligibilityAdministrativeSections: AnswerFrameSection[];
  generalEligibilityLimitationSections: AnswerFrameSection[];
  coverageScopeSections: AnswerFrameSection[];
  congregateCriteriaSections: AnswerFrameSection[];
  congregateServiceSections: AnswerFrameSection[];
  congregateRoomAndBoardSections: AnswerFrameSection[];
  congregateWorkflowSections: AnswerFrameSection[];
  congregateGeneralLimitationSections: AnswerFrameSection[];
  epsdtExceptionSections: AnswerFrameSection[];
}

// --- Stage 1: scoring -------------------------------------------------------

export function scoreCoverageSections(
  surfacedSections: AnswerFrameSection[],
  serviceFocusTerms: string[],
  serviceClusterTerms: string[],
  flags: CoverageQueryFlags,
): CoverageScoredSection[] {
  return surfacedSections.map((section) => scoreCoverageSection(section, serviceFocusTerms, serviceClusterTerms, flags));
}

function scoreCoverageSection(
  section: AnswerFrameSection,
  serviceFocusTerms: string[],
  serviceClusterTerms: string[],
  flags: CoverageQueryFlags,
): CoverageScoredSection {
  const text = combineText(section.title, section.content);
  const focusScore =
    scoreTermMatches(serviceFocusTerms, section.title) + Math.min(scoreTermMatches(serviceFocusTerms, section.content), 4);
  const clusterScore =
    scoreTermMatches(serviceClusterTerms, section.title) +
    Math.min(scoreTermMatches(serviceClusterTerms, section.content), 3);
  const requirementScore = Math.min(scorePhraseMatches(text, REQUIREMENT_EVIDENCE_TERMS, 1), 4);
  const certificationBonus = flags.certificationQuery ? scorePhraseMatches(text, CERTIFICATION_SECTION_TERMS, 1) * 1.1 : 0;
  const generalCriteriaBonus = flags.generalCriteriaQuery ? scorePhraseMatches(text, GENERAL_CRITERIA_SECTION_TERMS, 1) * 1.2 : 0;
  const notCoveredBonus = flags.notCoveredQuery ? scorePhraseMatches(text, NOT_COVERED_SECTION_TERMS, 1) * 1.2 : 0;
  const yesNoCoverageBonus = flags.yesNoCoverageQuery ? scorePhraseMatches(text, YES_NO_COVERAGE_SECTION_TERMS, 1) * 1.3 : 0;
  const telehealthPrimaryBonus = flags.telehealthQuery ? scorePhraseMatches(text, TELEHEALTH_PRIMARY_SECTION_TERMS, 1) * 2.3 : 0;
  const telehealthSupportingBonus = flags.telehealthQuery ? scorePhraseMatches(text, TELEHEALTH_SUPPORT_SECTION_TERMS, 1) * 1.2 : 0;
  const telehealthDocumentationBonus = flags.telehealthQuery
    ? scorePhraseMatches(text, TELEHEALTH_DOCUMENTATION_TERMS, 1) * 1.1
    : 0;
  const telehealthTangentialPenalty = flags.telehealthQuery
    ? scorePhraseMatches(text, flags.telehealthAvoidTerms, 1) * 3.5
    : 0;
  const telehealthTablePenalty =
    flags.telehealthQuery && !flags.telehealthServiceListQuery && isTelehealthServiceTableSection(section) ? 2.8 : 0;
  const hcwdCurrentBonus = flags.hcwdIncomePremiumQuery ? scorePhraseMatches(text, HCWD_PRIMARY_SECTION_TERMS, 1) * 1.3 : 0;
  const hcwdHistoryBonus =
    flags.hcwdIncomePremiumQuery && flags.earnedIncomeLimitQuery ? scorePhraseMatches(text, HCWD_INCOME_RULE_TERMS, 1) * 1.5 : 0;
  const hcwdCurrentDocumentBonus =
    flags.hcwdIncomePremiumQuery && section.policyNumber?.toUpperCase() === 'MA-2180' ? 1.5 : 0;
  const numberedBonus = section.sectionNumber ? 0.5 : 0;
  const limitationBonus = isCoverageLimitationText(text) ? 3 : 0;
  const boilerplatePenalty = isCoverageBoilerplateTitle(section.title) ? 2.5 : 0;
  const attachmentPenalty = isAttachmentTitle(section.title) ? 3 : 0;
  const requestInfoPenalty =
    flags.yesNoCoverageQuery &&
    (
      isAttachmentTitle(section.title) ||
      isGenericSectionTitle(section.title) ||
      normalizeSearchText(section.title).includes('requesting ')
    )
      ? 3.2
      : 0;
  const hcwdHistoricalPrimaryPenalty = flags.hcwdIncomePremiumQuery && section.status === 'amendment' ? 0.9 : 0;
  const hcwdTangentialPenalty =
    flags.hcwdIncomePremiumQuery &&
    (
      isAdministrativeFormTitle(section.title) ||
      isAdministrativeFormTitle(section.documentTitle) ||
      isYearSpecificPremiumTitle(section.title) ||
      isYearSpecificPremiumTitle(section.documentTitle) ||
      isHcwdProcessTitle(section.title) ||
      isHcwdProcessTitle(section.documentTitle)
    )
      ? 2.6
      : 0;

  return {
    section,
    text,
    limitation: isCoverageLimitationText(text),
    primaryScore:
      focusScore * 1.2 +
      clusterScore * 0.8 +
      requirementScore * 0.6 +
      certificationBonus +
      generalCriteriaBonus +
      yesNoCoverageBonus +
      telehealthPrimaryBonus * 1.4 +
      telehealthSupportingBonus * 0.3 +
      telehealthDocumentationBonus * 0.8 +
      hcwdCurrentBonus * 1.1 +
      hcwdHistoryBonus * 0.5 +
      hcwdCurrentDocumentBonus +
      numberedBonus -
      boilerplatePenalty -
      attachmentPenalty -
      requestInfoPenalty -
      telehealthTangentialPenalty -
      telehealthTablePenalty -
      hcwdHistoricalPrimaryPenalty -
      hcwdTangentialPenalty,
    supportScore:
      limitationBonus +
      notCoveredBonus +
      focusScore * 0.6 +
      clusterScore * 0.9 +
      requirementScore * 0.4 +
      certificationBonus * 0.9 +
      yesNoCoverageBonus * 1.1 +
      telehealthPrimaryBonus * 0.8 +
      telehealthSupportingBonus * 1.3 +
      telehealthDocumentationBonus * 1.2 +
      hcwdCurrentBonus * 0.7 +
      hcwdHistoryBonus * 1.3 +
      (section.status === 'amendment' ? 0.5 : 0) +
      numberedBonus -
      boilerplatePenalty -
      attachmentPenalty -
      requestInfoPenalty -
      telehealthTangentialPenalty -
      telehealthTablePenalty -
      hcwdTangentialPenalty,
  };
}

// --- Stage 2: section groups ------------------------------------------------

export function collectCoverageSectionGroups(
  surfacedSections: AnswerFrameSection[],
  flags: CoverageQueryFlags,
): CoverageSectionGroups {
  return {
    ...collectGeneralEligibilityGroups(surfacedSections, flags),
    ...collectCoverageScopeGroups(surfacedSections, flags),
    ...collectCongregatePcsGroups(surfacedSections, flags),
    ...collectEpsdtExceptionGroups(surfacedSections, flags),
  };
}

// The standard EPSDT special-provision section (template heading, usually
// 2.2.x) when it was surfaced for a coverage/exclusion question — kept as a
// named group so score-ranked supporting selection can't silently drop the
// under-21 contrast evidence.
function collectEpsdtExceptionGroups(
  surfacedSections: AnswerFrameSection[],
  flags: CoverageQueryFlags,
): Pick<CoverageSectionGroups, 'epsdtExceptionSections'> {
  const epsdtExceptionSections =
    flags.yesNoCoverageQuery || flags.notCoveredQuery
      ? uniqueBy(
          surfacedSections.filter((section) =>
            includesPhrase(combineText(section.sectionNumber, section.title, section.content), [
              'epsdt special provision',
              'exception to policy limitations',
            ]),
          ),
          (section) => section.id,
        )
      : [];
  return { epsdtExceptionSections };
}

function collectGeneralEligibilityGroups(
  surfacedSections: AnswerFrameSection[],
  flags: CoverageQueryFlags,
): Pick<
  CoverageSectionGroups,
  | 'generalEligibilityAnchorSections'
  | 'generalEligibilityContextSections'
  | 'generalEligibilityAdministrativeSections'
  | 'generalEligibilityLimitationSections'
> {
  const generalEligibilityAnchorSections = flags.eligibilityFrameworkQuery
    ? uniqueBy(
        surfacedSections
          .filter((section) => {
            const text = combineText(section.sectionNumber, section.title, section.content);
            const sectionNumber = normalizeSearchText(section.sectionNumber);
            return (
              !isCoverageAdministrativeTitle(section.title) &&
              (
                sectionNumber === '2.1.1' ||
                sectionNumber === '3.1' ||
                sectionNumber === '3.2.1' ||
                includesPhrase(text, ['general provisions', 'general criteria covered', 'specific criteria covered'])
              )
            );
          })
          .sort((left, right) => getEligibilityPriority(left.sectionNumber) - getEligibilityPriority(right.sectionNumber)),
        (section) => section.id,
      )
    : [];

  const generalEligibilityContextSections = flags.eligibilityFrameworkQuery
    ? uniqueBy(
        surfacedSections.filter((section) =>
          includesPhrase(combineText(section.sectionNumber, section.title, section.content), [
            '18 years of age',
            'adult with disabilities',
            'risk of institutionalization',
            'enrolled in the nc medicaid program',
            'service restrictions due to their eligibility category',
          ]),
        ),
        (section) => section.id,
      )
    : [];

  const generalEligibilityAdministrativeSections = flags.eligibilityFrameworkQuery
    ? uniqueBy(surfacedSections.filter((section) => isCoverageAdministrativeTitle(section.title)), (section) => section.id)
    : [];

  const generalEligibilityLimitationSections = flags.eligibilityFrameworkQuery && !flags.notCoveredQuery
    ? uniqueBy(
        surfacedSections.filter((section) => isCoverageLimitationText(combineText(section.title, section.content))),
        (section) => section.id,
      )
    : [];

  return {
    generalEligibilityAnchorSections,
    generalEligibilityContextSections,
    generalEligibilityAdministrativeSections,
    generalEligibilityLimitationSections,
  };
}

function collectCoverageScopeGroups(
  surfacedSections: AnswerFrameSection[],
  flags: CoverageQueryFlags,
): Pick<CoverageSectionGroups, 'coverageScopeSections'> {
  const coverageScopeSections = flags.yesNoCoverageQuery
    ? uniqueBy(
        surfacedSections.filter((section) => {
          const text = combineText(section.sectionNumber, section.title, section.content);
          const sectionNumber = normalizeSearchText(section.sectionNumber);
          return (
            !isCoverageProcessTitle(section.title) &&
            (
              sectionNumber === '1.0' ||
              sectionNumber === '2.1.1' ||
              includesPhrase(text, [
                'scope',
                'description',
                '2.1.1',
                '1.0',
                'general provisions',
                'description of the procedure, product, or service',
              ])
            )
          );
        }),
        (section) => section.id,
      )
    : [];

  return { coverageScopeSections };
}

function collectCongregatePcsGroups(
  surfacedSections: AnswerFrameSection[],
  flags: CoverageQueryFlags,
): Pick<
  CoverageSectionGroups,
  | 'congregateCriteriaSections'
  | 'congregateServiceSections'
  | 'congregateRoomAndBoardSections'
  | 'congregateWorkflowSections'
  | 'congregateGeneralLimitationSections'
> {
  const congregateCriteriaSections = flags.congregatePcsQuery
    ? uniqueBy(
        surfacedSections.filter((section) => {
          const text = combineText(section.sectionNumber, section.title, section.content);
          return (
            normalizeSearchText(section.sectionNumber) === '3.2.1' ||
            includesPhrase(text, CONGREGATE_PCS_CRITERIA_SECTION_TERMS)
          );
        }),
        (section) => section.id,
      )
    : [];

  const congregateServiceSections = flags.congregatePcsQuery
    ? uniqueBy(
        surfacedSections.filter((section) => {
          const text = combineText(section.sectionNumber, section.title, section.content);
          return (
            normalizeSearchText(section.sectionNumber) === '3.3' ||
            includesPhrase(text, CONGREGATE_PCS_COVERED_SERVICE_SECTION_TERMS)
          );
        }),
        (section) => section.id,
      )
    : [];

  const congregateRoomAndBoardSections = flags.congregatePcsQuery
    ? uniqueBy(
        surfacedSections.filter((section) => {
          const text = combineText(section.sectionNumber, section.title, section.content);
          return (
            normalizeSearchText(section.sectionNumber) === '4.2.1.2' ||
            includesPhrase(text, CONGREGATE_PCS_NOT_COVERED_SECTION_TERMS)
          );
        }),
        (section) => section.id,
      )
    : [];

  const congregateWorkflowSections = flags.congregatePcsQuery
    ? uniqueBy(
        surfacedSections.filter((section) => isCoverageProcessTitle(section.title)),
        (section) => section.id,
      )
    : [];

  const congregateGeneralLimitationSections = flags.congregatePcsQuery
    ? uniqueBy(
        surfacedSections.filter((section) => {
          const sectionNumber = normalizeSearchText(section.sectionNumber);
          return sectionNumber === '4.1' || sectionNumber === '4.2' || sectionNumber === '4.2.1';
        }),
        (section) => section.id,
      )
    : [];

  return {
    congregateCriteriaSections,
    congregateServiceSections,
    congregateRoomAndBoardSections,
    congregateWorkflowSections,
    congregateGeneralLimitationSections,
  };
}

function getEligibilityPriority(sectionNumber: string | null | undefined): number {
  const normalized = normalizeSearchText(sectionNumber);
  if (normalized === '2.1.1') return 0;
  if (normalized === '3.1') return 1;
  if (normalized === '3.2.1') return 2;
  return 4;
}

// --- Stage 3: initial selection ----------------------------------------------

export interface CoverageInitialSelection {
  primaryLimit: number;
  yesNoCoveragePrimaryScored: CoverageScoredSection[];
  notCoveredPrimaryScored: CoverageScoredSection[];
  telehealthPrimaryScored: CoverageScoredSection[];
  initialPrimarySections: AnswerFrameSection[];
  initialSupportingSections: AnswerFrameSection[];
}

export function buildCoverageInitialSelection({
  scored,
  serviceFocusTerms,
  flags,
}: {
  scored: CoverageScoredSection[];
  serviceFocusTerms: string[];
  flags: CoverageQueryFlags;
}): CoverageInitialSelection {
  const primaryLimit =
    flags.certificationQuery || flags.eligibilityFrameworkQuery
      ? FRAME_PRIMARY_LIMIT
      : serviceFocusTerms.length > 0
        ? 2
        : FRAME_PRIMARY_LIMIT;

  const preferredPrimaryScored = scored.filter((entry) => {
    const text = combineText(entry.section.title, entry.section.content);
    if (entry.limitation && !flags.yesNoCoverageQuery && !flags.notCoveredQuery) return false;
    if ((flags.generalCriteriaQuery || flags.notCoveredQuery) && isAttachmentTitle(entry.section.title)) return false;
    if (flags.telehealthQuery && scorePhraseMatches(text, flags.telehealthAvoidTerms, 1) > 0) return false;
    if (flags.telehealthQuery && !flags.telehealthServiceListQuery && isTelehealthServiceTableSection(entry.section)) return false;
    if (
      flags.yesNoCoverageQuery &&
      (
        isAttachmentTitle(entry.section.title) ||
        isGenericSectionTitle(entry.section.title) ||
        normalizeSearchText(entry.section.title).includes('requesting ')
      )
    ) {
      return false;
    }
    return true;
  });

  const yesNoCoveragePrimaryScored = flags.yesNoCoverageQuery
    ? preferredPrimaryScored.filter((entry) => scorePhraseMatches(entry.text, YES_NO_COVERAGE_SECTION_TERMS, 1) > 0)
    : [];
  const notCoveredPrimaryScored = flags.notCoveredQuery
    ? preferredPrimaryScored.filter(
        (entry) =>
          entry.limitation ||
          scorePhraseMatches(entry.text, NOT_COVERED_SECTION_TERMS, 1) > 0,
      )
    : [];
  const telehealthPrimaryScored = flags.telehealthQuery
    ? preferredPrimaryScored.filter(
        (entry) => scorePhraseMatches(normalizeSearchText(entry.section.title), TELEHEALTH_PRIMARY_SECTION_TERMS, 1) > 0,
      )
    : [];
  const hcwdCurrentPrimaryScored =
    flags.hcwdIncomePremiumQuery
      ? preferredPrimaryScored.filter(
          (entry) =>
            entry.section.status !== 'amendment' &&
            !isYearSpecificPremiumTitle(entry.section.title) &&
            !isYearSpecificPremiumTitle(entry.section.documentTitle) &&
            !isAdministrativeFormTitle(entry.section.title) &&
            !isAdministrativeFormTitle(entry.section.documentTitle) &&
            !isHcwdProcessTitle(entry.section.title) &&
            !isHcwdProcessTitle(entry.section.documentTitle),
        )
      : [];
  const basePrimaryScored =
    hcwdCurrentPrimaryScored.length > 0
      ? hcwdCurrentPrimaryScored
      : preferredPrimaryScored.length > 0
        ? preferredPrimaryScored
        : scored.filter((entry) => !entry.limitation);

  const initialPrimarySections = telehealthPrimaryScored.length > 0
    ? uniqueBy(
        [
          ...telehealthPrimaryScored.sort((left, right) => right.primaryScore - left.primaryScore).slice(0, 1),
          ...basePrimaryScored.sort((left, right) => right.primaryScore - left.primaryScore),
        ],
        (entry) => entry.section.id,
      )
        .slice(0, primaryLimit)
        .map((entry) => entry.section)
    : basePrimaryScored
        .sort((left, right) => right.primaryScore - left.primaryScore)
        .slice(0, primaryLimit)
        .map((entry) => entry.section);
  const primaryIds = new Set(initialPrimarySections.map((section) => section.id));
  const preferredSupportingScored = hcwdCurrentPrimaryScored.length > 0
    ? scored.filter(
        (entry) =>
          !primaryIds.has(entry.section.id) &&
          !isYearSpecificPremiumTitle(entry.section.title) &&
          !isYearSpecificPremiumTitle(entry.section.documentTitle) &&
          !isAdministrativeFormTitle(entry.section.title) &&
          !isAdministrativeFormTitle(entry.section.documentTitle) &&
          !isHcwdProcessTitle(entry.section.title) &&
          !isHcwdProcessTitle(entry.section.documentTitle),
      )
    : scored.filter((entry) => {
        if (primaryIds.has(entry.section.id)) return false;
        if (flags.telehealthQuery && scorePhraseMatches(combineText(entry.section.title, entry.section.content), flags.telehealthAvoidTerms, 1) > 0) {
          return false;
        }
        if (flags.telehealthQuery && !flags.telehealthServiceListQuery && isTelehealthServiceTableSection(entry.section)) {
          return false;
        }
        if (
          flags.yesNoCoverageQuery &&
          (
            isAttachmentTitle(entry.section.title) ||
            isGenericSectionTitle(entry.section.title) ||
            normalizeSearchText(entry.section.title).includes('requesting ')
          )
        ) {
          return false;
        }
        return true;
      });
  const initialSupportingSections = (preferredSupportingScored.length > 0
    ? preferredSupportingScored
    : scored.filter((entry) => !primaryIds.has(entry.section.id)))
    .sort((left, right) => right.supportScore - left.supportScore)
    .slice(0, FRAME_SUPPORT_LIMIT)
    .map((entry) => entry.section);

  return {
    primaryLimit,
    yesNoCoveragePrimaryScored,
    notCoveredPrimaryScored,
    telehealthPrimaryScored,
    initialPrimarySections,
    initialSupportingSections,
  };
}

// --- Stage 4: anchors ---------------------------------------------------------

export interface CoverageAnchorSets {
  yesNoCoverageAnchorSections: AnswerFrameSection[];
  yesNoCoverageScopeAnchorSections: AnswerFrameSection[];
  notCoveredAnchorSections: AnswerFrameSection[];
  limitationAnchorSections: AnswerFrameSection[];
  ambulanceSpecificNotCoveredSections: AnswerFrameSection[];
  ambulanceCoverageContrastSections: AnswerFrameSection[];
  ambulanceGeneralExclusionSections: AnswerFrameSection[];
  telehealthAnchorSection: AnswerFrameSection | null;
}

export function buildCoverageAnchors({
  surfacedSections,
  groups,
  flags,
  selection,
}: {
  surfacedSections: AnswerFrameSection[];
  groups: CoverageSectionGroups;
  flags: CoverageQueryFlags;
  selection: CoverageInitialSelection;
}): CoverageAnchorSets {
  const generalLimitationPrimaryScored =
    flags.yesNoCoverageQuery || flags.notCoveredQuery
      ? uniqueBy(
          surfacedSections
            .filter((section) => {
              const text = combineText(section.sectionNumber, section.title, section.content);
              return (
                !isAttachmentTitle(section.title) &&
                !isCoverageProcessTitle(section.title) &&
                isCoverageLimitationText(text) &&
                (
                  normalizeSearchText(section.title).includes('general') ||
                  normalizeSearchText(section.sectionNumber) === '4.1' ||
                  sectionNumberDepth(section.sectionNumber) <= 2
                )
              );
            })
            .sort((left, right) => {
              const leftGeneral =
                normalizeSearchText(left.title).includes('general') || normalizeSearchText(left.sectionNumber) === '4.1';
              const rightGeneral =
                normalizeSearchText(right.title).includes('general') || normalizeSearchText(right.sectionNumber) === '4.1';
              if (leftGeneral !== rightGeneral) return leftGeneral ? -1 : 1;
              return sectionNumberDepth(left.sectionNumber) - sectionNumberDepth(right.sectionNumber);
            })
            .map((section) => ({
              section,
              primaryScore: 0,
              supportScore: 0,
              text: combineText(section.title, section.content),
              limitation: true,
            })),
          (entry) => entry.section.id,
        )
      : [];
  const specificLimitationPrimaryScored =
    flags.yesNoCoverageQuery || flags.notCoveredQuery
      ? uniqueBy(
          surfacedSections
            .filter((section) => {
              const text = combineText(section.sectionNumber, section.title, section.content);
              return (
                !isAttachmentTitle(section.title) &&
                !isCoverageProcessTitle(section.title) &&
                isCoverageLimitationText(text) &&
                (
                  sectionNumberDepth(section.sectionNumber) >= 3 ||
                  includesPhrase(normalizeSearchText(section.title), [
                    'specific',
                    'other non-covered',
                    'other noncovered',
                    'room and board',
                    'comfort or convenience',
                  ])
                )
              );
            })
            .sort((left, right) => sectionNumberDepth(right.sectionNumber) - sectionNumberDepth(left.sectionNumber))
            .map((section) => ({
              section,
              primaryScore: 0,
              supportScore: 0,
              text: combineText(section.title, section.content),
              limitation: true,
            })),
          (entry) => entry.section.id,
        )
      : [];
  const yesNoCoverageAnchorSections = flags.yesNoCoverageQuery
    ? selection.yesNoCoveragePrimaryScored
        .sort((left, right) => right.primaryScore - left.primaryScore)
        .slice(0, selection.primaryLimit)
        .map((entry) => entry.section)
    : [];
  const yesNoCoverageScopeAnchorSections = flags.yesNoCoverageQuery
    ? selection.yesNoCoveragePrimaryScored
        .filter((entry) => groups.coverageScopeSections.some((section) => section.id === entry.section.id))
        .sort((left, right) => right.primaryScore - left.primaryScore)
        .slice(0, 1)
        .map((entry) => entry.section)
    : [];
  const notCoveredAnchorSections = flags.notCoveredQuery
    ? selection.notCoveredPrimaryScored
        .sort((left, right) => right.supportScore - left.supportScore)
        .slice(0, selection.primaryLimit)
        .map((entry) => entry.section)
    : [];
  const generalLimitationAnchorSections = (flags.yesNoCoverageQuery || flags.notCoveredQuery)
    ? generalLimitationPrimaryScored
        .sort((left, right) => right.supportScore - left.supportScore)
        .slice(0, 1)
        .map((entry) => entry.section)
    : [];
  const specificLimitationAnchorSections = (flags.yesNoCoverageQuery || flags.notCoveredQuery)
    ? specificLimitationPrimaryScored
        .sort((left, right) => right.supportScore - left.supportScore)
        .slice(0, 1)
        .map((entry) => entry.section)
    : [];
  const limitationAnchorSections = flags.notCoveredQuery
    ? uniqueBy([...specificLimitationAnchorSections, ...generalLimitationAnchorSections], (section) => section.id)
    : flags.yesNoCoverageQuery
      ? uniqueBy([...generalLimitationAnchorSections, ...specificLimitationAnchorSections], (section) => section.id).slice(0, 1)
      : [];
  const ambulanceSpecificNotCoveredSections = flags.ambulanceNotCoveredQuery
    ? uniqueBy(
        surfacedSections.filter((section) => {
          const text = combineText(section.title, section.content);
          return (
            includesPhrase(text, ['other non-covered ambulance services', 'other non-covered', 'other noncovered']) ||
            normalizeSearchText(section.sectionNumber) === '4.2.1.4'
          );
        }),
        (section) => section.id,
      )
    : [];
  const ambulanceCoverageContrastSections = flags.ambulanceNotCoveredQuery
    ? uniqueBy(
        surfacedSections.filter((section) =>
          includesPhrase(combineText(section.title, section.content), ['air medical ambulance', 'air ambulance']),
        ),
        (section) => section.id,
      )
    : [];
  const ambulanceGeneralExclusionSections = flags.ambulanceNotCoveredQuery
    ? uniqueBy(
        surfacedSections.filter((section) =>
          includesPhrase(combineText(section.title, section.content), ['general criteria not covered']),
        ),
        (section) => section.id,
      )
    : [];
  const telehealthAnchorSection = flags.telehealthQuery
    ? (
        findTopScoredSection(selection.telehealthPrimaryScored) ??
        surfacedSections.find(
          (section) => scorePhraseMatches(normalizeSearchText(section.title), ['telehealth', 'telemedicine'], 1) > 0,
        ) ??
        null
      )
    : null;

  return {
    yesNoCoverageAnchorSections,
    yesNoCoverageScopeAnchorSections,
    notCoveredAnchorSections,
    limitationAnchorSections,
    ambulanceSpecificNotCoveredSections,
    ambulanceCoverageContrastSections,
    ambulanceGeneralExclusionSections,
    telehealthAnchorSection,
  };
}

function findTopScoredSection(entries: CoverageScoredSection[]): AnswerFrameSection | null {
  return entries.sort((left, right) => right.primaryScore - left.primaryScore)[0]?.section ?? null;
}

// --- Stage 5: final assembly ---------------------------------------------------

export function assembleCoverageSections({
  frame,
  flags,
  groups,
  selection,
  anchors,
}: {
  frame: AnswerFrame;
  flags: CoverageQueryFlags;
  groups: CoverageSectionGroups;
  selection: CoverageInitialSelection;
  anchors: CoverageAnchorSets;
}): Pick<AnswerFrame, 'primarySections' | 'supportingSections' | 'avoidSections'> {
  const primarySections = selectCoveragePrimarySections(selection, groups, anchors, flags);
  const rebalancedPrimaryIds = new Set(primarySections.map((section) => section.id));
  const shouldMergeInitialPrimaryIntoSupporting =
    anchors.telehealthAnchorSection != null ||
    flags.notCoveredQuery && anchors.limitationAnchorSections.length > 0 ||
    flags.yesNoCoverageQuery &&
      (anchors.yesNoCoverageScopeAnchorSections.length > 0 || anchors.limitationAnchorSections.length > 0) ||
    anchors.notCoveredAnchorSections.length > 0;
  let supportingSections = shouldMergeInitialPrimaryIntoSupporting
    ? uniqueBy([...selection.initialPrimarySections, ...selection.initialSupportingSections], (section) => section.id)
        .filter((section) => !rebalancedPrimaryIds.has(section.id))
        .slice(0, FRAME_SUPPORT_LIMIT)
    : selection.initialSupportingSections;
  const demotedTelehealthTableSections =
    flags.telehealthQuery && !flags.telehealthServiceListQuery
      ? supportingSections.filter((section) => isTelehealthServiceTableSection(section))
      : [];
  const demotedTelehealthContextSections = flags.telehealthQuery
    ? supportingSections.filter(
        (section) => scorePhraseMatches(combineText(section.title, section.content), flags.telehealthAvoidTerms, 1) > 0,
      )
    : [];
  if (demotedTelehealthTableSections.length > 0 && supportingSections.length > demotedTelehealthTableSections.length) {
    supportingSections = supportingSections.filter((section) => !isTelehealthServiceTableSection(section));
  }
  if (demotedTelehealthContextSections.length > 0 && supportingSections.length > demotedTelehealthContextSections.length) {
    const demotedIds = new Set(demotedTelehealthContextSections.map((section) => section.id));
    supportingSections = supportingSections.filter((section) => !demotedIds.has(section.id));
  }
  if (flags.ambulanceNotCoveredQuery && anchors.ambulanceCoverageContrastSections.length > 0) {
    supportingSections = uniqueBy(
      [
        ...anchors.ambulanceCoverageContrastSections,
        ...supportingSections.filter(
          (section) => !anchors.ambulanceGeneralExclusionSections.some((candidate) => candidate.id === section.id),
        ),
      ],
      (section) => section.id,
    )
      .filter((section) => !rebalancedPrimaryIds.has(section.id))
      .slice(0, FRAME_SUPPORT_LIMIT);
  }
  if (flags.congregatePcsQuery) {
    supportingSections = uniqueBy(
      [
        ...groups.congregateServiceSections,
        ...groups.congregateRoomAndBoardSections,
        ...supportingSections.filter(
          (section) =>
            !groups.congregateWorkflowSections.some((candidate) => candidate.id === section.id) &&
            !(
              groups.congregateRoomAndBoardSections.length > 0 &&
              groups.congregateGeneralLimitationSections.some((candidate) => candidate.id === section.id)
            ),
        ),
      ],
      (section) => section.id,
    )
      .filter((section) => !rebalancedPrimaryIds.has(section.id))
      .slice(0, FRAME_SUPPORT_LIMIT);
  }
  if (groups.epsdtExceptionSections.length > 0) {
    // Keep one EPSDT special-provision section visible in supporting evidence
    // so adult-exclusion answers can cite the under-21 contrast.
    supportingSections = uniqueBy(
      [groups.epsdtExceptionSections[0], ...supportingSections],
      (section) => section.id,
    )
      .filter((section) => !rebalancedPrimaryIds.has(section.id))
      .slice(0, FRAME_SUPPORT_LIMIT);
  }
  if (flags.eligibilityFrameworkQuery) {
    const preferredGeneralSupporting = uniqueBy(
      [
        ...groups.generalEligibilityContextSections,
        ...supportingSections.filter(
          (section) =>
            !groups.generalEligibilityAdministrativeSections.some((candidate) => candidate.id === section.id) &&
            !groups.generalEligibilityLimitationSections.some((candidate) => candidate.id === section.id),
        ),
      ],
      (section) => section.id,
    );
    const fallbackGeneralSupporting = supportingSections.filter(
      (section) => !groups.generalEligibilityAdministrativeSections.some((candidate) => candidate.id === section.id),
    );
    supportingSections = (preferredGeneralSupporting.length > 0 ? preferredGeneralSupporting : fallbackGeneralSupporting)
      .filter((section) => !rebalancedPrimaryIds.has(section.id))
      .slice(0, FRAME_SUPPORT_LIMIT);
  }
  const surfacedIds = new Set([...rebalancedPrimaryIds, ...supportingSections.map((section) => section.id)]);
  const avoidSections = uniqueBy(
    [
      ...frame.avoidSections,
      ...demotedTelehealthTableSections,
      ...demotedTelehealthContextSections,
      ...anchors.ambulanceGeneralExclusionSections,
      ...groups.congregateWorkflowSections,
      ...groups.generalEligibilityAdministrativeSections,
      ...groups.generalEligibilityLimitationSections,
    ],
    (section) => section.id,
  ).filter((section) => !surfacedIds.has(section.id));

  return {
    primarySections,
    supportingSections,
    avoidSections,
  };
}

function selectCoveragePrimarySections(
  selection: CoverageInitialSelection,
  groups: CoverageSectionGroups,
  anchors: CoverageAnchorSets,
  flags: CoverageQueryFlags,
): AnswerFrameSection[] {
  return anchors.telehealthAnchorSection
    ? uniqueBy([anchors.telehealthAnchorSection, ...selection.initialPrimarySections], (section) => section.id).slice(
        0,
        selection.primaryLimit,
      )
    : flags.eligibilityFrameworkQuery && groups.generalEligibilityAnchorSections.length > 0
      ? uniqueBy(
          [
            ...groups.generalEligibilityAnchorSections,
            ...selection.initialPrimarySections.filter(
              (section) => !groups.generalEligibilityAdministrativeSections.some((candidate) => candidate.id === section.id),
            ),
          ],
          (section) => section.id,
        ).slice(0, selection.primaryLimit)
      : flags.congregatePcsQuery && (groups.congregateCriteriaSections.length > 0 || groups.congregateServiceSections.length > 0)
        ? uniqueBy(
            [
              ...groups.congregateCriteriaSections,
              ...groups.congregateServiceSections,
              ...selection.initialPrimarySections.filter(
                (section) => !groups.congregateWorkflowSections.some((candidate) => candidate.id === section.id),
              ),
            ],
            (section) => section.id,
          ).slice(0, selection.primaryLimit)
        : flags.ambulanceNotCoveredQuery && anchors.ambulanceSpecificNotCoveredSections.length > 0
          ? uniqueBy(
              [
                ...anchors.ambulanceSpecificNotCoveredSections,
                ...selection.initialPrimarySections.filter(
                  (section) => !anchors.ambulanceGeneralExclusionSections.some((candidate) => candidate.id === section.id),
                ),
              ],
              (section) => section.id,
            ).slice(0, selection.primaryLimit)
          : flags.notCoveredQuery && anchors.limitationAnchorSections.length > 0
            ? uniqueBy([...anchors.limitationAnchorSections, ...selection.initialPrimarySections], (section) => section.id).slice(
                0,
                selection.primaryLimit,
              )
            : flags.yesNoCoverageQuery &&
                (anchors.yesNoCoverageScopeAnchorSections.length > 0 || anchors.limitationAnchorSections.length > 0)
              ? uniqueBy(
                  [
                    ...anchors.yesNoCoverageScopeAnchorSections,
                    ...anchors.limitationAnchorSections,
                    ...selection.initialPrimarySections,
                  ],
                  (section) => section.id,
                ).slice(0, selection.primaryLimit)
              : anchors.yesNoCoverageAnchorSections.length > 0
                ? uniqueBy([...anchors.yesNoCoverageAnchorSections, ...selection.initialPrimarySections], (section) => section.id).slice(
                    0,
                    selection.primaryLimit,
                  )
                : anchors.notCoveredAnchorSections.length > 0
                  ? uniqueBy([...anchors.notCoveredAnchorSections, ...selection.initialPrimarySections], (section) => section.id).slice(
                      0,
                      selection.primaryLimit,
                    )
                  : selection.initialPrimarySections;
}
