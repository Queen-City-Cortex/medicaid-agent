import type { AnswerFrame, AnswerFrameDocument, AnswerFrameSection } from '../../types.js';
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

// Federal-authority rebalance hints. Each entry describes a category of federal
// question and which sections should be promoted to primary + which should be
// pushed to avoid. The waiver hint preserves the pre-existing behavior; new
// entries handle SPA-timeliness, EPSDT, MLR, and managed-care-federal queries
// so they don't drift into 42 CFR 457 (CHIP) or procedural notice parts.
interface FederalQueryHint {
  id: string;
  matches: (queryLower: string) => boolean;
  isPrimary: (section: AnswerFrameSection) => boolean;
  isAvoid?: (section: AnswerFrameSection) => boolean;
  // When true, procedural/public-notice sections should only surface if the
  // query explicitly asks for public notice. Currently only the waiver hint
  // needs this lever.
  suppressProceduralUnlessPublicNotice?: boolean;
}

function policyNumberUpper(section: AnswerFrameSection): string {
  return (section.policyNumber ?? '').toUpperCase();
}

function isFederalSection(section: AnswerFrameSection): boolean {
  return section.documentType?.startsWith('federal_') === true;
}

const WAIVER_HINT: FederalQueryHint = {
  id: 'waiver-application',
  matches: (q) => isWaiverApplicationQuery(q),
  isPrimary: (section) => {
    const text = combineText(section.sectionNumber, section.title, section.content, section.documentTitle);
    const sectionNumber = normalizeSearchText(section.sectionNumber);
    return (
      isFederalSection(section) &&
      !includesPhrase(text, WAIVER_APPLICATION_AVOID_TERMS) &&
      (sectionNumber.startsWith('441.30') || sectionNumber === '440.180')
    );
  },
  isAvoid: (section) =>
    includesPhrase(
      combineText(section.sectionNumber, section.title, section.content, section.documentTitle),
      [...WAIVER_APPLICATION_AVOID_TERMS, '431.408'],
    ),
  suppressProceduralUnlessPublicNotice: true,
};

const SPA_HINT: FederalQueryHint = {
  id: 'spa-timeliness',
  matches: (q) =>
    /\bplan amendment/.test(q) ||
    /\bspa\b/.test(q) ||
    (/\b(submit|submission|timeliness|deadline)\b/.test(q) && /\bplan\b/.test(q)),
  isPrimary: (section) => {
    const policy = policyNumberUpper(section);
    const sn = normalizeSearchText(section.sectionNumber);
    return policy === '42-CFR-430' && sn.startsWith('430.');
  },
};

const EPSDT_HINT: FederalQueryHint = {
  id: 'epsdt-federal',
  matches: (q) => /\bepsdt\b/.test(q) || /\bearly and periodic screening\b/.test(q),
  isPrimary: (section) => {
    const policy = policyNumberUpper(section);
    const sn = normalizeSearchText(section.sectionNumber);
    // EPSDT implementing regs live in 42 CFR 441 Subpart B (§§ 441.50–441.62).
    if (policy !== '42-CFR-441' || !sn.startsWith('441.')) return false;
    const num = Number.parseFloat(sn);
    return Number.isFinite(num) && num >= 441.5 && num < 441.63;
  },
};

// MLR and generic "managed care federal" hints were considered but left out:
// the existing MLR test suite asserts that 438.74 (MLR reports, enforcement)
// accompany 438.8 (standards) in the primary+supporting mix, and a generic
// 42-CFR-438 whitelist would either over-include (438.510 QRS) or strip those
// supporting sections. The current upstream MLR handling already produces the
// right frame; SPA and EPSDT are where the v5 failures concentrated.
const FEDERAL_QUERY_HINTS: readonly FederalQueryHint[] = [
  WAIVER_HINT,
  SPA_HINT,
  EPSDT_HINT,
];

export function rebalanceFederalAuthorityFrame(frame: AnswerFrame, queryLower: string): AnswerFrame {
  const surfacedSections = uniqueBy(
    [...frame.primarySections, ...frame.supportingSections, ...frame.avoidSections],
    (section) => section.id,
  );
  if (surfacedSections.length === 0) return frame;

  const matchingHint = FEDERAL_QUERY_HINTS.find((hint) => hint.matches(queryLower));
  if (!matchingHint) return frame;

  const publicNoticeQuery = asksForPublicNoticeDetails(queryLower);

  const hintPrimarySections = uniqueBy(
    surfacedSections.filter((section) => matchingHint.isPrimary(section)),
    (section) => section.id,
  );
  const proceduralSections = matchingHint.isAvoid
    ? uniqueBy(surfacedSections.filter((section) => matchingHint.isAvoid!(section)), (section) => section.id)
    : [];
  const implementationSections = uniqueBy(
    surfacedSections.filter((section) => section.documentType && !section.documentType.startsWith('federal_')),
    (section) => section.id,
  );

  const primarySections =
    hintPrimarySections.length > 0
      ? hintPrimarySections.slice(0, FRAME_PRIMARY_LIMIT)
      : frame.primarySections;
  const primaryIds = new Set(primarySections.map((section) => section.id));

  const includeProceduralInSupport =
    !matchingHint.suppressProceduralUnlessPublicNotice || publicNoticeQuery;

  const supportingSections = uniqueBy(
    [
      ...implementationSections,
      ...frame.supportingSections,
      ...(includeProceduralInSupport ? proceduralSections : []),
    ],
    (section) => section.id,
  )
    .filter(
      (section) =>
        !primaryIds.has(section.id) &&
        (includeProceduralInSupport || !proceduralSections.some((candidate) => candidate.id === section.id)),
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
