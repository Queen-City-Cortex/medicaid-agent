import type { AnswerFrameSection } from '../../../types.js';
import {
  FRAME_PRIMARY_LIMIT,
  FRAME_SUPPORT_LIMIT,
  NOT_COVERED_SECTION_TERMS,
  TELEHEALTH_PRIMARY_SECTION_TERMS,
  YES_NO_COVERAGE_SECTION_TERMS,
  combineText,
  isAdministrativeFormTitle,
  isAttachmentTitle,
  isGenericSectionTitle,
  isHcwdProcessTitle,
  isTelehealthServiceTableSection,
  isYearSpecificPremiumTitle,
  normalizeSearchText,
  scorePhraseMatches,
  uniqueBy,
} from '../../../internal/shared.js';
import type { CoverageQueryFlags } from '../candidates.js';
import type { CoverageScoredSection } from './scoring.js';

// --- Stage 3: initial selection ----------------------------------------------

export interface CoverageInitialSelection {
  primaryLimit: number;
  yesNoCoveragePrimaryScored: CoverageScoredSection[];
  notCoveredPrimaryScored: CoverageScoredSection[];
  telehealthPrimaryScored: CoverageScoredSection[];
  initialPrimarySections: AnswerFrameSection[];
  initialSupportingSections: AnswerFrameSection[];
}

export function buildCoverageInitialSelection({
  scored,
  serviceFocusTerms,
  flags,
}: {
  scored: CoverageScoredSection[];
  serviceFocusTerms: string[];
  flags: CoverageQueryFlags;
}): CoverageInitialSelection {
  const primaryLimit =
    flags.certificationQuery || flags.eligibilityFrameworkQuery
      ? FRAME_PRIMARY_LIMIT
      : serviceFocusTerms.length > 0
        ? 2
        : FRAME_PRIMARY_LIMIT;

  const preferredPrimaryScored = scored.filter((entry) => {
    const text = combineText(entry.section.title, entry.section.content);
    if (entry.limitation && !flags.yesNoCoverageQuery && !flags.notCoveredQuery) return false;
    if ((flags.generalCriteriaQuery || flags.notCoveredQuery) && isAttachmentTitle(entry.section.title)) return false;
    if (flags.telehealthQuery && scorePhraseMatches(text, flags.telehealthAvoidTerms, 1) > 0) return false;
    if (flags.telehealthQuery && !flags.telehealthServiceListQuery && isTelehealthServiceTableSection(entry.section)) return false;
    if (
      flags.yesNoCoverageQuery &&
      (
        isAttachmentTitle(entry.section.title) ||
        isGenericSectionTitle(entry.section.title) ||
        normalizeSearchText(entry.section.title).includes('requesting ')
      )
    ) {
      return false;
    }
    return true;
  });

  const yesNoCoveragePrimaryScored = flags.yesNoCoverageQuery
    ? preferredPrimaryScored.filter((entry) => scorePhraseMatches(entry.text, YES_NO_COVERAGE_SECTION_TERMS, 1) > 0)
    : [];
  const notCoveredPrimaryScored = flags.notCoveredQuery
    ? preferredPrimaryScored.filter(
        (entry) =>
          entry.limitation ||
          scorePhraseMatches(entry.text, NOT_COVERED_SECTION_TERMS, 1) > 0,
      )
    : [];
  const telehealthPrimaryScored = flags.telehealthQuery
    ? preferredPrimaryScored.filter(
        (entry) => scorePhraseMatches(normalizeSearchText(entry.section.title), TELEHEALTH_PRIMARY_SECTION_TERMS, 1) > 0,
      )
    : [];
  const hcwdCurrentPrimaryScored =
    flags.hcwdIncomePremiumQuery
      ? preferredPrimaryScored.filter(
          (entry) =>
            entry.section.status !== 'amendment' &&
            entry.section.status !== 'proposed' &&
            !isYearSpecificPremiumTitle(entry.section.title) &&
            !isYearSpecificPremiumTitle(entry.section.documentTitle) &&
            !isAdministrativeFormTitle(entry.section.title) &&
            !isAdministrativeFormTitle(entry.section.documentTitle) &&
            !isHcwdProcessTitle(entry.section.title) &&
            !isHcwdProcessTitle(entry.section.documentTitle),
        )
      : [];
  const basePrimaryScored =
    hcwdCurrentPrimaryScored.length > 0
      ? hcwdCurrentPrimaryScored
      : preferredPrimaryScored.length > 0
        ? preferredPrimaryScored
        : scored.filter((entry) => !entry.limitation);

  const initialPrimarySections = telehealthPrimaryScored.length > 0
    ? uniqueBy(
        [
          ...telehealthPrimaryScored.sort((left, right) => right.primaryScore - left.primaryScore).slice(0, 1),
          ...basePrimaryScored.sort((left, right) => right.primaryScore - left.primaryScore),
        ],
        (entry) => entry.section.id,
      )
        .slice(0, primaryLimit)
        .map((entry) => entry.section)
    : basePrimaryScored
        .sort((left, right) => right.primaryScore - left.primaryScore)
        .slice(0, primaryLimit)
        .map((entry) => entry.section);
  const primaryIds = new Set(initialPrimarySections.map((section) => section.id));
  const preferredSupportingScored = hcwdCurrentPrimaryScored.length > 0
    ? scored.filter(
        (entry) =>
          !primaryIds.has(entry.section.id) &&
          !isYearSpecificPremiumTitle(entry.section.title) &&
          !isYearSpecificPremiumTitle(entry.section.documentTitle) &&
          !isAdministrativeFormTitle(entry.section.title) &&
          !isAdministrativeFormTitle(entry.section.documentTitle) &&
          !isHcwdProcessTitle(entry.section.title) &&
          !isHcwdProcessTitle(entry.section.documentTitle),
      )
    : scored.filter((entry) => {
        if (primaryIds.has(entry.section.id)) return false;
        if (flags.telehealthQuery && scorePhraseMatches(combineText(entry.section.title, entry.section.content), flags.telehealthAvoidTerms, 1) > 0) {
          return false;
        }
        if (flags.telehealthQuery && !flags.telehealthServiceListQuery && isTelehealthServiceTableSection(entry.section)) {
          return false;
        }
        if (
          flags.yesNoCoverageQuery &&
          (
            isAttachmentTitle(entry.section.title) ||
            isGenericSectionTitle(entry.section.title) ||
            normalizeSearchText(entry.section.title).includes('requesting ')
          )
        ) {
          return false;
        }
        return true;
      });
  const initialSupportingSections = (preferredSupportingScored.length > 0
    ? preferredSupportingScored
    : scored.filter((entry) => !primaryIds.has(entry.section.id)))
    .sort((left, right) => right.supportScore - left.supportScore)
    .slice(0, FRAME_SUPPORT_LIMIT)
    .map((entry) => entry.section);

  return {
    primaryLimit,
    yesNoCoveragePrimaryScored,
    notCoveredPrimaryScored,
    telehealthPrimaryScored,
    initialPrimarySections,
    initialSupportingSections,
  };
}
