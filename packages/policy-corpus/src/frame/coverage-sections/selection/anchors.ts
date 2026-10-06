import type { AnswerFrameSection } from '../../../types.js';
import {
  combineText,
  includesPhrase,
  isAttachmentTitle,
  isCoverageLimitationText,
  isCoverageProcessTitle,
  normalizeSearchText,
  scorePhraseMatches,
  sectionNumberDepth,
  uniqueBy,
} from '../../../internal/shared.js';
import type { CoverageQueryFlags } from '../candidates.js';
import type { CoverageScoredSection } from './scoring.js';
import type { CoverageInitialSelection } from './initial-selection.js';

// --- Stage 4: anchors ---------------------------------------------------------

export interface CoverageAnchorSets {
  notCoveredAnchorSections: AnswerFrameSection[];
  limitationAnchorSections: AnswerFrameSection[];
  ambulanceSpecificNotCoveredSections: AnswerFrameSection[];
  ambulanceCoverageContrastSections: AnswerFrameSection[];
  ambulanceGeneralExclusionSections: AnswerFrameSection[];
  telehealthAnchorSection: AnswerFrameSection | null;
}

export function buildCoverageAnchors({
  surfacedSections,
  flags,
  selection,
}: {
  surfacedSections: AnswerFrameSection[];
  flags: CoverageQueryFlags;
  selection: CoverageInitialSelection;
}): CoverageAnchorSets {
  const generalLimitationPrimaryScored =
    flags.notCoveredQuery
      ? uniqueBy(
          surfacedSections
            .filter((section) => {
              const text = combineText(section.sectionNumber, section.title, section.content);
              return (
                !isAttachmentTitle(section.title) &&
                !isCoverageProcessTitle(section.title) &&
                isCoverageLimitationText(text) &&
                (
                  normalizeSearchText(section.title).includes('general') ||
                  normalizeSearchText(section.sectionNumber) === '4.1' ||
                  sectionNumberDepth(section.sectionNumber) <= 2
                )
              );
            })
            .sort((left, right) => {
              const leftGeneral =
                normalizeSearchText(left.title).includes('general') || normalizeSearchText(left.sectionNumber) === '4.1';
              const rightGeneral =
                normalizeSearchText(right.title).includes('general') || normalizeSearchText(right.sectionNumber) === '4.1';
              if (leftGeneral !== rightGeneral) return leftGeneral ? -1 : 1;
              return sectionNumberDepth(left.sectionNumber) - sectionNumberDepth(right.sectionNumber);
            })
            .map((section) => ({
              section,
              primaryScore: 0,
              supportScore: 0,
              text: combineText(section.title, section.content),
              limitation: true,
            })),
          (entry) => entry.section.id,
        )
      : [];
  const specificLimitationPrimaryScored =
    flags.notCoveredQuery
      ? uniqueBy(
          surfacedSections
            .filter((section) => {
              const text = combineText(section.sectionNumber, section.title, section.content);
              return (
                !isAttachmentTitle(section.title) &&
                !isCoverageProcessTitle(section.title) &&
                isCoverageLimitationText(text) &&
                (
                  sectionNumberDepth(section.sectionNumber) >= 3 ||
                  includesPhrase(normalizeSearchText(section.title), [
                    'specific',
                    'other non-covered',
                    'other noncovered',
                    'room and board',
                    'comfort or convenience',
                  ])
                )
              );
            })
            .sort((left, right) => sectionNumberDepth(right.sectionNumber) - sectionNumberDepth(left.sectionNumber))
            .map((section) => ({
              section,
              primaryScore: 0,
              supportScore: 0,
              text: combineText(section.title, section.content),
              limitation: true,
            })),
          (entry) => entry.section.id,
        )
      : [];
  const notCoveredAnchorSections = flags.notCoveredQuery
    ? selection.notCoveredPrimaryScored
        .sort((left, right) => right.supportScore - left.supportScore)
        .slice(0, selection.primaryLimit)
        .map((entry) => entry.section)
    : [];
  const generalLimitationAnchorSections = flags.notCoveredQuery
    ? generalLimitationPrimaryScored
        .sort((left, right) => right.supportScore - left.supportScore)
        .slice(0, 1)
        .map((entry) => entry.section)
    : [];
  const specificLimitationAnchorSections = flags.notCoveredQuery
    ? specificLimitationPrimaryScored
        .sort((left, right) => right.supportScore - left.supportScore)
        .slice(0, 1)
        .map((entry) => entry.section)
    : [];
  const limitationAnchorSections = uniqueBy(
    [...specificLimitationAnchorSections, ...generalLimitationAnchorSections],
    (section) => section.id,
  );
  const ambulanceSpecificNotCoveredSections = flags.ambulanceNotCoveredQuery
    ? uniqueBy(
        surfacedSections.filter((section) => {
          const text = combineText(section.title, section.content);
          return (
            includesPhrase(text, ['other non-covered ambulance services', 'other non-covered', 'other noncovered']) ||
            normalizeSearchText(section.sectionNumber) === '4.2.1.4'
          );
        }),
        (section) => section.id,
      )
    : [];
  const ambulanceCoverageContrastSections = flags.ambulanceNotCoveredQuery
    ? uniqueBy(
        surfacedSections.filter((section) =>
          includesPhrase(combineText(section.title, section.content), ['air medical ambulance', 'air ambulance']),
        ),
        (section) => section.id,
      )
    : [];
  const ambulanceGeneralExclusionSections = flags.ambulanceNotCoveredQuery
    ? uniqueBy(
        surfacedSections.filter((section) =>
          includesPhrase(combineText(section.title, section.content), ['general criteria not covered']),
        ),
        (section) => section.id,
      )
    : [];
  const telehealthAnchorSection = flags.telehealthQuery
    ? (
        findTopScoredSection(selection.telehealthPrimaryScored) ??
        surfacedSections.find(
          (section) => scorePhraseMatches(normalizeSearchText(section.title), ['telehealth', 'telemedicine'], 1) > 0,
        ) ??
        null
      )
    : null;

  return {
    notCoveredAnchorSections,
    limitationAnchorSections,
    ambulanceSpecificNotCoveredSections,
    ambulanceCoverageContrastSections,
    ambulanceGeneralExclusionSections,
    telehealthAnchorSection,
  };
}

function findTopScoredSection(entries: CoverageScoredSection[]): AnswerFrameSection | null {
  return entries.sort((left, right) => right.primaryScore - left.primaryScore)[0]?.section ?? null;
}
