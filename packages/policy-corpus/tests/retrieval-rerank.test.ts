import { describe, expect, it, vi } from 'vitest';
import type { QueryAnalysis } from '../src/contracts.js';
import type { CorpusRetrievalHit } from '../src/types.js';
import { applyRerankOrdering, maybeRerankHits, shouldAttemptRerank } from '../src/retrieval/rerank.js';
import { makeHit as baseMakeHit } from './helpers/objects.js';

function makeAnalysis(overrides: Partial<QueryAnalysis> = {}): QueryAnalysis {
  return {
    query: 'Is this covered?',
    normalizedQuery: 'is this covered?',
    questionType: 'coverage',
    route: {
      lane: 'baseline_hybrid',
      rationale: 'baseline',
      widening_policy: 'family_expansion',
      determinism_hints: {
        numeric_evidence_only: false,
        latest_revision_only: false,
        cite_scope_and_not_covered: false,
      },
    },
    searchTerms: ['covered'],
    focusTerms: ['covered'],
    serviceFocusTerms: [],
    procedureCodes: [],
    explicitPolicyNumbers: [],
    aliasedPolicyNumbers: [],
    quotedPhrases: [],
    requestedYears: [],
    focusedFederalQuery: null,
    flags: {
      asksForCertificationDetails: false,
      asksForGeneralCriteria: false,
      asksForHistory: false,
      asksForImplementation: false,
      asksForNotCoveredDetails: false,
      asksForPriorAuthSubmissionProcess: false,
      asksForPublicNoticeDetails: false,
      asksForTelehealthServiceList: false,
      isBillingWorkflowQuery: false,
      isChangeNoticeQuery: false,
      isClinicalCriteriaLifecycleQuery: false,
      isCongregatePcsQuery: false,
      isCoverageQuestion: true,
      isEligibilityCriteriaQuery: false,
      isFederalAuthorityQuery: false,
      isHcwdIncomePremiumQuery: false,
      isHistoricalReimbursementQuery: false,
      isLatestChangeNoticeQuery: false,
      isManagedCareContractQuery: false,
      isManagedCareOperationsQuery: false,
      isMlrQuery: false,
      isOperationalRoutingQuery: false,
      isPediatricQuery: false,
      isPolicyVariantQuery: false,
      isPriorAuthorizationQuery: false,
      isReimbursementQuery: false,
      isTelehealthQuery: false,
      isWaiverApplicationQuery: false,
      isYesNoCoverageQuery: false,
    },
    ...overrides,
  };
}

// Wrapper over the shared base: fields here are computed from the positional index.
function makeHit(index: number, overrides: Partial<CorpusRetrievalHit> = {}): CorpusRetrievalHit {
  const documentIndex = Math.floor(index / 2) + 1;
  return baseMakeHit({
    sectionId: `sec-${index}`,
    sectionNumber: `${index}`,
    sectionTitle: `Section ${index}`,
    documentTitle: `Document ${documentIndex}`,
    documentType: 'clinical_policy',
    policyNumber: `P-${documentIndex}`,
    content: `Content for section ${index}`,
    score: 1 - index * 0.01,
    ...overrides,
  });
}

describe('retrieval rerank gating', () => {
  it('triggers reranking for hard federal-authority queries', () => {
    const gate = shouldAttemptRerank({
      input: { query: 'What is the federal authority?', topK: 5 },
      analysis: makeAnalysis({ questionType: 'federal_authority' }),
      hits: Array.from({ length: 8 }, (_, index) => makeHit(index)),
      topK: 5,
    });

    expect(gate.enabled).toBe(true);
    expect(gate.reason).toBe('hard_query:federal_authority');
  });

  it('skips reranking for deterministic routes and explicit document filters', () => {
    const deterministicGate = shouldAttemptRerank({
      input: { query: 'Latest change notice', topK: 5 },
      analysis: makeAnalysis({
        questionType: 'amendment',
        route: {
          lane: 'deterministic_evidence',
          rationale: 'latest_revision_header',
          widening_policy: 'none',
          determinism_hints: {
            numeric_evidence_only: false,
            latest_revision_only: true,
            cite_scope_and_not_covered: false,
          },
        },
      }),
      hits: Array.from({ length: 8 }, (_, index) => makeHit(index)),
      topK: 5,
    });
    const explicitDocGate = shouldAttemptRerank({
      input: { query: 'Policy 3K-2', topK: 5, documentTypes: ['clinical_policy'] },
      analysis: makeAnalysis(),
      hits: Array.from({ length: 8 }, (_, index) => makeHit(index)),
      topK: 5,
    });

    expect(deterministicGate.enabled).toBe(false);
    expect(deterministicGate.reason).toBe('deterministic_route');
    expect(explicitDocGate.enabled).toBe(false);
    expect(explicitDocGate.reason).toBe('explicit_document_types');
  });

  it('triggers reranking for ambiguous baseline coverage results', () => {
    const hits = [
      makeHit(0, { documentTitle: 'Document A', policyNumber: 'A', score: 1.0 }),
      makeHit(1, { documentTitle: 'Document B', policyNumber: 'B', score: 0.97 }),
      makeHit(2, { documentTitle: 'Document C', policyNumber: 'C', score: 0.95 }),
      makeHit(3, { documentTitle: 'Document A', policyNumber: 'A', score: 0.92 }),
      makeHit(4, { documentTitle: 'Document B', policyNumber: 'B', score: 0.81 }),
      makeHit(5, { documentTitle: 'Document C', policyNumber: 'C', score: 0.8 }),
      makeHit(6, { documentTitle: 'Document D', policyNumber: 'D', score: 0.79 }),
      makeHit(7, { documentTitle: 'Document E', policyNumber: 'E', score: 0.78 }),
    ];

    const gate = shouldAttemptRerank({
      input: { query: 'Is speech therapy covered?', topK: 5 },
      analysis: makeAnalysis(),
      hits,
      topK: 5,
    });

    expect(gate.enabled).toBe(true);
    expect(gate.reason).toBe('ambiguous_top_hits');
  });
});

describe('retrieval rerank application', () => {
  it('moves returned ids ahead of omitted ids while preserving omitted and trailing order', () => {
    const baselineHits = Array.from({ length: 14 }, (_, index) => makeHit(index));

    const reordered = applyRerankOrdering({
      baselineHits,
      rerankedSectionIds: ['sec-3', 'sec-1'],
      windowSize: 12,
    });

    expect(reordered.slice(0, 6).map((hit) => hit.sectionId)).toEqual([
      'sec-3',
      'sec-1',
      'sec-0',
      'sec-2',
      'sec-4',
      'sec-5',
    ]);
    expect(reordered.slice(12).map((hit) => hit.sectionId)).toEqual(['sec-12', 'sec-13']);
  });

  it('fails open on reranker errors and unknown ids but accepts partial valid lists', async () => {
    const baselineHits = Array.from({ length: 8 }, (_, index) => makeHit(index));
    const analysis = makeAnalysis({ questionType: 'federal_authority' });

    const errorResult = await maybeRerankHits({
      input: { query: 'What is the federal authority?', topK: 4 },
      analysis,
      profile: {
        name: 'federal_hybrid',
        lane: 'graph_reasoning',
        wideningPolicy: 'family_expansion',
        hasExplicitDocumentTypes: false,
        typeGroups: [['federal_regulation', 'federal_statute']],
        perGroupK: 4,
        enabledBackends: [],
      },
      topK: 4,
      baselineHits,
      rerankHits: vi.fn(async () => {
        throw new Error('timeout');
      }),
    });
    const unknownIdResult = await maybeRerankHits({
      input: { query: 'What is the federal authority?', topK: 4 },
      analysis,
      profile: {
        name: 'federal_hybrid',
        lane: 'graph_reasoning',
        wideningPolicy: 'family_expansion',
        hasExplicitDocumentTypes: false,
        typeGroups: [['federal_regulation', 'federal_statute']],
        perGroupK: 4,
        enabledBackends: [],
      },
      topK: 4,
      baselineHits,
      rerankHits: vi.fn(async () => ({
        sectionIds: ['sec-2', 'sec-missing'],
      })),
    });
    const partialResult = await maybeRerankHits({
      input: { query: 'What is the federal authority?', topK: 4 },
      analysis,
      profile: {
        name: 'federal_hybrid',
        lane: 'graph_reasoning',
        wideningPolicy: 'family_expansion',
        hasExplicitDocumentTypes: false,
        typeGroups: [['federal_regulation', 'federal_statute']],
        perGroupK: 4,
        enabledBackends: [],
      },
      topK: 4,
      baselineHits,
      rerankHits: vi.fn(async () => ({
        sectionIds: ['sec-2', 'sec-0'],
      })),
    });

    expect(errorResult.map((hit) => hit.sectionId)).toEqual(baselineHits.map((hit) => hit.sectionId));
    expect(unknownIdResult.map((hit) => hit.sectionId)).toEqual(baselineHits.map((hit) => hit.sectionId));
    expect(partialResult.slice(0, 5).map((hit) => hit.sectionId)).toEqual([
      'sec-2',
      'sec-0',
      'sec-1',
      'sec-3',
      'sec-4',
    ]);
  });
});
