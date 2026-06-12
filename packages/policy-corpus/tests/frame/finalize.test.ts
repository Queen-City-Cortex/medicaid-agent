import { describe, it, expect } from 'vitest';
import { createFrameFinalizer } from '../../src/frame/context/finalize.js';
import type { AnswerFrameSection } from '../../src/types.js';

function section(id: string, content: string | null = 'body text'): AnswerFrameSection {
  return {
    id,
    title: `Title ${id}`,
    sectionNumber: '1.0',
    content,
    effectiveDate: null,
    lastRevised: null,
    federalRegisterCite: null,
    documentId: 'doc-1',
    documentTitle: 'Doc',
    documentType: 'clinical_policy',
    policyNumber: '8C',
    url: null,
    citationLink: null,
    status: null,
    authorityTier: null,
    answerRole: null,
    sourceFormat: null,
    answerReady: null,
    corpusBucket: null,
    variantGroup: null,
    variantDate: null,
    retrievalReady: null,
    reason: null,
  };
}

function buildFinalizer() {
  // Mimics the real hydrator's seen-set contract: skips ids already in the
  // set, adds the ones it returns.
  const hydrateSectionCandidates = async (
    candidates: Array<{ sectionId: string }>,
    limit: number,
    seenSectionIds?: Set<string>,
  ) => {
    const seen = seenSectionIds ?? new Set<string>();
    const out: Array<{ section: AnswerFrameSection }> = [];
    for (const candidate of candidates) {
      if (out.length >= limit) break;
      if (seen.has(candidate.sectionId)) continue;
      seen.add(candidate.sectionId);
      out.push({ section: section(candidate.sectionId) });
    }
    return out;
  };
  const collectDocumentsForSections = async () => [];
  return createFrameFinalizer({
    hydrateSectionCandidates: hydrateSectionCandidates as any,
    collectDocumentsForSections: collectDocumentsForSections as any,
  });
}

describe('finalizeFrame', () => {
  it('never ships the same section as both primary and avoid', async () => {
    const { finalizeFrame } = buildFinalizer();
    const frame = await finalizeFrame({
      questionType: 'coverage',
      route: {
        lane: 'baseline_hybrid',
        rationale: 'test',
        widening_policy: 'one_step',
        determinism_hints: {
          numeric_evidence_only: false,
          latest_revision_only: false,
          cite_scope_and_not_covered: false,
        },
      },
      primaryCandidates: [{ sectionId: 'sec-A' }] as any,
      supportingCandidates: [{ sectionId: 'sec-B' }] as any,
      // sec-A is also nominated as avoid — it must not appear there.
      avoidCandidates: [{ sectionId: 'sec-A' }, { sectionId: 'sec-C' }] as any,
    });

    expect(frame.primarySections.map((s) => s.id)).toEqual(['sec-A']);
    expect(frame.avoidSections.map((s) => s.id)).toEqual(['sec-C']);
  });

  it('strips content from avoid sections (negative guidance is metadata-only)', async () => {
    const { finalizeFrame } = buildFinalizer();
    const frame = await finalizeFrame({
      questionType: 'coverage',
      route: {
        lane: 'baseline_hybrid',
        rationale: 'test',
        widening_policy: 'one_step',
        determinism_hints: {
          numeric_evidence_only: false,
          latest_revision_only: false,
          cite_scope_and_not_covered: false,
        },
      },
      avoidCandidates: [{ sectionId: 'sec-C' }] as any,
    });

    expect(frame.avoidSections).toHaveLength(1);
    expect(frame.avoidSections[0].content).toBeNull();
    expect(frame.avoidSections[0].title).toBe('Title sec-C');
  });
});
