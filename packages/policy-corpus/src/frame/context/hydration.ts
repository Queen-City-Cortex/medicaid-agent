import type { LegalPrimitiveService } from '../../contracts.js';
import type {
  AnswerFrameSection,
  DocumentWithSectionsView,
} from '../../types.js';
import {
  FRAME_DOCUMENT_LIMIT,
  FRAME_SUPPORT_LIMIT,
  dedupeTerms,
  extractDocumentView,
  pickDocumentSectionsByTitle,
  pickLikelyCoverageLimitationSections,
  toAnswerFrameSection,
  uniqueBy,
  type DocumentCandidate,
  type HydratedSectionCandidate,
  type SectionCandidate,
} from '../../internal/shared.js';

export function createFrameHydrationHelpers({
  getSection,
  getDocument,
}: {
  getSection: LegalPrimitiveService['getSection'];
  getDocument: LegalPrimitiveService['getDocument'];
}) {
  const hydrateSectionCandidates = async (
    candidates: SectionCandidate[],
    limit: number,
    seenSectionIds: Set<string> = new Set(),
  ): Promise<HydratedSectionCandidate[]> => {
    const hydrated: HydratedSectionCandidate[] = [];
    for (const candidate of candidates) {
      if (seenSectionIds.has(candidate.sectionId)) continue;
      const section = await getSection(candidate.sectionId);
      if (!section) continue;
      seenSectionIds.add(candidate.sectionId);
      hydrated.push({ section: toAnswerFrameSection(section, candidate.reason) });
      if (hydrated.length >= limit) break;
    }
    return hydrated;
  };

  const collectDocumentsForSections = async (
    sections: AnswerFrameSection[],
    defaultReason: string,
  ): Promise<DocumentCandidate[]> => {
    const documentIds = dedupeTerms(
      sections
        .map((section) => section.documentId)
        .filter((documentId): documentId is string => Boolean(documentId)),
    );
    const documents = await Promise.all(documentIds.map((documentId) => getDocument(documentId)));
    return documents
      .filter((document): document is DocumentWithSectionsView => document != null)
      .map((document) => ({
        document: extractDocumentView(document),
        reason: defaultReason,
        score: 0.5,
      }));
  };

  const collectDocumentsForSectionIds = async (
    sectionIds: string[],
    limit = FRAME_DOCUMENT_LIMIT,
  ): Promise<DocumentWithSectionsView[]> => {
    const documents = await Promise.all(
      dedupeTerms(sectionIds)
        .slice(0, limit)
        .map(async (sectionId) => {
          const section = await getSection(sectionId);
          if (!section?.documentId) return null;
          return getDocument(section.documentId);
        }),
    );

    return uniqueBy(
      documents.filter((document): document is DocumentWithSectionsView => document != null),
      (document) => document.id,
    );
  };

  const collectDocumentSectionCandidates = async (
    documents: DocumentWithSectionsView[],
    includeTerms: readonly string[],
    avoidTerms: readonly string[],
    reason: string,
    limit = FRAME_SUPPORT_LIMIT,
  ): Promise<HydratedSectionCandidate[]> => {
    const sectionIds = dedupeTerms(
      documents.flatMap((document) => pickDocumentSectionsByTitle(document, includeTerms, avoidTerms, limit)),
    );
    const hydrated: HydratedSectionCandidate[] = [];
    for (const sectionId of sectionIds) {
      const section = await getSection(sectionId);
      if (!section) continue;
      hydrated.push({ section: toAnswerFrameSection(section, reason) });
      if (hydrated.length >= limit) break;
    }
    return hydrated;
  };

  const collectLikelyCoverageLimitationSectionCandidates = async (
    documents: DocumentWithSectionsView[],
    reason: string,
    limit = FRAME_SUPPORT_LIMIT,
  ): Promise<HydratedSectionCandidate[]> => {
    const sectionIds = dedupeTerms(
      documents.flatMap((document) => pickLikelyCoverageLimitationSections(document, limit)),
    );
    const hydrated: HydratedSectionCandidate[] = [];
    for (const sectionId of sectionIds) {
      const section = await getSection(sectionId);
      if (!section) continue;
      hydrated.push({ section: toAnswerFrameSection(section, reason) });
      if (hydrated.length >= limit) break;
    }
    return hydrated;
  };

  const toSectionCandidates = (hydrated: HydratedSectionCandidate[]): SectionCandidate[] =>
    hydrated.map((candidate) => ({
      sectionId: candidate.section.id,
      reason: candidate.section.reason ?? 'Document-title matched section.',
    }));

  return {
    hydrateSectionCandidates,
    collectDocumentsForSections,
    collectDocumentsForSectionIds,
    collectDocumentSectionCandidates,
    collectLikelyCoverageLimitationSectionCandidates,
    toSectionCandidates,
  };
}
