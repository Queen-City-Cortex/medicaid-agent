import {
  asksForImplementation,
  asksForPublicNoticeDetails,
  buildFocusedFederalQuery,
  buildFederalImplementationSectionTerms,
  buildQueryFocusTerms,
  extractQuotedPhrases,
  isMlrQuery,
  isWaiverApplicationQuery,
  isWaiverAuthorityQuery,
  normalizeSearchText,
} from '../../internal/shared.js';
import type { FederalAuthoritySignals } from './types.js';

export function buildFederalAuthoritySignals(query: string): FederalAuthoritySignals {
  const queryLower = normalizeSearchText(query);
  const focusTerms = buildQueryFocusTerms(query);

  return {
    queryLower,
    waiverApplicationQuery: isWaiverApplicationQuery(queryLower),
    waiverAuthorityQuery: isWaiverAuthorityQuery(queryLower),
    publicNoticeQuery: asksForPublicNoticeDetails(queryLower),
    mlrQuery: isMlrQuery(queryLower),
    implementationQuery: asksForImplementation(queryLower),
    focusTerms,
    quotedPhrases: extractQuotedPhrases(query),
    implementationSectionTerms: buildFederalImplementationSectionTerms(queryLower, focusTerms),
    focusedFederalQuery: buildFocusedFederalQuery(query),
  };
}
