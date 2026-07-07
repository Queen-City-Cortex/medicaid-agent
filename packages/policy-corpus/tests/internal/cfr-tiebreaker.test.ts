import { describe, it, expect } from 'vitest';
import { selectPreferredDocumentTitlesByFocus } from '../../src/internal/shared.js';
import type { CorpusRetrievalHit } from '../../src/types.js';
import { makeHit as baseMakeHit } from '../helpers/objects.js';

// Wrapper over the shared base: this file's defaults differ (federal-regulation
// hits with score 0 and null answerReady/retrievalReady).
function makeHit(overrides: Partial<CorpusRetrievalHit> = {}): CorpusRetrievalHit {
  return baseMakeHit({
    sectionId: 'sec:x',
    documentType: 'federal_regulation',
    score: 0,
    answerReady: null,
    retrievalReady: null,
    ...overrides,
  });
}

describe('selectPreferredDocumentTitlesByFocus — CFR-part tiebreaker', () => {
  it('promotes base-Medicaid CFR part over CHIP when scores are close on a non-CHIP question', () => {
    const hits: CorpusRetrievalHit[] = [
      makeHit({
        sectionId: 'sec:chip',
        documentTitle: '42 CFR Part 457',
        policyNumber: '42-CFR-457',
        sectionTitle: 'State plan amendment requirements',
        score: 0.82,
      }),
      makeHit({
        sectionId: 'sec:medicaid',
        documentTitle: '42 CFR Part 430',
        policyNumber: '42-CFR-430',
        sectionTitle: 'Submission of plan and plan amendments',
        score: 0.78,
      }),
    ];

    const result = selectPreferredDocumentTitlesByFocus(
      hits,
      ['state', 'plan', 'amendment'],
      [],
      2,
      0.1,
      'Which federal regulation governs state Medicaid plan amendment timeliness?',
    );

    expect(result[0]).toBe('42 CFR Part 430');
  });

  it('keeps CHIP first when the question explicitly mentions CHIP', () => {
    const hits: CorpusRetrievalHit[] = [
      makeHit({
        sectionId: 'sec:chip',
        documentTitle: '42 CFR Part 457',
        policyNumber: '42-CFR-457',
        score: 0.82,
      }),
      makeHit({
        sectionId: 'sec:medicaid',
        documentTitle: '42 CFR Part 430',
        policyNumber: '42-CFR-430',
        score: 0.78,
      }),
    ];

    const result = selectPreferredDocumentTitlesByFocus(
      hits,
      [],
      [],
      2,
      0.1,
      'What CHIP state plan amendment requirements apply?',
    );

    expect(result[0]).toBe('42 CFR Part 457');
  });

  it('does not swap when the CHIP hit is outside the score window (not a close call)', () => {
    const hits: CorpusRetrievalHit[] = [
      makeHit({
        sectionId: 'sec:chip',
        documentTitle: '42 CFR Part 457',
        policyNumber: '42-CFR-457',
        score: 0.95,
      }),
      makeHit({
        sectionId: 'sec:medicaid',
        documentTitle: '42 CFR Part 430',
        policyNumber: '42-CFR-430',
        score: 0.40,
      }),
    ];

    const result = selectPreferredDocumentTitlesByFocus(hits, [], [], 2, 0.1, 'some Medicaid question');

    expect(result[0]).toBe('42 CFR Part 457');
  });

  it('does not affect non-CFR federal documents', () => {
    const hits: CorpusRetrievalHit[] = [
      makeHit({
        sectionId: 'sec:ssa',
        documentTitle: 'SSA Title 19',
        policyNumber: 'SSA-TITLE-19',
        documentType: 'federal_statute',
        score: 0.85,
      }),
      makeHit({
        sectionId: 'sec:medicaid',
        documentTitle: '42 CFR Part 430',
        policyNumber: '42-CFR-430',
        score: 0.80,
      }),
    ];

    const result = selectPreferredDocumentTitlesByFocus(hits, [], [], 2, 0.1, 'a Medicaid question');

    // SSA Title 19 stays on top — tiebreaker only swaps CHIP ↔ base-Medicaid CFR parts.
    expect(result[0]).toBe('SSA Title 19');
  });

  it('is backwards-compatible when questionText is omitted', () => {
    const hits: CorpusRetrievalHit[] = [
      makeHit({ documentTitle: 'A', policyNumber: '42-CFR-457', score: 0.90 }),
      makeHit({ documentTitle: 'B', policyNumber: '42-CFR-430', score: 0.88 }),
    ];
    // No questionText → tiebreaker does not run (CHIP mention is not asserted
    // absent, so we keep raw ranking to avoid regressing existing callers).
    const result = selectPreferredDocumentTitlesByFocus(hits, [], [], 2, 0.1);
    expect(result[0]).toBe('A');
  });
});
