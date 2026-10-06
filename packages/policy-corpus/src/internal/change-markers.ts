// Change-notice marker parsing. DHHS manuals and change notices carry a change
// number "NN-YY" in section and document titles; these helpers extract a
// sortable numeric value (year*100 + notice number) so "latest change notice"
// questions can rank revisions, plus the revision-header title test and the
// latest-revision description used by amendment frames.

import type { CorpusRetrievalHit, DocumentView, SectionView } from '../types.js';
import { normalizeSearchText } from './base.js';

// One pattern for every header family measured on the corpus: "CHANGE NO.
// 04-26", "CHANGE NOTICE 04-10", "CHANGE NOTICE FOR MANUAL(S)[,] NO[.:]
// 09-21", "CHANGE NOTICE FOR MANUAL 01-14", "Current Change Notice: 06-24"
// and "ISSUED 01/01/11-CHANGE 24-10". The number must follow the word
// "change": a bare "NN-NN" also read age bands ("Ages 18-64"), SPA numbers
// and the month and day of ISO dates as change numbers.
const CHANGE_MARKER_RE = /\bchange\s+(?:no\b|notice\b(?:\s+for\s+manuals?)?)?[\s.,:]*(?:no\b[\s.:]*)?(\d{1,2})-(\d{2})(?!\d)/;

/**
 * `maxYear` defaults to next year: a later year is a misread or a misprint,
 * and would otherwise win every "latest" comparison.
 */
export function extractChangeMarkerValue(
  text: string | null | undefined,
  maxYear = new Date().getFullYear() + 1,
): number | null {
  const match = normalizeSearchText(text).match(CHANGE_MARKER_RE);
  if (!match) return null;

  const noticeNumber = Number.parseInt(match[1], 10);
  const year = 2000 + Number.parseInt(match[2], 10);
  if (year > maxYear) return null;
  return year * 100 + noticeNumber;
}

export function changeMarkerValueForHit(hit: CorpusRetrievalHit): number | null {
  return extractChangeMarkerValue(hit.sectionTitle) ?? extractChangeMarkerValue(hit.documentTitle);
}

export function isRevisionHeaderTitle(title: string | null): boolean {
  const normalized = normalizeSearchText(title);
  return normalized.includes('change no.') || normalized.includes('change no') || normalized.includes('revised');
}

export function describeLatestRevision(section: SectionView | null, document: DocumentView | null): string | null {
  return section?.title ?? document?.title ?? null;
}
