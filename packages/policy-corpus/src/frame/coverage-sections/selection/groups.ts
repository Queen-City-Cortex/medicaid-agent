import type { AnswerFrameSection } from '../../../types.js';
import {
  CONGREGATE_PCS_CRITERIA_SECTION_TERMS,
  CONGREGATE_PCS_COVERED_SERVICE_SECTION_TERMS,
  CONGREGATE_PCS_NOT_COVERED_SECTION_TERMS,
  combineText,
  includesPhrase,
  isCoverageAdministrativeTitle,
  isCoverageLimitationText,
  isCoverageProcessTitle,
  normalizeSearchText,
  uniqueBy,
} from '../../../internal/shared.js';
import type { CoverageQueryFlags } from '../candidates.js';

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
