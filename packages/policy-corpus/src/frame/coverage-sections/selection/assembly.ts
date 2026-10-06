import type { AnswerFrame, AnswerFrameSection } from '../../../types.js';
import {
  FRAME_SUPPORT_LIMIT,
  combineText,
  isTelehealthServiceTableSection,
  scorePhraseMatches,
  uniqueBy,
} from '../../../internal/shared.js';
import type { CoverageQueryFlags } from '../candidates.js';
import type { CoverageSectionGroups } from './groups.js';
import type { CoverageInitialSelection } from './initial-selection.js';
import type { CoverageAnchorSets } from './anchors.js';
import {
  YES_NO_SUPPORTING_SECTION_NUMBERS,
  hasSubstantiveText,
  isEpsdtSpecialProvisionSection,
  isPolicyDescriptionSection,
  isYesNoSupportingTemplateSection,
} from '../structure.js';

// A yes/no frame leads with the description section and up to two search hits.
const YES_NO_PRIMARY_LIMIT = 3;

// --- Stage 5: final assembly ---------------------------------------------------

export function assembleCoverageSections({
  frame,
  flags,
  groups,
  selection,
  anchors,
  yesNoStructure = false,
}: {
  frame: AnswerFrame;
  flags: CoverageQueryFlags;
  groups: CoverageSectionGroups;
  selection: CoverageInitialSelection;
  anchors: CoverageAnchorSets;
  /** The pipeline framed this yes/no question by the policy template's structure. */
  yesNoStructure?: boolean;
}): Pick<AnswerFrame, 'primarySections' | 'supportingSections' | 'avoidSections'> {
  const yesNoSections = yesNoStructure && !hasThemedSections(groups, anchors, flags) ? selectYesNoSections(frame) : null;
  const primarySections = yesNoSections?.primarySections ?? selectCoveragePrimarySections(selection, groups, anchors, flags);
  const rebalancedPrimaryIds = new Set(primarySections.map((section) => section.id));
  const shouldMergeInitialPrimaryIntoSupporting =
    anchors.telehealthAnchorSection != null ||
    flags.notCoveredQuery && anchors.limitationAnchorSections.length > 0 ||
    flags.yesNoCoverageQuery ||
    anchors.notCoveredAnchorSections.length > 0;
  let supportingSections = yesNoSections
    ? yesNoSections.supportingSections
    : shouldMergeInitialPrimaryIntoSupporting
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
    // The EPSDT provision leads the supporting evidence so adult-exclusion
    // answers can cite the under-21 contrast.
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

// The themed branches of selectCoveragePrimarySections (telehealth, general
// eligibility, congregate PCS, ambulance, an explicit "not covered" question)
// keep their own lead sections when they have them, yes/no question or not.
function hasThemedSections(groups: CoverageSectionGroups, anchors: CoverageAnchorSets, flags: CoverageQueryFlags): boolean {
  return (
    anchors.telehealthAnchorSection != null ||
    (flags.eligibilityFrameworkQuery && groups.generalEligibilityAnchorSections.length > 0) ||
    (flags.congregatePcsQuery && (groups.congregateCriteriaSections.length > 0 || groups.congregateServiceSections.length > 0)) ||
    (flags.ambulanceNotCoveredQuery && anchors.ambulanceSpecificNotCoveredSections.length > 0) ||
    (flags.notCoveredQuery && anchors.limitationAnchorSections.length > 0)
  );
}

// Yes/no assembly keeps the pipeline's order and re-ranks nothing: the
// description section first, then the search hits, with the template
// not-covered and covered sections (4.1, 4.2.1, 3.2.1) leading the supporting
// list. Avoid sections stay where they are.
function selectYesNoSections(frame: AnswerFrame): Pick<AnswerFrame, 'primarySections' | 'supportingSections'> {
  const surfaced = uniqueBy([...frame.primarySections, ...frame.supportingSections], (section) => section.id).filter(hasSubstantiveText);
  const primarySections = uniqueBy(
    [
      ...surfaced.filter(isPolicyDescriptionSection),
      ...frame.primarySections.filter(
        (section) => hasSubstantiveText(section) && !isYesNoSupportingTemplateSection(section) && !isEpsdtSpecialProvisionSection(section),
      ),
    ],
    (section) => section.id,
  ).slice(0, YES_NO_PRIMARY_LIMIT);
  const primaryIds = new Set(primarySections.map((section) => section.id));
  const supportingSections = uniqueBy(
    [
      ...YES_NO_SUPPORTING_SECTION_NUMBERS.flatMap((number) => surfaced.filter((section) => section.sectionNumber === number)),
      ...frame.supportingSections.filter(hasSubstantiveText),
      ...frame.primarySections.filter(hasSubstantiveText),
    ],
    (section) => section.id,
  )
    .filter((section) => !primaryIds.has(section.id))
    .slice(0, FRAME_SUPPORT_LIMIT);
  if (primarySections.length > 0 || supportingSections.length === 0) return { primarySections, supportingSections };
  // No description and no other hit: the template section the pipeline ranked
  // first leads, rather than leaving the frame without a primary section.
  const lead = frame.primarySections.find(hasSubstantiveText) ?? supportingSections[0];
  return { primarySections: [lead], supportingSections: supportingSections.filter((section) => section.id !== lead.id) };
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
            : anchors.notCoveredAnchorSections.length > 0
              ? uniqueBy([...anchors.notCoveredAnchorSections, ...selection.initialPrimarySections], (section) => section.id).slice(
                  0,
                  selection.primaryLimit,
                )
              : selection.initialPrimarySections;
}
