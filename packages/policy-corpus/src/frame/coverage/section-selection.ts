import type { AnswerFrame, AnswerFrameSection } from '../../types.js';
import {
  FRAME_SUPPORT_LIMIT,
  combineText,
  isTelehealthServiceTableSection,
  scorePhraseMatches,
  uniqueBy,
} from '../../internal/shared.js';
import type { CoverageQueryFlags } from './flags.js';
import type { CoverageAnchorSets } from './anchors.js';
import type { CoverageInitialSelection } from './initial-selection.js';
import type { CoverageSectionGroups } from './rebalance-support.js';

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
