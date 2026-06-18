import type { AnswerFrameSection } from '../../../types.js';
import {
  CERTIFICATION_SECTION_TERMS,
  GENERAL_CRITERIA_SECTION_TERMS,
  HCWD_INCOME_RULE_TERMS,
  HCWD_PRIMARY_SECTION_TERMS,
  NOT_COVERED_SECTION_TERMS,
  REQUIREMENT_EVIDENCE_TERMS,
  TELEHEALTH_DOCUMENTATION_TERMS,
  TELEHEALTH_PRIMARY_SECTION_TERMS,
  TELEHEALTH_SUPPORT_SECTION_TERMS,
  YES_NO_COVERAGE_SECTION_TERMS,
  combineText,
  isAdministrativeFormTitle,
  isAttachmentTitle,
  isCoverageBoilerplateTitle,
  isCoverageLimitationText,
  isGenericSectionTitle,
  isHcwdProcessTitle,
  isTelehealthServiceTableSection,
  isYearSpecificPremiumTitle,
  normalizeSearchText,
  scorePhraseMatches,
  scoreTermMatches,
} from '../../../internal/shared.js';
import type { CoverageQueryFlags } from '../candidates.js';

export interface CoverageScoredSection {
  section: AnswerFrameSection;
  text: string;
  limitation: boolean;
  primaryScore: number;
  supportScore: number;
}

// --- Stage 1: scoring -------------------------------------------------------

export function scoreCoverageSections(
  surfacedSections: AnswerFrameSection[],
  serviceFocusTerms: string[],
  serviceClusterTerms: string[],
  flags: CoverageQueryFlags,
): CoverageScoredSection[] {
  return surfacedSections.map((section) => scoreCoverageSection(section, serviceFocusTerms, serviceClusterTerms, flags));
}

function scoreCoverageSection(
  section: AnswerFrameSection,
  serviceFocusTerms: string[],
  serviceClusterTerms: string[],
  flags: CoverageQueryFlags,
): CoverageScoredSection {
  const text = combineText(section.title, section.content);
  const focusScore =
    scoreTermMatches(serviceFocusTerms, section.title) + Math.min(scoreTermMatches(serviceFocusTerms, section.content), 4);
  const clusterScore =
    scoreTermMatches(serviceClusterTerms, section.title) +
    Math.min(scoreTermMatches(serviceClusterTerms, section.content), 3);
  const requirementScore = Math.min(scorePhraseMatches(text, REQUIREMENT_EVIDENCE_TERMS, 1), 4);
  const certificationBonus = flags.certificationQuery ? scorePhraseMatches(text, CERTIFICATION_SECTION_TERMS, 1) * 1.1 : 0;
  const generalCriteriaBonus = flags.generalCriteriaQuery ? scorePhraseMatches(text, GENERAL_CRITERIA_SECTION_TERMS, 1) * 1.2 : 0;
  const notCoveredBonus = flags.notCoveredQuery ? scorePhraseMatches(text, NOT_COVERED_SECTION_TERMS, 1) * 1.2 : 0;
  const yesNoCoverageBonus = flags.yesNoCoverageQuery ? scorePhraseMatches(text, YES_NO_COVERAGE_SECTION_TERMS, 1) * 1.3 : 0;
  const telehealthPrimaryBonus = flags.telehealthQuery ? scorePhraseMatches(text, TELEHEALTH_PRIMARY_SECTION_TERMS, 1) * 2.3 : 0;
  const telehealthSupportingBonus = flags.telehealthQuery ? scorePhraseMatches(text, TELEHEALTH_SUPPORT_SECTION_TERMS, 1) * 1.2 : 0;
  const telehealthDocumentationBonus = flags.telehealthQuery
    ? scorePhraseMatches(text, TELEHEALTH_DOCUMENTATION_TERMS, 1) * 1.1
    : 0;
  const telehealthTangentialPenalty = flags.telehealthQuery
    ? scorePhraseMatches(text, flags.telehealthAvoidTerms, 1) * 3.5
    : 0;
  const telehealthTablePenalty =
    flags.telehealthQuery && !flags.telehealthServiceListQuery && isTelehealthServiceTableSection(section) ? 2.8 : 0;
  const hcwdCurrentBonus = flags.hcwdIncomePremiumQuery ? scorePhraseMatches(text, HCWD_PRIMARY_SECTION_TERMS, 1) * 1.3 : 0;
  const hcwdHistoryBonus =
    flags.hcwdIncomePremiumQuery && flags.earnedIncomeLimitQuery ? scorePhraseMatches(text, HCWD_INCOME_RULE_TERMS, 1) * 1.5 : 0;
  const hcwdCurrentDocumentBonus =
    flags.hcwdIncomePremiumQuery && section.policyNumber?.toUpperCase() === 'MA-2180' ? 1.5 : 0;
  const numberedBonus = section.sectionNumber ? 0.5 : 0;
  const limitationBonus = isCoverageLimitationText(text) ? 3 : 0;
  const boilerplatePenalty = isCoverageBoilerplateTitle(section.title) ? 2.5 : 0;
  const attachmentPenalty = isAttachmentTitle(section.title) ? 3 : 0;
  const requestInfoPenalty =
    flags.yesNoCoverageQuery &&
    (
      isAttachmentTitle(section.title) ||
      isGenericSectionTitle(section.title) ||
      normalizeSearchText(section.title).includes('requesting ')
    )
      ? 3.2
      : 0;
  const hcwdHistoricalPrimaryPenalty = flags.hcwdIncomePremiumQuery && section.status === 'amendment' ? 0.9 : 0;
  const hcwdTangentialPenalty =
    flags.hcwdIncomePremiumQuery &&
    (
      isAdministrativeFormTitle(section.title) ||
      isAdministrativeFormTitle(section.documentTitle) ||
      isYearSpecificPremiumTitle(section.title) ||
      isYearSpecificPremiumTitle(section.documentTitle) ||
      isHcwdProcessTitle(section.title) ||
      isHcwdProcessTitle(section.documentTitle)
    )
      ? 2.6
      : 0;

  return {
    section,
    text,
    limitation: isCoverageLimitationText(text),
    primaryScore:
      focusScore * 1.2 +
      clusterScore * 0.8 +
      requirementScore * 0.6 +
      certificationBonus +
      generalCriteriaBonus +
      yesNoCoverageBonus +
      telehealthPrimaryBonus * 1.4 +
      telehealthSupportingBonus * 0.3 +
      telehealthDocumentationBonus * 0.8 +
      hcwdCurrentBonus * 1.1 +
      hcwdHistoryBonus * 0.5 +
      hcwdCurrentDocumentBonus +
      numberedBonus -
      boilerplatePenalty -
      attachmentPenalty -
      requestInfoPenalty -
      telehealthTangentialPenalty -
      telehealthTablePenalty -
      hcwdHistoricalPrimaryPenalty -
      hcwdTangentialPenalty,
    supportScore:
      limitationBonus +
      notCoveredBonus +
      focusScore * 0.6 +
      clusterScore * 0.9 +
      requirementScore * 0.4 +
      certificationBonus * 0.9 +
      yesNoCoverageBonus * 1.1 +
      telehealthPrimaryBonus * 0.8 +
      telehealthSupportingBonus * 1.3 +
      telehealthDocumentationBonus * 1.2 +
      hcwdCurrentBonus * 0.7 +
      hcwdHistoryBonus * 1.3 +
      (section.status === 'amendment' ? 0.5 : 0) +
      numberedBonus -
      boilerplatePenalty -
      attachmentPenalty -
      requestInfoPenalty -
      telehealthTangentialPenalty -
      telehealthTablePenalty -
      hcwdTangentialPenalty,
  };
}
