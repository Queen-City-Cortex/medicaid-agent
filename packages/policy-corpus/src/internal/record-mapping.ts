import { isValidatedJevRelease, jevHash, parseSectionRoles, sectionRoleInput } from '../jev/section-roles.js';
// Mapping between Neo4j session records and the typed view objects the rest
// of the package works with: retrieval hits, search hits, section/document
// views, and section-context entries. Also holds the shared Cypher RETURN
// fragment for document metadata and the window a section read returns.

import type {
  CorpusRetrievalHit,
  DocumentSectionView,
  DocumentView,
  DocumentWithSectionsView,
  GetSectionOptions,
  SearchHit,
  SectionContextEntry,
  SectionView,
  SessionRecordLike,
} from '../types.js';
import { compareSectionListing } from './base.js';
import { SEARCH_SNIPPET_CHARS, SECTION_WINDOW_CHARS, SECTION_WINDOW_MAX_CHARS } from './scoring-constants.js';

/**
 * Cypher predicate keeping documents the agency tagged Archived out of
 * default retrieval. They stay in the graph: an exact lookup, a required
 * dated source or a direct section read still reaches them.
 */
export function notArchived(alias: string): string {
  return `coalesce(${alias}.archived, false) = false`;
}

/**
 * Cypher sort keys putting the newest amending document first. A DHHS change
 * notice has no date: it orders by the year and sequence of its number
 * ("04-26"), which is comparable only within one manual's series. A clinical
 * revision row has a real date and no number, so its year comes from the
 * date. Every key is coalesced because Cypher sorts null first when
 * descending; a document with neither a number nor a date sorts last.
 * `compareAmendmentRecency` is the same order over mapped views.
 */
export function amendmentRecencyOrder(alias: string): string {
  return `coalesce(${alias}.change_year, toInteger(substring(${alias}.effective_date, 0, 4)), 0) DESC,
           coalesce(${alias}.change_sequence, 0) DESC,
           coalesce(${alias}.effective_date, '') DESC`;
}

/** Reads an optional Cypher integer, which the driver returns as a number or an Integer. */
export function toOptionalInteger(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (value != null && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return null;
}

export function retrievalDocumentMetadataReturn(alias: string): string {
  return `${alias}.authority_tier AS authorityTier,
               ${alias}.answer_role AS answerRole,
               ${alias}.source_format AS sourceFormat,
               ${alias}.answer_ready AS answerReady,
               ${alias}.corpus_bucket AS corpusBucket,
               ${alias}.variant_group AS variantGroup,
               ${alias}.variant_date AS variantDate,
               ${alias}.retrieval_ready AS retrievalReady,`;
}

export function recordToRetrievalHit(record: SessionRecordLike): CorpusRetrievalHit {
  const content = (record.get('content') as string | null | undefined) ?? null;
  return {
    sectionId: record.get('sectionId') as string,
    sectionNumber: (record.get('sectionNumber') as string | null | undefined) ?? null,
    sectionTitle: (record.get('sectionTitle') as string | null | undefined) ?? null,
    documentTitle: (record.get('documentTitle') as string | null | undefined) ?? null,
    documentType: (record.get('documentType') as string | null | undefined) ?? null,
    policyNumber: (record.get('policyNumber') as string | null | undefined) ?? null,
    content,
    score: record.get('score') as number,
    authorityTier: (record.get('authorityTier') as string | null | undefined) ?? null,
    answerRole: (record.get('answerRole') as string | null | undefined) ?? null,
    sourceFormat: (record.get('sourceFormat') as string | null | undefined) ?? null,
    answerReady: (record.get('answerReady') as boolean | null | undefined) ?? null,
    corpusBucket: (record.get('corpusBucket') as string | null | undefined) ?? null,
    variantGroup: (record.get('variantGroup') as string | null | undefined) ?? null,
    variantDate: (record.get('variantDate') as string | null | undefined) ?? null,
    retrievalReady: (record.get('retrievalReady') as boolean | null | undefined) ?? null,
  };
}

export function retrievalHitToSearchHit(hit: CorpusRetrievalHit): SearchHit {
  return {
    sectionId: hit.sectionId,
    title: hit.sectionTitle,
    policyNumber: hit.policyNumber,
    documentType: hit.documentType,
    contentSnippet: hit.content ? hit.content.slice(0, SEARCH_SNIPPET_CHARS) : null,
    score: hit.score,
  };
}

export function mapSectionContextEntry(record: SessionRecordLike): SectionContextEntry {
  return {
    id: record.get('id') as string,
    title: (record.get('title') as string | null | undefined) ?? null,
    sectionNumber: (record.get('sectionNumber') as string | null | undefined) ?? null,
  };
}

/** Reads a Cypher count, which the driver returns as a number or an Integer. */
export function toCount(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value != null && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return 0;
}

export function mapDocumentSections(rawSections: Array<{
  id: string | null;
  number: string | null;
  title: string | null;
  chars?: number | { toNumber(): number } | null;
}>): DocumentSectionView[] {
  return rawSections
    .filter((section) => section.id != null)
    .map((section) => {
      const chars =
        section.chars != null && typeof section.chars === 'object' && 'toNumber' in section.chars
          ? section.chars.toNumber()
          : (section.chars ?? undefined);

      return chars === undefined
        ? {
            id: section.id as string,
            number: section.number,
            title: section.title,
          }
        : {
            id: section.id as string,
            number: section.number,
            title: section.title,
            chars,
          };
    })
    .sort(compareSectionListing);
}

/** The slice of a section's text that one read returns. */
export interface SectionWindow {
  offset: number;
  totalChars: number;
  nextOffset: number | null;
  note: string | null;
}

/** A caller's window as non-negative whole numbers within the ceiling. */
export function sectionWindowRequest(options: GetSectionOptions = {}): { offset: number; length: number } {
  const whole = (value: number | undefined, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
  return {
    offset: whole(options.offset, 0),
    length: Math.min(Math.max(1, whole(options.length, SECTION_WINDOW_CHARS)), SECTION_WINDOW_MAX_CHARS),
  };
}

/**
 * Describes the window [offset, offset + length) of a text of `totalChars`.
 * The next offset comes from these whole numbers, never from the returned
 * string's JavaScript length: Neo4j counts Unicode characters and JavaScript
 * counts UTF-16 units, which differ for characters outside the basic plane.
 */
export function sectionWindow(offset: number, length: number, totalChars: number): SectionWindow {
  const end = Math.min(offset + length, totalChars);
  const nextOffset = end < totalChars ? end : null;
  if (offset === 0 && nextOffset === null) return { offset, totalChars, nextOffset, note: null };
  if (offset >= totalChars) {
    return {
      offset,
      totalChars,
      nextOffset,
      note: `Offset ${offset} is past the end of this text (${totalChars} characters); nothing is shown.`,
    };
  }
  return {
    offset,
    totalChars,
    nextOffset,
    note:
      `Showing characters ${offset}-${end} of ${totalChars}. ` +
      (nextOffset === null ? 'This is the end of the text. ' : `Call getSection with offset=${nextOffset} to read on. `) +
      'Text outside this range has not been read: do not conclude that something is absent from it.',
  };
}

export function buildSectionView(record: SessionRecordLike, content: string | null, window: SectionWindow): SectionView {
  const documentTitle = (record.get('documentTitle') as string | null | undefined) ?? null;
  const url = (record.get('url') as string | null | undefined) ?? null;
  const sourceModifiedDate = (record.get('sourceModifiedDate') as string | null | undefined) ?? null;
  const retrievedAt = (record.get('retrievedAt') as string | null | undefined) ?? null;
  const rawRoles = process.env.JEV_SECTION_ROLES_ENABLED === 'true'
    && isValidatedJevRelease(record.get('releaseId'), record.get('annotationDigest'), record.get('liveAnnotationDigest'))
    ? record.get('sectionRoles') : undefined;
  // The annotation is bound to the whole text, which `content` no longer is.
  const sectionRoles = rawRoles ? parseSectionRoles(rawRoles, jevHash(sectionRoleInput({
    title: (record.get('title') as string) ?? null, sectionNumber: (record.get('sectionNumber') as string) ?? null,
    documentTitle, documentType: (record.get('documentType') as string) ?? null, policyNumber: (record.get('policyNumber') as string) ?? null,
  }, (record.get('roleContent') as string) ?? null))) : undefined;
  return {
    id: record.get('id') as string,
    title: (record.get('title') as string | null | undefined) ?? null,
    sectionNumber: (record.get('sectionNumber') as string | null | undefined) ?? null,
    content,
    contentOffset: window.offset,
    totalChars: window.totalChars,
    nextOffset: window.nextOffset,
    contentNote: window.note,
    ...(sectionRoles ? { sectionRoles } : {}),
    effectiveDate: (record.get('effectiveDate') as string | null | undefined) ?? null,
    ...(sourceModifiedDate !== null ? { sourceModifiedDate } : {}),
    ...(retrievedAt !== null ? { retrievedAt } : {}),
    lastRevised: (record.get('lastRevised') as string | null | undefined) ?? null,
    federalRegisterCite: (record.get('federalRegisterCite') as string | null | undefined) ?? null,
    documentId: (record.get('documentId') as string | null | undefined) ?? null,
    documentTitle,
    documentType: (record.get('documentType') as string | null | undefined) ?? null,
    policyNumber: (record.get('policyNumber') as string | null | undefined) ?? null,
    url,
    citationLink: documentTitle && url ? `[${documentTitle}](${url})` : null,
    status: (record.get('status') as string | null | undefined) ?? null,
    authorityTier: (record.get('authorityTier') as string | null | undefined) ?? null,
    answerRole: (record.get('answerRole') as string | null | undefined) ?? null,
    sourceFormat: (record.get('sourceFormat') as string | null | undefined) ?? null,
    answerReady: (record.get('answerReady') as boolean | null | undefined) ?? null,
    corpusBucket: (record.get('corpusBucket') as string | null | undefined) ?? null,
    variantGroup: (record.get('variantGroup') as string | null | undefined) ?? null,
    variantDate: (record.get('variantDate') as string | null | undefined) ?? null,
    retrievalReady: (record.get('retrievalReady') as boolean | null | undefined) ?? null,
  };
}

export function extractDocumentView(document: DocumentWithSectionsView): DocumentView {
  return {
    id: document.id,
    title: document.title,
    documentType: document.documentType,
    policyNumber: document.policyNumber,
    effectiveDate: document.effectiveDate,
    ...(document.sourceModifiedDate != null ? { sourceModifiedDate: document.sourceModifiedDate } : {}),
    ...(document.retrievedAt != null ? { retrievedAt: document.retrievedAt } : {}),
    url: document.url,
    citationLink: document.citationLink,
    status: document.status,
    authorityTier: document.authorityTier,
    answerRole: document.answerRole,
    sourceFormat: document.sourceFormat,
    answerReady: document.answerReady,
    corpusBucket: document.corpusBucket,
    variantGroup: document.variantGroup,
    variantDate: document.variantDate,
    retrievalReady: document.retrievalReady,
  };
}
