import type { AnswerFrame, AnswerFrameDocument } from '../../types.js';
import {
  asksForPublicNoticeDetails,
  isWaiverApplicationQuery,
} from '../../internal/query-intent.js';
import {
  FRAME_PRIMARY_LIMIT,
  FRAME_SUPPORT_LIMIT,
  WAIVER_APPLICATION_AVOID_TERMS,
  combineText,
  dedupeTerms,
  includesPhrase,
  normalizeSearchText,
  uniqueBy,
} from '../../internal/shared.js';

export function rebalanceFederalAuthorityFrame(frame: AnswerFrame, queryLower: string): AnswerFrame {
  const surfacedSections = uniqueBy(
    [...frame.primarySections, ...frame.supportingSections, ...frame.avoidSections],
    (section) => section.id,
  );
  if (surfacedSections.length === 0) return frame;

  const waiverApplicationQuery = isWaiverApplicationQuery(queryLower);
  const publicNoticeQuery = asksForPublicNoticeDetails(queryLower);
  if (!waiverApplicationQuery) return frame;

  const waiverPrimarySections = uniqueBy(
    surfacedSections.filter((section) => {
      const text = combineText(section.sectionNumber, section.title, section.content, section.documentTitle);
      const sectionNumber = normalizeSearchText(section.sectionNumber);
      return (
        section.documentType?.startsWith('federal_') &&
        !includesPhrase(text, WAIVER_APPLICATION_AVOID_TERMS) &&
        (
          sectionNumber.startsWith('441.30') ||
          sectionNumber === '440.180'
        )
      );
    }),
    (section) => section.id,
  );
  const proceduralSections = uniqueBy(
    surfacedSections.filter((section) =>
      includesPhrase(combineText(section.sectionNumber, section.title, section.content, section.documentTitle), [
        ...WAIVER_APPLICATION_AVOID_TERMS,
        '431.408',
      ]),
    ),
    (section) => section.id,
  );
  const implementationSections = uniqueBy(
    surfacedSections.filter((section) => section.documentType && !section.documentType.startsWith('federal_')),
    (section) => section.id,
  );

  const primarySections =
    waiverPrimarySections.length > 0
      ? waiverPrimarySections.slice(0, FRAME_PRIMARY_LIMIT)
      : frame.primarySections;
  const primaryIds = new Set(primarySections.map((section) => section.id));
  const supportingSections = uniqueBy(
    [
      ...implementationSections,
      ...frame.supportingSections,
      ...(publicNoticeQuery ? proceduralSections : []),
    ],
    (section) => section.id,
  )
    .filter(
      (section) =>
        !primaryIds.has(section.id) &&
        (publicNoticeQuery || !proceduralSections.some((candidate) => candidate.id === section.id)),
    )
    .slice(0, FRAME_SUPPORT_LIMIT);
  const surfacedIds = new Set([...primaryIds, ...supportingSections.map((section) => section.id)]);
  const primaryDocumentIds = dedupeTerms(
    primarySections.map((section) => section.documentId).filter((documentId): documentId is string => Boolean(documentId)),
  );
  const authoritativeDocuments = uniqueBy(
    [
      ...primaryDocumentIds
        .map((documentId) => frame.authoritativeDocuments.find((document) => document.id === documentId))
        .filter((document): document is AnswerFrameDocument => document != null),
      ...frame.authoritativeDocuments,
    ],
    (document) => document.id,
  );

  return {
    ...frame,
    authoritativeDocuments,
    primarySections,
    supportingSections,
    avoidSections: uniqueBy([...frame.avoidSections, ...proceduralSections], (section) => section.id).filter(
      (section) => !surfacedIds.has(section.id),
    ),
  };
}
