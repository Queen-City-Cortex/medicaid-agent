// Change-notice marker parsing. DHHS change notices carry "Change No. NN-YY"
// markers in section/document titles; these helpers extract a sortable numeric
// value (year*100 + notice number) so "latest change notice" questions can
// rank revisions, plus the revision-header title test and the latest-revision
// description used by amendment frames.

import type { CorpusRetrievalHit, DocumentView, SectionView } from '../types.js';
import { normalizeSearchText } from './base.js';

export function extractChangeMarkerValue(text: string | null | undefined): number | null {
  const normalized = normalizeSearchText(text);
  if (!normalized) return null;

  const match =
    normalized.match(/\bchange(?:\s+notice)?(?:\s+no\.?)?\s*(\d{1,2})-(\d{2,4})\b/) ??
    normalized.match(/\b(\d{1,2})-(\d{2,4})\b/);
  if (!match) return null;

  const noticeNumber = Number.parseInt(match[1] ?? '', 10);
  const yearPart = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(noticeNumber) || !Number.isFinite(yearPart)) return null;

  const normalizedYear = yearPart < 100 ? 2000 + yearPart : yearPart;
  return normalizedYear * 100 + noticeNumber;
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
