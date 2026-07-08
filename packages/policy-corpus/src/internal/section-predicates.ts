// Predicates that classify a section, title, or retrieval hit by its textual
// role: boilerplate, attachment, prior-auth criteria vs. process, telehealth
// service tables, HCWD administrative forms, pediatric policy text, and the
// like. Each predicate is a pure function over text/term-list matching; the
// rerank scorer and frame pipelines use them to boost or avoid sections.

import type { AnswerFrameSection, CorpusRetrievalHit } from '../types.js';
import { combineText, includesPhrase, normalizeSearchText, normalizeTitleKey } from './base.js';
import { dedupeTerms } from './search.js';
import {
  BOILERPLATE_SECTION_TITLES,
  PEDIATRIC_POLICY_TERMS,
  PRIOR_AUTH_CRITERIA_SECTION_TERMS,
  PRIOR_AUTH_EXCEPTION_SECTION_TERMS,
  PRIOR_AUTH_PROCESS_SECTION_TERMS,
  PRIOR_AUTH_QUANTITY_TERMS,
  TITLE_CLUSTER_STOPWORDS,
} from './term-lists.js';

export function buildHitText(hit: CorpusRetrievalHit): string {
  return combineText(hit.sectionTitle, hit.documentTitle, hit.policyNumber, hit.content);
}

export function isPediatricPolicyHit(hit: CorpusRetrievalHit): boolean {
  return includesPhrase(buildHitText(hit), PEDIATRIC_POLICY_TERMS);
}

export function isTitleOnlySection(section: Pick<AnswerFrameSection, 'content'>): boolean {
  return (section.content?.trim().length ?? 0) === 0;
}

export function isPriorAuthQuantitySection(section: AnswerFrameSection): boolean {
  // Topical match only — this used to also hardcode section number 5.4.3
  // (Policy 9's quantity-limits section), coupling retrieval to one specific
  // policy's table of contents.
  const text = combineText(section.sectionNumber, section.title, section.content);
  return includesPhrase(text, PRIOR_AUTH_QUANTITY_TERMS);
}

export function isPriorAuthCriteriaSection(section: AnswerFrameSection): boolean {
  return includesPhrase(combineText(section.sectionNumber, section.title, section.content), PRIOR_AUTH_CRITERIA_SECTION_TERMS);
}

export function isPriorAuthProcessSection(section: AnswerFrameSection): boolean {
  return includesPhrase(combineText(section.sectionNumber, section.title, section.content), PRIOR_AUTH_PROCESS_SECTION_TERMS);
}

export function isPriorAuthExceptionSection(section: AnswerFrameSection): boolean {
  return normalizeSearchText(section.sectionNumber) === '3.2.3'
    || includesPhrase(combineText(section.sectionNumber, section.title, section.content), PRIOR_AUTH_EXCEPTION_SECTION_TERMS);
}

export function extractTitleClusterTerms(title: string | null | undefined): string[] {
  const tokens = normalizeSearchText(title).match(/[a-z0-9]+/g) ?? [];
  return dedupeTerms(
    tokens.filter((token) => token.length >= 4 && !TITLE_CLUSTER_STOPWORDS.has(token)),
  );
}

export function isCoverageLimitationText(text: string): boolean {
  return includesPhrase(text, ['not covered', 'limitation', 'limitations', 'exclusion']);
}

export function isCoverageBoilerplateTitle(title: string | null | undefined): boolean {
  const normalized = normalizeSearchText(title);
  return (
    isBoilerplateTitle(title ?? null) ||
    normalized.startsWith('i understand') ||
    normalized.startsWith('i agree') ||
    normalized.startsWith('revision information')
  );
}

export function isBoilerplateTitle(title: string | null): boolean {
  return BOILERPLATE_SECTION_TITLES.has(normalizeTitleKey(title));
}

export function isAttachmentTitle(title: string | null): boolean {
  return normalizeTitleKey(title).startsWith('attachment ');
}

export function isGenericSectionTitle(title: string | null): boolean {
  const normalized = normalizeTitleKey(title);
  return normalized === 'related clinical coverage policies' || normalized === 'information';
}

export function isCoverageProcessTitle(title: string | null | undefined): boolean {
  const normalized = normalizeSearchText(title);
  return (
    normalized.includes('assessment') ||
    normalized.includes('admission') ||
    normalized.includes('expedited') ||
    normalized.includes('reconsideration') ||
    normalized.includes('request') ||
    normalized.includes('appeal') ||
    normalized.includes('submission') ||
    normalized.includes('authorization process')
  );
}

export function isCoverageAdministrativeTitle(title: string | null | undefined): boolean {
  const normalized = normalizeSearchText(title);
  return (
    normalized.includes('claim reimbursement') ||
    normalized.includes('provider requirement') ||
    normalized.includes('qualified providers') ||
    normalized.includes('appointed case management entity') ||
    normalized.includes('mandated requirements') ||
    normalized.includes('service authorization')
  );
}

export function isTelehealthServiceTableSection(section: AnswerFrameSection): boolean {
  const text = combineText(section.title, section.content);
  return (
    includesPhrase(text, ['telehealth eligible service', 'speech/language evaluation', 'speech/language treatment']) &&
    !section.sectionNumber
  );
}

export function includesCalendarYear(text: string | null | undefined): boolean {
  return /\b20\d{2}\b/.test(normalizeSearchText(text));
}

export function isAdministrativeFormTitle(title: string | null | undefined): boolean {
  const normalized = normalizeSearchText(title);
  if (normalized.includes('change notice')) {
    return false;
  }
  return (
    normalized.includes('notice') ||
    normalized.includes('authorization') ||
    normalized.includes('application checklist') ||
    normalized.includes('release authorization')
  );
}

export function isHcwdProcessTitle(title: string | null | undefined): boolean {
  const normalized = normalizeSearchText(title);
  return (
    normalized.includes('determine if a premium is due') ||
    normalized.includes('notification of premium due') ||
    normalized.includes('payment/collection') ||
    normalized.includes('payment received') ||
    normalized.includes('payment status') ||
    normalized.includes('premium invoices') ||
    normalized.includes('updated procedures')
  );
}

export function isYearSpecificPremiumTitle(title: string | null | undefined): boolean {
  const normalized = normalizeSearchText(title);
  return normalized.includes('premium') && includesCalendarYear(normalized);
}

export function isOperationalSourceHit(hit: CorpusRetrievalHit): boolean {
  return (
    hit.answerRole === 'billing' ||
    hit.answerRole === 'reimbursement' ||
    hit.answerRole === 'managed_care' ||
    hit.answerRole === 'managed_care_contract'
  );
}

// ── Waiver section-number predicates ─────────────────────────────────────────
// "Which CFR sections are waiver-primary" deliberately differs by phase, and
// the Subpart G/H split is the reason:
//   Subpart G (§§ 441.300–.310) implements 1915(c) — the authority behind
//   NC's CAP/DA and Innovations waivers. Subpart H (§§ 441.350–.365) is the
//   parallel-numbered application process for 1915(d) waivers (age 65+),
//   which NC does not operate.
// Collection anchoring and the rerank scorer's curated
// WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS set (term-lists.ts) therefore
// cast wide across BOTH subparts — golden question q-045 expects § 441.351 as
// *supporting* evidence for Part 441 waiver-application questions — while the
// rebalance hints promote only Subpart G (+ § 440.180) to *primary*, so
// 1915(d) sections can never displace the 1915(c) citation NC questions need.

/** The 1915 waiver statute itself (SSA Title XIX § 1915). */
export function isSsaWaiverStatuteHit(hit: {
  policyNumber?: string | null;
  sectionNumber?: string | null;
}): boolean {
  return (
    hit.policyNumber?.toUpperCase() === 'SSA-TITLE-19' &&
    normalizeSearchText(hit.sectionNumber) === '1915'
  );
}

/** Evidence-anchoring range: 42 CFR 441 Subparts G and H (§§ 441.30x, 441.35x)
 *  — both 1915(c) and the parallel 1915(d) application sections, so Subpart H
 *  can surface as supporting evidence. Takes a normalizeSearchText()-normalized
 *  section number. */
export function isWaiverAuthorityAnchorSectionNumber(sectionNumber: string): boolean {
  return /^441\.(30\d|35\d)$/.test(sectionNumber);
}

/** 1915(c) HCBS implementing regulations, 42 CFR 441 Subpart G only
 *  (§§ 441.300–441.310) — authority questions must never cite the 1915(d)
 *  subpart. Takes a normalized section number. */
export function isWaiverAuthorityImplementingSectionNumber(sectionNumber: string): boolean {
  if (!sectionNumber.startsWith('441.')) return false;
  const num = Number.parseFloat(sectionNumber);
  return Number.isFinite(num) && num >= 441.300 && num <= 441.310;
}

/** Waiver-application rebalance primaries: §§ 441.30x plus § 440.180.
 *  Deliberately no Subpart H — 1915(d) sections rank as supporting evidence
 *  via the rerank set, never as the primary citation. Takes a normalized
 *  section number. */
export function isWaiverApplicationRebalanceSectionNumber(sectionNumber: string): boolean {
  return sectionNumber.startsWith('441.30') || sectionNumber === '440.180';
}
