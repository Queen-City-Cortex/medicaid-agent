import type { AnswerFrame, AnswerFrameDocument, AnswerFrameSection } from '../../types.js';
import {
  asksForAuthorityCitation,
  asksForPublicNoticeDetails,
  isWaiverApplicationQuery,
  isWaiverAuthorityQuery,
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

// Distinct from WAIVER_HINT (application process) — WAIVER_AUTHORITY_HINT
// handles questions like "what federal regulation authorizes 1915(c) HCBS
// waivers?" that should route to the 42 CFR Part 441 Subpart G implementing
// regulations (§§ 441.300–441.310) rather than 42 CFR § 430.25 which is only
// a cross-reference into Part 441. Matches on 1915(c) + authority/authorize
// phrasing so it doesn't over-fire on general 1915(b) managed-care questions.
const WAIVER_AUTHORITY_HINT: FederalQueryHint = {
  id: 'waiver-authority',
  // Delegates to the shared predicate so the collection path and this hint
  // can't drift (the hint used to duplicate the regex inline and missed the
  // plural "federal regulations" phrasing the predicate now accepts).
  matches: (q) => isWaiverAuthorityQuery(q),
  isPrimary: (section) => {
    const policy = policyNumberUpper(section);
    if (policy !== '42-CFR-441') return false;
    const sn = normalizeSearchText(section.sectionNumber);
    if (!sn.startsWith('441.')) return false;
    const num = Number.parseFloat(sn);
    return Number.isFinite(num) && num >= 441.300 && num <= 441.310;
  },
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
    // CFR subsections are strings, not decimals: parseFloat conflated
    // 441.50x/441.5xx (Subpart K, Community First Choice) with 441.50.
    if (policy !== '42-CFR-441') return false;
    const sub = sn.match(/^441\.(\d+)/)?.[1];
    if (!sub || sub.length !== 2) return false;
    const subNum = Number.parseInt(sub, 10);
    return subNum >= 50 && subNum <= 62;
  },
};

// MLR and generic "managed care federal" hints were considered but left out:
// the existing MLR test suite asserts that 438.74 (MLR reports, enforcement)
// accompany 438.8 (standards) in the primary+supporting mix, and a generic
// 42-CFR-438 whitelist would either over-include (438.510 QRS) or strip those
// supporting sections. The current upstream MLR handling already produces the
// right frame; SPA and EPSDT are where the v5 failures concentrated.
// Order matters: WAIVER_AUTHORITY_HINT ("what authorizes 1915(c) waivers?")
// must run before WAIVER_HINT ("how does a state submit a waiver?") because
// the authority phrasing is a narrower predicate — otherwise the broader
// application-process hint wins on questions like q-046.
const FEDERAL_QUERY_HINTS: readonly FederalQueryHint[] = [
  WAIVER_AUTHORITY_HINT,
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

  const hintScopedPrimarySections =
    hintPrimarySections.length > 0
      ? hintPrimarySections.slice(0, FRAME_PRIMARY_LIMIT)
      : frame.primarySections;
  // Statute retention for authority questions: the hints' isPrimary
  // predicates are regulation-only, so they would strip the statute section
  // that collection paired in. Keep one surfaced federal_statute section in
  // primary (replacing the last slot when already at the limit).
  const statuteSection = asksForAuthorityCitation(queryLower)
    ? surfacedSections.find((section) => section.documentType === 'federal_statute')
    : undefined;
  const primarySections =
    statuteSection && !hintScopedPrimarySections.some((section) => section.documentType === 'federal_statute')
      ? uniqueBy(
          [
            ...(hintScopedPrimarySections.length >= FRAME_PRIMARY_LIMIT
              ? hintScopedPrimarySections.slice(0, FRAME_PRIMARY_LIMIT - 1)
              : hintScopedPrimarySections),
            statuteSection,
          ],
          (section) => section.id,
        )
      : hintScopedPrimarySections;
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
