// Shared domain-object fixtures (plain src/types.ts values) — the domain-object
// layer complement to graph-fixtures.ts, which works at the Neo4j-record layer.
//
// Each factory carries ONE canonical default set. Test files whose local
// defaults differ keep a thin wrapper at the call site that supplies only the
// differing fields on top of these bases.

import type { AnswerFrame, AnswerFrameSection, CorpusRetrievalHit } from '../../src/types.js';

export function makeHit(overrides: Partial<CorpusRetrievalHit> = {}): CorpusRetrievalHit {
  return {
    sectionId: 'sec:test',
    sectionNumber: null,
    sectionTitle: null,
    documentTitle: null,
    documentType: null,
    policyNumber: null,
    content: null,
    score: 1,
    authorityTier: null,
    answerRole: null,
    sourceFormat: null,
    answerReady: true,
    corpusBucket: null,
    variantGroup: null,
    variantDate: null,
    retrievalReady: true,
    ...overrides,
  };
}

export function makeSection(overrides: Partial<AnswerFrameSection> = {}): AnswerFrameSection {
  return {
    id: 'sec:test',
    title: null,
    sectionNumber: null,
    content: null,
    effectiveDate: null,
    lastRevised: null,
    federalRegisterCite: null,
    documentId: 'doc:test',
    documentTitle: 'Test Document',
    documentType: 'clinical_policy',
    policyNumber: '10A',
    url: null,
    citationLink: null,
    status: 'current',
    authorityTier: 'state',
    answerRole: 'governing',
    sourceFormat: 'pdf',
    answerReady: true,
    corpusBucket: 'state_policy',
    variantGroup: null,
    variantDate: null,
    retrievalReady: true,
    reason: null,
    ...overrides,
  };
}

export function makeFrame(overrides: Partial<AnswerFrame> = {}): AnswerFrame {
  return {
    questionType: 'coverage',
    route: {
      lane: 'baseline_hybrid',
      rationale: 'test',
      widening_policy: 'none',
      determinism_hints: {
        numeric_evidence_only: false,
        latest_revision_only: false,
        cite_scope_and_not_covered: false,
      },
    },
    authoritativeDocuments: [],
    primarySections: [],
    supportingSections: [],
    avoidSections: [],
    latestRevision: null,
    variantReasoning: null,
    ...overrides,
  };
}
