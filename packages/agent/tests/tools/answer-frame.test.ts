import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mastra/core/tools', () => ({
  createTool: (config: any) => config,
}));

vi.mock('../../src/policy-corpus.js', () => ({
  policyCorpus: {
    resolveAnswerFrame: vi.fn(),
  },
}));

import { policyCorpus } from '../../src/policy-corpus.js';
import { resolveAnswerFrame } from '../../src/tools/answer-frame.js';
import { runTool } from '../helpers/run-tool.js';

function makeRoute(overrides: Partial<{
  lane: 'baseline_hybrid' | 'graph_reasoning' | 'deterministic_evidence';
  rationale: string;
  widening_policy: 'none' | 'one_step' | 'family_expansion';
  determinism_hints: {
    numeric_evidence_only: boolean;
    latest_revision_only: boolean;
    cite_scope_and_not_covered: boolean;
  };
}> = {}) {
  return {
    lane: 'baseline_hybrid' as const,
    rationale: 'single_document_coverage',
    widening_policy: 'one_step' as const,
    determinism_hints: {
      numeric_evidence_only: false,
      latest_revision_only: false,
      cite_scope_and_not_covered: false,
    },
    ...overrides,
  };
}

describe('resolveAnswerFrame', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the structured frame from the policy corpus', async () => {
    vi.mocked(policyCorpus.resolveAnswerFrame).mockResolvedValueOnce({
      questionType: 'coverage',
      route: makeRoute(),
      authoritativeDocuments: [
        {
          id: 'doc-10a',
          title: 'Clinical Coverage Policy 10A',
          documentType: 'clinical_policy',
          policyNumber: '10A',
          effectiveDate: '2025-01-01',
          url: 'https://example.com/10A',
          citationLink: '[Clinical Coverage Policy 10A](https://example.com/10A)',
          status: 'current',
          authorityTier: 'state',
          answerRole: 'governing',
          sourceFormat: 'pdf',
          answerReady: true,
          corpusBucket: 'state_policy',
          variantGroup: null,
          variantDate: null,
          retrievalReady: true,
          reason: 'Preferred service-specific policy.',
        },
      ],
      primarySections: [],
      supportingSections: [],
      avoidSections: [],
      latestRevision: null,
      variantReasoning: null,
    });

    const result = await runTool(resolveAnswerFrame, { query: 'Does Policy 10A cover telehealth?' });

    expect(policyCorpus.resolveAnswerFrame).toHaveBeenCalledWith({
      query: 'Does Policy 10A cover telehealth?',
    });
    expect(result.frame.questionType).toBe('coverage');
    expect(result.frame.authoritativeDocuments[0]?.policyNumber).toBe('10A');
  });

  it('passes through an explicit questionType hint', async () => {
    vi.mocked(policyCorpus.resolveAnswerFrame).mockResolvedValueOnce({
      questionType: 'amendment',
      route: makeRoute({
        lane: 'deterministic_evidence',
        rationale: 'latest_revision_marker',
        widening_policy: 'none',
        determinism_hints: {
          numeric_evidence_only: false,
          latest_revision_only: true,
          cite_scope_and_not_covered: false,
        },
      }),
      authoritativeDocuments: [],
      primarySections: [],
      supportingSections: [],
      avoidSections: [],
      latestRevision: null,
      variantReasoning: null,
    });

    await runTool(
      resolveAnswerFrame,
      {
        query: 'What is the latest change notice for MA-3550?',
        questionType: 'amendment',
      },
    );

    expect(policyCorpus.resolveAnswerFrame).toHaveBeenCalledWith({
      query: 'What is the latest change notice for MA-3550?',
      questionType: 'amendment',
    });
  });
});

it('keeps section classifier diagnostics out of tool text including latest revision', async () => {
  const section = { id: 's', content: 'Policy evidence', sectionRoles: { probabilities: { scope: .95 } } };
  vi.mocked(policyCorpus.resolveAnswerFrame).mockResolvedValueOnce({
    questionType: 'coverage', route: makeRoute(), authoritativeDocuments: [],
    primarySections: [section], supportingSections: [section], avoidSections: [section],
    latestRevision: { marker: 'revised', document: null, section }, variantReasoning: null,
  } as any);
  const result = await runTool(resolveAnswerFrame, { query: 'Coverage?' });
  expect(JSON.stringify(result)).not.toContain('sectionRoles');
  expect(result.frame.primarySections[0].content).toBe('Policy evidence');
});
