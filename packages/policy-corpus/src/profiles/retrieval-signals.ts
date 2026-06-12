import type { QueryAnalysis, RetrievalBackendName } from '../contracts.js';
import type { SearchSectionsInput } from '../types.js';
import { computePerGroupK, defaultTypeGroupsForQuery } from '../internal/shared.js';

const BASE_BACKENDS: RetrievalBackendName[] = [
  'section_vector',
  'chunk_vector',
  'concept',
  'section_keyword',
  'document_keyword',
  'fulltext',
  'policy_scoped',
];

export interface RetrievalProfileSignals {
  hasExplicitDocumentTypes: boolean;
  typeGroups: string[][];
  perGroupK: number;
  enabledBackends: RetrievalBackendName[];
  profileName: string;
}

export function buildRetrievalProfileSignals(
  input: SearchSectionsInput,
  analysis: QueryAnalysis,
): RetrievalProfileSignals {
  const hasExplicitDocumentTypes = Boolean(input.documentTypes && input.documentTypes.length > 0);
  const typeGroups =
    input.documentTypes && input.documentTypes.length > 0
      ? [input.documentTypes]
      : defaultTypeGroupsForQuery(analysis.normalizedQuery);
  const enabledBackends = [...BASE_BACKENDS];

  if (analysis.searchTerms.length > 0) {
    enabledBackends.push('document_expansion');
  }
  if (analysis.flags.isChangeNoticeQuery) {
    enabledBackends.push('amendment_context');
  }

  return {
    hasExplicitDocumentTypes,
    typeGroups,
    perGroupK: computePerGroupK(Math.round(input.topK ?? 10), hasExplicitDocumentTypes),
    enabledBackends,
    profileName: hasExplicitDocumentTypes
      ? 'explicit_document_types'
      : analysis.flags.isOperationalRoutingQuery
        ? 'operational_hybrid'
        : analysis.flags.isFederalAuthorityQuery
          ? 'federal_hybrid'
          : analysis.flags.isChangeNoticeQuery
            ? 'amendment_hybrid'
            : 'baseline_hybrid',
  };
}
