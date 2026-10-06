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

// The state groups a federal-authority search keeps beside the federal ones.
// Beneficiary guidance stays out of the federal path.
const FEDERAL_QUERY_STATE_TYPE_GROUPS = BASE_TYPE_GROUPS.filter(
  (group) => !group.some((documentType) => documentType.startsWith('federal_') || documentType === 'beneficiary_guidance'),
);

export function defaultTypeGroupsForQuery(queryLower: string): string[][] {
  if (isFederalAuthorityQuery(queryLower)) {
    // Additive: federal sources lead, and every state group keeps its own
    // per-group budget. The federal flag is a lexical guess; when it is wrong
    // (an income limit quoted against the federal poverty level, say) the
    // state rule must still be retrievable.
    const groups = [['federal_regulation'], ['federal_statute'], ...FEDERAL_QUERY_STATE_TYPE_GROUPS];
    if (isMlrQuery(queryLower) || isManagedCareOperationsQuery(queryLower)) {
      groups.push(['managed_care_contract']);
    }
    return groups;
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
