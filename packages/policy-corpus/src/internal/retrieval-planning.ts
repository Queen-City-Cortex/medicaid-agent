// Retrieval planning helpers: which document-type groups a query should scan,
// the federal-implementation document types and section terms for federal
// authority questions, per-group K sizing, and policy-number collection from
// the raw query. These shape the retrieval profile before any backend runs.

import { normalizeSearchText } from './base.js';
import {
  extractAliasedPolicyNumbers,
  extractExplicitPolicyNumbers,
  isFederalAuthorityQuery,
  isManagedCareOperationsQuery,
  isMlrQuery,
  isOperationalRoutingQuery,
} from './query-intent.js';
import { dedupeTerms } from './search.js';
import {
  BASE_TYPE_GROUPS,
  DEFAULT_PER_GROUP_MULTIPLIER,
  EXPLICIT_PER_GROUP_MULTIPLIER,
  MAX_PER_GROUP_K,
  MIN_DEFAULT_PER_GROUP_K,
  MIN_EXPLICIT_PER_GROUP_K,
  OPERATIONAL_TYPE_GROUPS,
} from './scoring-constants.js';
import {
  FEDERAL_SUPPORT_TERMS,
  GENERAL_CRITERIA_SECTION_TERMS,
  MLR_IMPLEMENTATION_SUPPORT_TERMS,
  SCOPE_SECTION_TERMS,
} from './term-lists.js';

export function defaultTypeGroupsForQuery(queryLower: string): string[][] {
  if (isFederalAuthorityQuery(queryLower)) {
    return [
      ['federal_regulation'],
      ['federal_statute'],
      federalImplementationDocumentTypes(queryLower),
    ];
  }

  return isOperationalRoutingQuery(queryLower)
    ? [...BASE_TYPE_GROUPS, ...OPERATIONAL_TYPE_GROUPS]
    : BASE_TYPE_GROUPS;
}

export function federalImplementationDocumentTypes(queryLower: string): string[] {
  const documentTypes = ['state_plan_amendment', 'dhhs_policy', 'clinical_policy', 'waiver', 'provider_manual'];
  if (isMlrQuery(queryLower) || isManagedCareOperationsQuery(queryLower)) {
    documentTypes.push('managed_care_contract');
  }
  return documentTypes;
}

export function buildFederalImplementationSectionTerms(queryLower: string, focusTerms: string[]): string[] {
  const terms = [
    ...SCOPE_SECTION_TERMS,
    ...GENERAL_CRITERIA_SECTION_TERMS,
    ...FEDERAL_SUPPORT_TERMS,
    ...focusTerms,
    'waiver',
  ];
  if (isManagedCareOperationsQuery(queryLower)) {
    terms.push('managed care', 'contract', 'contractor');
  }
  if (isMlrQuery(queryLower)) {
    terms.push(...MLR_IMPLEMENTATION_SUPPORT_TERMS);
  }
  return dedupeTerms(terms);
}

export function computePerGroupK(topK: number, hasExplicitDocumentTypes: boolean): number {
  const multiplier = hasExplicitDocumentTypes ? EXPLICIT_PER_GROUP_MULTIPLIER : DEFAULT_PER_GROUP_MULTIPLIER;
  const minimum = hasExplicitDocumentTypes ? MIN_EXPLICIT_PER_GROUP_K : MIN_DEFAULT_PER_GROUP_K;
  return Math.min(Math.max(topK * multiplier, minimum), MAX_PER_GROUP_K);
}

export function collectPolicyNumbersForQuery(query: string): string[] {
  const queryLower = normalizeSearchText(query);
  const aliasedPolicyNumbers = isFederalAuthorityQuery(queryLower) ? [] : extractAliasedPolicyNumbers(queryLower);
  return dedupeTerms([...extractExplicitPolicyNumbers(query), ...aliasedPolicyNumbers]);
}
