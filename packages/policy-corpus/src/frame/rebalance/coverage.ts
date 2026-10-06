import type { AnswerFrame, AnswerFrameSection } from '../../types.js';
import { buildCoverageQueryFlags } from '../coverage-sections/candidates.js';
import {
  assembleCoverageSections,
  buildCoverageAnchors,
  buildCoverageInitialSelection,
  collectCoverageSectionGroups,
  scoreCoverageSections,
} from '../coverage-sections/selection.js';
import { hasSubstantiveText, isContainerRead, isNumberedUnder } from '../coverage-sections/structure.js';
import {
  uniqueBy,
} from '../../internal/shared.js';

// Avoid sections are negative guidance: they ship as headings only. The
// pipeline hands them over with their text so that the stages below can
// judge it, and a section promoted out of the avoid list keeps its body.
function stripAvoidContent(frame: AnswerFrame): AnswerFrame {
  return { ...frame, avoidSections: frame.avoidSections.map((section) => ({ ...section, content: null })) };
}

export function rebalanceCoverageFrame(
  frame: AnswerFrame,
  queryLower: string,
  serviceFocusTerms: string[],
  serviceClusterTerms: string[],
  yesNoStructure = false,
): AnswerFrame {
  // A section with nothing to read (no body, a placeholder, a lone list stem)
  // cannot be evidence, so it is never a candidate for a primary or
  // supporting slot.
  const selected = selectCoverageSections(
    {
      ...frame,
      primarySections: frame.primarySections.filter(hasSubstantiveText),
      supportingSections: frame.supportingSections.filter(hasSubstantiveText),
    },
    queryLower,
    serviceFocusTerms,
    serviceClusterTerms,
    yesNoStructure,
  );
  // A heading read through the sections under it repeats their text. When one
  // of those sections is placed too, the heading is dropped. Its slot is left
  // empty: selecting again would fill it from the avoid list.
  const placed = [...selected.primarySections, ...selected.supportingSections];
  const keep = (section: AnswerFrameSection) =>
    !(
      isContainerRead(section) &&
      placed.some((other) => other.documentId === section.documentId && isNumberedUnder(other, section))
    );
  return stripAvoidContent({
    ...selected,
    primarySections: selected.primarySections.filter(keep),
    supportingSections: selected.supportingSections.filter(keep),
  });
}

function selectCoverageSections(
  frame: AnswerFrame,
  queryLower: string,
  serviceFocusTerms: string[],
  serviceClusterTerms: string[],
  yesNoStructure: boolean,
): AnswerFrame {
  const surfacedSections = uniqueBy(
    [...frame.primarySections, ...frame.supportingSections, ...frame.avoidSections.filter(hasSubstantiveText)],
    (section) => section.id,
  );
  if (surfacedSections.length === 0) return { ...frame, primarySections: [], supportingSections: [] };

  const flags = buildCoverageQueryFlags(queryLower);
  const groups = collectCoverageSectionGroups(surfacedSections, flags);
  // The EPSDT provision of an adult frame is placed by assembly, first among
  // the supporting sections. It is not ranked for a primary slot.
  const epsdtIds = new Set(groups.epsdtExceptionSections.map((section) => section.id));
  const rankedSections = surfacedSections.filter((section) => !epsdtIds.has(section.id));
  const scored = scoreCoverageSections(rankedSections, serviceFocusTerms, serviceClusterTerms, flags);
  const selection = buildCoverageInitialSelection({
    scored,
    serviceFocusTerms,
    flags,
  });
  const anchors = buildCoverageAnchors({
    surfacedSections: rankedSections,
    flags,
    selection,
  });
  const { primarySections, supportingSections, avoidSections } = assembleCoverageSections({
    frame,
    flags,
    groups,
    selection,
    anchors,
    yesNoStructure,
  });

  return {
    ...frame,
    primarySections,
    supportingSections,
    avoidSections,
  };
}
