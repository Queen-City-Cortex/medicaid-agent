import { describe, expect, it } from 'vitest';
import { selectAnswerRoute } from '../src/internal/answer-routing.js';
import { detectAnswerQuestionType, isManagedCareContractQuery } from '../src/internal/query-intent.js';

describe('answer routing', () => {
  it('keeps latest change notice questions on the deterministic latest-revision lane', () => {
    const query = 'what is the latest change notice for MA-3550';
    const questionType = detectAnswerQuestionType(query);
    const route = selectAnswerRoute(query, questionType);

    expect(questionType).toBe('amendment');
    expect(route.lane).toBe('deterministic_evidence');
    expect(route.determinism_hints.latest_revision_only).toBe(true);
  });

  it('keeps pharmacy quantity-limit prior-auth questions numeric and deterministic', () => {
    const query = 'what prior authorization quantity limits apply to pharmacy claims';
    const route = selectAnswerRoute(query, 'prior_authorization');

    expect(route.lane).toBe('deterministic_evidence');
    expect(route.determinism_hints.numeric_evidence_only).toBe(true);
  });
});

describe('query intent', () => {
  it('recognizes managed-care contract questions as operational contract queries', () => {
    expect(isManagedCareContractQuery('what do nc managed care contracts require for mlr reporting')).toBe(true);
  });
});
