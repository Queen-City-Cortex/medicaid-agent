import type { FrameContext } from '../context.js';
import {
  CONTRACT_ROLE_BOOST,
  FRAME_DOCUMENT_LIMIT,
  federalImplementationDocumentTypes,
  filterHitsToFocusedContent,
  selectPreferredDocumentTitlesByFocus,
  uniqueBy,
} from '../../internal/shared.js';
import type { FederalAuthoritySignals, FederalImplementationEvidence } from './types.js';

export async function collectFederalImplementationEvidence(
  context: FrameContext,
  query: string,
  signals: FederalAuthoritySignals,
): Promise<FederalImplementationEvidence> {
  const implementationLookupDocuments = signals.implementationQuery
    ? await context.collectImplementationLookupDocuments(query)
    : [];
  const implementationHits = signals.implementationQuery
    ? await context.searchSectionsDetailed({
        query,
        topK: signals.mlrQuery ? 8 : 6,
        documentTypes: federalImplementationDocumentTypes(signals.queryLower),
      })
    : [];
  const focusedImplementationHits = filterHitsToFocusedContent(
    implementationHits,
    signals.focusTerms,
    signals.quotedPhrases,
  );
  const rankedImplementationHits = (
    signals.mlrQuery
      ? focusedImplementationHits.map((hit) =>
          hit.answerRole === 'managed_care_contract'
            ? {
                ...hit,
                score: hit.score + CONTRACT_ROLE_BOOST,
              }
            : hit,
        )
      : focusedImplementationHits
  ).sort((left, right) => right.score - left.score);
  const preferredImplementationDocumentTitles = selectPreferredDocumentTitlesByFocus(
    rankedImplementationHits,
    signals.focusTerms,
    signals.quotedPhrases,
    signals.mlrQuery ? 2 : 1,
    0.08,
  );
  const scopedImplementationHits =
    preferredImplementationDocumentTitles.length === 0
      ? rankedImplementationHits
      : (() => {
          const scoped = rankedImplementationHits.filter(
            (hit) => hit.documentTitle && preferredImplementationDocumentTitles.includes(hit.documentTitle),
          );
          return scoped.length > 0 ? scoped : rankedImplementationHits;
        })();
  const implementationDocuments = uniqueBy(
    [
      ...implementationLookupDocuments,
      ...(await context.collectDocumentsForSectionIds(
        scopedImplementationHits.map((hit) => hit.sectionId),
        FRAME_DOCUMENT_LIMIT,
      )),
    ],
    (document) => document.id,
  );

  return {
    scopedImplementationHits,
    implementationDocuments,
  };
}
