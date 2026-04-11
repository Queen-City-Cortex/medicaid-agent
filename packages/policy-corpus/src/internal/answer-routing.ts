import type { AnswerFrameRoute, AnswerQuestionType } from '../types.js';
import {
  asksForHistory,
  isDeterministicCoverageQuery,
  isDeterministicPriorAuthQuery,
  isLatestChangeNoticeQuery,
  isYesNoCoverageQuery,
} from './query-intent.js';

export function buildAnswerRoute({
  lane,
  rationale,
  wideningPolicy,
  numericEvidenceOnly = false,
  latestRevisionOnly = false,
  citeScopeAndNotCovered = false,
}: {
  lane: AnswerFrameRoute['lane'];
  rationale: string;
  wideningPolicy: AnswerFrameRoute['widening_policy'];
  numericEvidenceOnly?: boolean;
  latestRevisionOnly?: boolean;
  citeScopeAndNotCovered?: boolean;
}): AnswerFrameRoute {
  return {
    lane,
    rationale,
    widening_policy: wideningPolicy,
    determinism_hints: {
      numeric_evidence_only: numericEvidenceOnly,
      latest_revision_only: latestRevisionOnly,
      cite_scope_and_not_covered: citeScopeAndNotCovered,
    },
  };
}

export function selectAnswerRoute(queryLower: string, questionType: AnswerQuestionType): AnswerFrameRoute {
  const citeScopeAndNotCovered = questionType === 'coverage' && isYesNoCoverageQuery(queryLower);

  switch (questionType) {
    case 'federal_authority':
      return buildAnswerRoute({
        lane: 'graph_reasoning',
        rationale: 'federal_multi_hop',
        wideningPolicy: 'family_expansion',
      });
    case 'policy_variant':
      return buildAnswerRoute({
        lane: 'graph_reasoning',
        rationale: 'policy_variant_resolution',
        wideningPolicy: 'family_expansion',
      });
    case 'amendment':
      if (isLatestChangeNoticeQuery(queryLower) && !asksForHistory(queryLower)) {
        return buildAnswerRoute({
          lane: 'deterministic_evidence',
          rationale: 'latest_revision_marker',
          wideningPolicy: 'none',
          latestRevisionOnly: true,
        });
      }
      return buildAnswerRoute({
        lane: 'graph_reasoning',
        rationale: 'amendment_history',
        wideningPolicy: 'family_expansion',
      });
    case 'prior_authorization':
      if (isDeterministicPriorAuthQuery(queryLower)) {
        return buildAnswerRoute({
          lane: 'deterministic_evidence',
          rationale: 'numeric_thresholds',
          wideningPolicy: 'one_step',
          numericEvidenceOnly: true,
        });
      }
      return buildAnswerRoute({
        lane: 'baseline_hybrid',
        rationale: 'single_document_prior_auth',
        wideningPolicy: 'one_step',
      });
    case 'coverage':
      if (isDeterministicCoverageQuery(queryLower)) {
        return buildAnswerRoute({
          lane: 'deterministic_evidence',
          rationale: 'numeric_thresholds',
          wideningPolicy: 'none',
          numericEvidenceOnly: true,
          citeScopeAndNotCovered,
        });
      }
      return buildAnswerRoute({
        lane: 'baseline_hybrid',
        rationale: 'single_document_coverage',
        wideningPolicy: 'one_step',
        citeScopeAndNotCovered,
      });
    default:
      return buildAnswerRoute({
        lane: 'baseline_hybrid',
        rationale: 'default_general',
        wideningPolicy: 'none',
      });
  }
}
