// Numeric scoring weights, boosts, penalties, limits, and document-type
// groupings used across retrieval and answer-frame construction. This module
// is the single place to tune how much each ranking signal is worth; it holds
// no logic beyond the vector-overscan helper that is derived directly from the
// overscan constants.

export const SEARCH_SNIPPET_CHARS = 300;
export const CONCEPT_MATCH_SCORE = 0.7;
export const FULLTEXT_BOOST = 0.05;
// Neo4j's vector index cannot pre-filter: queryNodes(k) returns the GLOBAL
// top-k, and a WHERE afterwards only filters that same pool. Per-type-group
// (or per-policy) coverage requires overscanning the index and filtering the
// deeper pool down to the group's top-k.
export const VECTOR_OVERSCAN_FACTOR = 8;
export const VECTOR_OVERSCAN_MAX = 200;

export function vectorScanK(perGroupK: number): number {
  return Math.min(VECTOR_OVERSCAN_MAX, Math.max(perGroupK * VECTOR_OVERSCAN_FACTOR, perGroupK));
}
export const BASE_TYPE_GROUPS = [
  ['clinical_policy'],
  ['dhhs_policy'],
  ['federal_regulation'],
  ['federal_statute'],
  ['bulletin', 'state_plan_amendment', 'waiver', 'provider_manual'],
  // Last, so existing groups keep winning exact-score ties in the hit merge.
  // A supporting-tier family: no boost or penalty is keyed on it.
  ['beneficiary_guidance'],
];
export const OPERATIONAL_TYPE_GROUPS = [
  ['fee_schedule'],
  ['billing_guidance'],
  ['managed_care_guidance', 'managed_care_contract'],
];
// One getSection read returns a window of a section's text. The default is
// the size a read has always had; the maximum lets ten full windows fit the
// verifier's default evidence budget (120,000 characters) with their headers.
export const SECTION_WINDOW_CHARS = 6000;
export const SECTION_WINDOW_MAX_CHARS = 12000;
// A heading with no text of its own is read as the sections under it, at
// most this many (a flat container can hold thousands) and this many levels
// down.
export const CONTAINER_SECTION_LIMIT = 100;
export const CONTAINER_SECTION_DEPTH = 3;
export const MAX_PER_GROUP_K = 100;
export const MIN_DEFAULT_PER_GROUP_K = 25;
export const MIN_EXPLICIT_PER_GROUP_K = 15;
export const DEFAULT_PER_GROUP_MULTIPLIER = 4;
export const EXPLICIT_PER_GROUP_MULTIPLIER = 3;
export const TITLE_TERM_MATCH_BOOST = 0.03;
export const DOCUMENT_TERM_MATCH_BOOST = 0.02;
export const CONTENT_TERM_MATCH_BOOST = 0.005;
export const POLICY_NUMBER_MATCH_BOOST = 0.12;
export const FEDERAL_AUTHORITY_BOOST = 0.08;
export const NON_FEDERAL_AUTHORITY_PENALTY = 0.08;
export const CHANGE_NOTICE_BOOST = 0.08;
export const BOILERPLATE_TITLE_PENALTY = 0.18;
export const DOCUMENT_KEYWORD_BASE_SCORE = 0.45;
export const DOCUMENT_KEYWORD_DOC_WEIGHT = 0.03;
export const DOCUMENT_KEYWORD_SECTION_WEIGHT = 0.015;
export const DOCUMENT_KEYWORD_DOC_LIMIT = 6;
export const SECTION_KEYWORD_BASE_SCORE = 0.35;
export const SECTION_KEYWORD_WEIGHT = 0.015;
export const AMENDMENT_CONTEXT_BASE_SCORE = 0.82;
export const AMENDMENT_CONTEXT_DOC_WEIGHT = 0.03;
export const AMENDMENT_CONTEXT_SECTION_WEIGHT = 0.04;
export const AMENDMENT_CONTEXT_DOC_LIMIT = 5;
export const POLICY_SCOPED_BASE_SCORE = 0.55;
export const POLICY_SCOPED_SECTION_WEIGHT = 0.02;
export const EXACT_POLICY_NUMBER_BOOST = 0.2;
export const DOCUMENT_COVERAGE_TERM_BOOST = 0.01;
export const DOCUMENT_COVERAGE_HIT_BOOST = 0.02;
export const MAX_DOCUMENT_COVERAGE_BOOST = 0.16;
export const DOCUMENT_EXPANSION_BASE_SCORE = 0.58;
export const DOCUMENT_EXPANSION_SECTION_WEIGHT = 0.02;
export const DOCUMENT_EXPANSION_DOC_LIMIT = 8;
export const CHANGE_NOTICE_HEADER_BASE_SCORE = 1.04;
export const CHANGE_NOTICE_HEADER_SECTION_WEIGHT = 0.06;
export const ATTACHMENT_TITLE_PENALTY = 0.12;
export const GENERIC_SECTION_TITLE_PENALTY = 0.14;
export const COVERAGE_EXCLUSION_BOOST = 0.08;
export const IMPLEMENTATION_SECTION_BOOST = 0.1;
export const REVISION_HEADER_BOOST = 0.12;
export const LATEST_CHANGE_MARKER_BOOST = 0.22;
export const LATEST_CHANGE_QUERY_EFFECTIVE_SECTION_PENALTY = 0.18;
export const MODIFICATION_REVIEW_CLUSTER_BOOST = 0.18;
export const MODIFICATION_TOPIC_BOOST = 0.06;
export const ANSWER_READY_PENALTY = 0.18;
export const NON_AUTHORITATIVE_POLICY_PENALTY = 0.1;
export const AUTHORITATIVE_POLICY_BOOST = 0.04;
export const OFF_TOPIC_OPERATIONAL_PENALTY = 0.12;
export const OPERATIONAL_ROLE_BOOST = 0.12;
export const OPERATIONAL_ROLE_MISMATCH_PENALTY = 0.08;
export const CONTRACT_ROLE_BOOST = 0.14;
export const CONTRACT_ROLE_MISMATCH_PENALTY = 0.14;
export const CONTRACT_GOVERNING_SOURCE_BOOST = 0.08;
export const CONTRACT_FEDERAL_CONTEXT_PENALTY = 0.18;
export const EXACT_REIMBURSEMENT_CODE_BOOST = 0.45;
export const REIMBURSEMENT_CODE_ROLE_BOOST = 0.08;
export const NON_REIMBURSEMENT_CODE_MATCH_PENALTY = 0.16;
export const RETRIEVAL_READY_PENALTY = 0.18;
export const PRIMARY_FEE_SCHEDULE_BOOST = 0.12;
export const HISTORY_FEE_SCHEDULE_BOOST = 0.08;
export const HISTORY_FEE_SCHEDULE_PENALTY = 0.08;
export const ARCHIVE_FEE_SCHEDULE_PENALTY = 0.18;
export const COMPANION_FEE_SCHEDULE_PENALTY = 0.16;
export const SPREADSHEET_FEE_SCHEDULE_BOOST = 0.04;
export const REQUESTED_YEAR_MATCH_BOOST = 0.18;
export const COVERAGE_PROCESS_SECTION_PENALTY = 0.18;
export const FEDERAL_DOCUMENT_TYPES = new Set(['federal_regulation', 'federal_statute']);
export const POLICY_ROUTING_DOCUMENT_TYPES = new Set(['clinical_policy', 'dhhs_policy', 'provider_manual', 'waiver']);
export const FRAME_PRIMARY_LIMIT = 4;
export const FRAME_SUPPORT_LIMIT = 4;
export const FRAME_AVOID_LIMIT = 3;
export const FRAME_DOCUMENT_LIMIT = 3;
export const DOCUMENT_SECTION_PICK_LIMIT = 2;

/** Opens the note of every read of a heading that has no text of its own.
 *  The verifier's evidence shows such a note in full (see the agent's evidence.ts). */
export const CONTAINER_NOTE_LEAD = 'This heading has no text of its own.';
