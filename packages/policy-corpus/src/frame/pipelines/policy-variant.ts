import type { AnswerFrame, AnswerFrameRoute, DocumentWithSectionsView } from '../../types.js';
import type { FrameContext } from '../context.js';
import { selectAnswerRoute } from '../../internal/answer-routing.js';
import {
  COVERAGE_AVOID_TERMS,
  FRAME_DOCUMENT_LIMIT,
  SCOPE_SECTION_TERMS,
  buildEmptyAnswerFrame,
  collectPolicyNumbersForQuery,
  normalizeSearchText,
  pickTopDocumentCandidates,
  scoreVariantDocument,
} from '../../internal/shared.js';

export async function buildPolicyVariantFrameForDocuments(
  context: FrameContext,
  query: string,
  candidateDocuments: DocumentWithSectionsView[],
  route: AnswerFrameRoute = selectAnswerRoute(normalizeSearchText(query), 'policy_variant'),
): Promise<AnswerFrame> {
  const queryLower = normalizeSearchText(query);
  if (candidateDocuments.length === 0) {
    return buildEmptyAnswerFrame('policy_variant', route);
  }

  const policyNumbers = collectPolicyNumbersForQuery(query);
  const authoritativeCandidates = candidateDocuments.map((document) =>
    scoreVariantDocument(document, queryLower, policyNumbers),
  );
  const authoritativeDocuments = pickTopDocumentCandidates(authoritativeCandidates);
  const preferredDocumentId = authoritativeDocuments[0]?.id ?? null;
  const preferredDocuments = preferredDocumentId
    ? candidateDocuments.filter((document) => document.id === preferredDocumentId)
    : [];
  const siblingDocuments = preferredDocumentId
    ? candidateDocuments.filter((document) => document.id !== preferredDocumentId)
    : candidateDocuments;
  const primarySections = await context.collectDocumentSectionCandidates(
    preferredDocuments,
    SCOPE_SECTION_TERMS,
    COVERAGE_AVOID_TERMS,
    'Scope/general section from the preferred policy variant.',
  );
  const supportingSections = await context.collectDocumentSectionCandidates(
    siblingDocuments,
    SCOPE_SECTION_TERMS,
    COVERAGE_AVOID_TERMS,
    'Scope/general section from a sibling policy variant for comparison.',
  );

  return {
    questionType: 'policy_variant',
    route,
    authoritativeDocuments,
    primarySections: primarySections.map((candidate) => candidate.section),
    supportingSections: supportingSections.map((candidate) => candidate.section),
    avoidSections: [],
    latestRevision: null,
    variantReasoning: authoritativeDocuments[0]?.reason ?? null,
  };
}

export async function resolvePolicyVariantFrame(
  context: FrameContext,
  query: string,
  route: AnswerFrameRoute = selectAnswerRoute(normalizeSearchText(query), 'policy_variant'),
): Promise<AnswerFrame> {
  const lookupDocuments = await context.collectLookupDocuments(query);
  const candidateDocuments =
    lookupDocuments.length > 0
      ? lookupDocuments
      : await context.collectPolicyDocumentsFromHits(
          query,
          await context.searchSectionsDetailed({ query, topK: 16 }),
          FRAME_DOCUMENT_LIMIT + 1,
        );
  return buildPolicyVariantFrameForDocuments(context, query, candidateDocuments, route);
}
