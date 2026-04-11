import type { AnswerFrame } from '../../types.js';
import { buildCoverageQueryFlags } from '../coverage/flags.js';
import { collectCoverageSectionGroups, scoreCoverageSections } from '../coverage/rebalance-support.js';
import { buildCoverageInitialSelection } from '../coverage/initial-selection.js';
import { buildCoverageAnchors } from '../coverage/anchors.js';
import { assembleCoverageSections } from '../coverage/section-selection.js';
import {
  uniqueBy,
} from '../../internal/shared.js';

export function rebalanceCoverageFrame(
  frame: AnswerFrame,
  queryLower: string,
  serviceFocusTerms: string[],
  serviceClusterTerms: string[],
): AnswerFrame {
  const surfacedSections = uniqueBy(
    [...frame.primarySections, ...frame.supportingSections, ...frame.avoidSections],
    (section) => section.id,
  );
  if (surfacedSections.length === 0) return frame;

  const flags = buildCoverageQueryFlags(queryLower);
  const groups = collectCoverageSectionGroups(surfacedSections, flags);
  const scored = scoreCoverageSections(surfacedSections, serviceFocusTerms, serviceClusterTerms, flags);
  const selection = buildCoverageInitialSelection({
    scored,
    serviceFocusTerms,
    flags,
  });
  const anchors = buildCoverageAnchors({
    surfacedSections,
    groups,
    flags,
    selection,
  });
  const { primarySections, supportingSections, avoidSections } = assembleCoverageSections({
    frame,
    flags,
    groups,
    selection,
    anchors,
  });

  return {
    ...frame,
    primarySections,
    supportingSections,
    avoidSections,
  };
}
