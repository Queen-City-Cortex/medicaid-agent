import type { AnswerFrame, AnswerFrameDocument, AnswerFrameRoute, AnswerFrameSection, AnswerQuestionType } from '../../types.js';
import {
  FRAME_AVOID_LIMIT,
  FRAME_PRIMARY_LIMIT,
  FRAME_SUPPORT_LIMIT,
  describeLatestRevision,
  extractChangeMarkerValue,
  pickTopDocumentCandidates,
  uniqueBy,
  type DocumentCandidate,
  type HydratedSectionCandidate,
  type SectionCandidate,
} from '../../internal/shared.js';

export interface FinalizeFrameInput {
  questionType: AnswerQuestionType;
  route: AnswerFrameRoute;
  authoritativeCandidates?: DocumentCandidate[];
  primaryCandidates?: SectionCandidate[];
  supportingCandidates?: SectionCandidate[];
  avoidCandidates?: SectionCandidate[];
  variantReasoning?: string | null;
  latestRevisionSections?: AnswerFrameSection[];
}

export function createFrameFinalizer({
  hydrateSectionCandidates,
  collectDocumentsForSections,
}: {
  hydrateSectionCandidates(
    candidates: SectionCandidate[],
    limit: number,
    seenSectionIds?: Set<string>,
  ): Promise<HydratedSectionCandidate[]>;
  collectDocumentsForSections(
    sections: AnswerFrameSection[],
    defaultReason: string,
  ): Promise<DocumentCandidate[]>;
}) {
  const selectLatestRevision = (
    sections: AnswerFrameSection[],
    documents: AnswerFrameDocument[],
  ): AnswerFrame['latestRevision'] => {
    const section = sections.reduce<AnswerFrameSection | null>((latest, candidate) => {
      const latestValue = latest ? extractChangeMarkerValue(describeLatestRevision(latest, null)) : null;
      const candidateValue = extractChangeMarkerValue(describeLatestRevision(candidate, null));
      if (candidateValue === null) return latest;
      if (latestValue === null || candidateValue > latestValue) return candidate;
      return latest;
    }, null);

    const document = documents.find((candidate) => candidate.id === section?.documentId) ?? documents[0] ?? null;
    if (!section && !document) return null;

    return {
      marker: describeLatestRevision(section, document),
      document: document ?? null,
      section: section ?? null,
    };
  };

  const finalizeFrame = async ({
    questionType,
    route,
    authoritativeCandidates = [],
    primaryCandidates = [],
    supportingCandidates = [],
    avoidCandidates = [],
    variantReasoning = null,
    latestRevisionSections = [],
  }: FinalizeFrameInput): Promise<AnswerFrame> => {
    const seenSectionIds = new Set<string>();
    const primarySections = (await hydrateSectionCandidates(primaryCandidates, FRAME_PRIMARY_LIMIT, seenSectionIds)).map(
      (candidate) => candidate.section,
    );
    const supportingSections = (
      await hydrateSectionCandidates(supportingCandidates, FRAME_SUPPORT_LIMIT, seenSectionIds)
    ).map((candidate) => candidate.section);
    // Share the seen-set so a section already selected as primary/supporting
    // can't also ship as an avoid section, and strip content: avoid sections
    // are negative guidance — their full text otherwise occupies model
    // context and counts as supporting evidence in the verifier.
    const avoidSections = (await hydrateSectionCandidates(avoidCandidates, FRAME_AVOID_LIMIT, seenSectionIds)).map(
      (candidate) => ({ ...candidate.section, content: null }),
    );

    const documentCandidates = [
      ...authoritativeCandidates,
      ...(await collectDocumentsForSections(primarySections, 'Document containing primary evidence.')),
      ...(await collectDocumentsForSections(supportingSections, 'Document containing supporting evidence.')),
    ];
    const authoritativeDocuments = pickTopDocumentCandidates(documentCandidates);
    const latestRevision = selectLatestRevision(
      uniqueBy([...latestRevisionSections, ...primarySections, ...supportingSections], (section) => section.id),
      authoritativeDocuments,
    );

    return {
      questionType,
      route,
      authoritativeDocuments,
      primarySections,
      supportingSections,
      avoidSections,
      latestRevision,
      variantReasoning,
    };
  };

  return {
    finalizeFrame,
  };
}
