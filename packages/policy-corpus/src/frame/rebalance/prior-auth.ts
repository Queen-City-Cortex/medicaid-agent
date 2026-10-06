import type { AnswerFrame, AnswerFrameSection } from '../../types.js';
import {
  FRAME_PRIMARY_LIMIT,
  FRAME_SUPPORT_LIMIT,
  combineText,
  includesPhrase,
  isPharmacyQuantityPriorAuthQuery,
  isPriorAuthCriteriaSection,
  isPriorAuthExceptionSection,
  isPriorAuthProcessSection,
  isPriorAuthQuantitySection,
  isTitleOnlySection,
  asksForPriorAuthSubmissionProcess,
  uniqueBy,
} from '../../internal/shared.js';

export function rebalancePriorAuthFrame(frame: AnswerFrame, queryLower: string): AnswerFrame {
  const surfacedSections = uniqueBy(
    [...frame.primarySections, ...frame.supportingSections, ...frame.avoidSections],
    (section) => section.id,
  );
  if (surfacedSections.length === 0) return frame;

  const pharmacyQuantityQuery = isPharmacyQuantityPriorAuthQuery(queryLower);
  const submissionProcessQuery = asksForPriorAuthSubmissionProcess(queryLower);
  const quantitySections = pharmacyQuantityQuery
    ? uniqueBy(surfacedSections.filter((section) => isPriorAuthQuantitySection(section)), (section) => section.id)
    : [];
  const contentfulCriteriaSections = uniqueBy(
    surfacedSections.filter((section) => isPriorAuthCriteriaSection(section) && !isTitleOnlySection(section)),
    (section) => section.id,
  );
  const titleOnlyCriteriaSections = uniqueBy(
    surfacedSections.filter((section) => isPriorAuthCriteriaSection(section) && isTitleOnlySection(section)),
    (section) => section.id,
  );
  const processSections = uniqueBy(
    surfacedSections.filter((section) => isPriorAuthProcessSection(section)),
    (section) => section.id,
  );
  const exceptionSections = pharmacyQuantityQuery
    ? uniqueBy(surfacedSections.filter((section) => isPriorAuthExceptionSection(section)), (section) => section.id)
    : [];
  const generalPriorAuthSections = uniqueBy(
    surfacedSections.filter((section) => {
      const text = combineText(section.sectionNumber, section.title, section.content);
      return (
        includesPhrase(text, ['5.1 prior authorization', 'requirements for and limitations on coverage']) &&
        !isPriorAuthProcessSection(section) &&
        !isPriorAuthCriteriaSection(section) &&
        !isPriorAuthExceptionSection(section)
      );
    }),
    (section) => section.id,
  );
  const quantityRelevantSupportingSections = pharmacyQuantityQuery
    ? uniqueBy(
        surfacedSections.filter((section) => {
          const text = combineText(section.sectionNumber, section.title, section.content);
          return (
            isPriorAuthCriteriaSection(section) ||
            isPriorAuthQuantitySection(section) ||
            includesPhrase(text, ['5.0 requirements for and limitations on coverage', '5.1 prior authorization'])
          );
        }),
        (section) => section.id,
      )
    : [];
  const demoteProcessSections = !submissionProcessQuery;

  const removeDemotedProcessSections = (sections: AnswerFrameSection[]): AnswerFrameSection[] =>
    demoteProcessSections
      ? sections.filter((section) => !processSections.some((candidate) => candidate.id === section.id))
      : sections;

  if (!pharmacyQuantityQuery) {
    const primarySections = removeDemotedProcessSections(frame.primarySections);
    const primaryIds = new Set(primarySections.map((section) => section.id));
    const supportingSections = removeDemotedProcessSections(frame.supportingSections).filter(
      (section) => !primaryIds.has(section.id),
    );
    const surfacedIds = new Set([...primaryIds, ...supportingSections.map((section) => section.id)]);
    return {
      ...frame,
      primarySections,
      supportingSections,
      avoidSections: withoutText(
        uniqueBy([...frame.avoidSections, ...processSections], (section) => section.id).filter(
          (section) => !surfacedIds.has(section.id),
        ),
      ),
    };
  }

  const primarySections = uniqueBy(
    [
      ...quantitySections,
      ...contentfulCriteriaSections,
      ...removeDemotedProcessSections(frame.primarySections).filter(
        (section) =>
          !exceptionSections.some((candidate) => candidate.id === section.id) &&
          !titleOnlyCriteriaSections.some((candidate) => candidate.id === section.id),
      ),
    ],
    (section) => section.id,
  ).slice(0, FRAME_PRIMARY_LIMIT);
  const primaryIds = new Set(primarySections.map((section) => section.id));
  const supportingSections = uniqueBy(
    [
      ...titleOnlyCriteriaSections,
      ...quantityRelevantSupportingSections,
      ...generalPriorAuthSections,
    ],
    (section) => section.id,
  )
    .filter(
      (section) =>
        !primaryIds.has(section.id) &&
        !exceptionSections.some((candidate) => candidate.id === section.id),
    )
    .slice(0, FRAME_SUPPORT_LIMIT);
  const surfacedIds = new Set([...primaryIds, ...supportingSections.map((section) => section.id)]);
  const avoidSections = uniqueBy(
    [...frame.avoidSections, ...processSections, ...exceptionSections],
    (section) => section.id,
  ).filter((section) => !surfacedIds.has(section.id));

  return {
    ...frame,
    primarySections,
    supportingSections,
    avoidSections: withoutText(avoidSections),
  };
}

// Avoid sections are negative guidance and ship without text, including a
// process section rebalance moves out of the primary or supporting list.
function withoutText(sections: AnswerFrameSection[]): AnswerFrameSection[] {
  return sections.map((section) => ({ ...section, content: null }));
}
