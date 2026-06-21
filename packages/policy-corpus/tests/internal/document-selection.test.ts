import { describe, expect, it } from 'vitest';

import type {
  CorpusRetrievalHit,
  DocumentView,
  DocumentWithSectionsView,
} from '../../src/types.js';
import type { DocumentCandidate } from '../../src/internal/section-views.js';
import {
  computeDocumentCoverageBoosts,
  documentKeyForHit,
  looksLikeSiblingPolicySet,
  narrowHcwdCoverageDocuments,
  narrowInferredCoverageDocuments,
  pickTopDocumentCandidates,
  policyFamilyKey,
  scoreHcwdCoverageDocument,
  scoreVariantDocument,
  selectDocumentTitlesForExpansion,
  selectSettingPreferredDocuments,
} from '../../src/internal/document-selection.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeHit(overrides: Partial<CorpusRetrievalHit> & { sectionId: string }): CorpusRetrievalHit {
  return {
    sectionNumber: null,
    sectionTitle: null,
    documentTitle: null,
    documentType: 'clinical_policy',
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

function makeDocView(overrides: Partial<DocumentView> & { id: string }): DocumentView {
  return {
    title: null,
    documentType: 'clinical_policy',
    policyNumber: null,
    effectiveDate: null,
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
    ...overrides,
  };
}

function makeDoc(overrides: Partial<DocumentWithSectionsView> & { id: string }): DocumentWithSectionsView {
  return { ...makeDocView(overrides), sections: [], ...overrides };
}

function makeCandidate(id: string, score: number, reason = 'because'): DocumentCandidate {
  return { document: makeDocView({ id }), reason, score };
}

// ── documentKeyForHit ────────────────────────────────────────────────────────

describe('documentKeyForHit', () => {
  it('joins type, policy number, and title', () => {
    const key = documentKeyForHit(makeHit({ sectionId: 's', policyNumber: '8C', documentTitle: 'Policy 8C' }));
    expect(key).toBe('clinical_policy::8C::Policy 8C');
  });

  it('returns null when every identifying field is empty', () => {
    expect(documentKeyForHit(makeHit({ sectionId: 's', documentType: null, policyNumber: null, documentTitle: null }))).toBe(
      null,
    );
  });

  it('returns a key when at least one field is present', () => {
    expect(
      documentKeyForHit(makeHit({ sectionId: 's', documentType: null, policyNumber: '8C', documentTitle: null })),
    ).toBe('::8C::');
  });
});

// ── computeDocumentCoverageBoosts ────────────────────────────────────────────

describe('computeDocumentCoverageBoosts', () => {
  it('boosts by matched-term count and extra-hit count', () => {
    const hits = [
      makeHit({ sectionId: '1', policyNumber: '8C', documentTitle: 'Policy 8C', sectionTitle: 'therapy' }),
      makeHit({ sectionId: '2', policyNumber: '8C', documentTitle: 'Policy 8C', sectionTitle: 'coverage' }),
    ];
    const boosts = computeDocumentCoverageBoosts(hits, ['therapy', 'coverage']);
    // terms.size = 2 → 2*0.01; extra hits = 1 → 1*0.02. Total 0.04.
    expect(boosts.get('clinical_policy::8C::Policy 8C')).toBeCloseTo(0.04, 10);
  });

  it('caps the boost at MAX_DOCUMENT_COVERAGE_BOOST (0.16)', () => {
    const terms = Array.from({ length: 30 }, (_, i) => `term${i}`);
    const hit = makeHit({ sectionId: '1', policyNumber: '8C', documentTitle: 'Policy 8C', content: terms.join(' ') });
    const boosts = computeDocumentCoverageBoosts([hit], terms);
    expect(boosts.get('clinical_policy::8C::Policy 8C')).toBe(0.16);
  });

  it('ignores hits with no identifiable document', () => {
    const hit = makeHit({ sectionId: '1', documentType: null, policyNumber: null, documentTitle: null });
    expect(computeDocumentCoverageBoosts([hit], ['x']).size).toBe(0);
  });
});

// ── selectDocumentTitlesForExpansion ─────────────────────────────────────────

describe('selectDocumentTitlesForExpansion', () => {
  it('ranks titles by summed score + coverage boost, descending', () => {
    const hits = [
      makeHit({ sectionId: '1', documentTitle: 'A', score: 1 }),
      makeHit({ sectionId: '2', documentTitle: 'A', score: 1 }),
      makeHit({ sectionId: '3', documentTitle: 'B', score: 3 }),
    ];
    // A = 1 + 1 = 2; B = 3 → B ranks first.
    expect(selectDocumentTitlesForExpansion(hits, new Map())).toEqual(['B', 'A']);
  });

  it('skips hits with no document title', () => {
    const hits = [makeHit({ sectionId: '1', documentTitle: null, score: 5 })];
    expect(selectDocumentTitlesForExpansion(hits, new Map())).toEqual([]);
  });
});

// ── policyFamilyKey / sibling detection ──────────────────────────────────────

describe('policyFamilyKey', () => {
  it('strips a trailing -suffix and uppercases', () => {
    expect(policyFamilyKey('MA-2180')).toBe('MA');
    expect(policyFamilyKey('8c-1')).toBe('8C');
  });

  it('returns the number unchanged when there is no suffix', () => {
    expect(policyFamilyKey('1A')).toBe('1A');
  });

  it('returns null for nullish input', () => {
    expect(policyFamilyKey(null)).toBe(null);
    expect(policyFamilyKey(undefined)).toBe(null);
  });
});

describe('looksLikeSiblingPolicySet', () => {
  it('is true when a policy family appears more than once', () => {
    const docs = [makeDoc({ id: '1', policyNumber: 'MA-2180' }), makeDoc({ id: '2', policyNumber: 'MA-2185' })];
    expect(looksLikeSiblingPolicySet(docs)).toBe(true);
  });

  it('is false when every family is distinct', () => {
    const docs = [makeDoc({ id: '1', policyNumber: '8C' }), makeDoc({ id: '2', policyNumber: '9A' })];
    expect(looksLikeSiblingPolicySet(docs)).toBe(false);
  });

  it('is false with no policy numbers', () => {
    expect(looksLikeSiblingPolicySet([makeDoc({ id: '1' }), makeDoc({ id: '2' })])).toBe(false);
  });
});

// ── narrowInferredCoverageDocuments ──────────────────────────────────────────

describe('narrowInferredCoverageDocuments', () => {
  it('returns the input unchanged for a single document', () => {
    const docs = [makeDoc({ id: '1', policyNumber: '8C' })];
    expect(narrowInferredCoverageDocuments(docs)).toBe(docs);
  });

  it('keeps the documents of the most common policy family', () => {
    const docs = [
      makeDoc({ id: '1', policyNumber: 'MA-2180' }),
      makeDoc({ id: '2', policyNumber: 'MA-2185' }),
      makeDoc({ id: '3', policyNumber: '8C' }),
    ];
    expect(narrowInferredCoverageDocuments(docs).map((d) => d.id)).toEqual(['1', '2']);
  });

  it('falls back to the first document when no family repeats', () => {
    const docs = [makeDoc({ id: '1', policyNumber: '8C' }), makeDoc({ id: '2', policyNumber: '9A' })];
    expect(narrowInferredCoverageDocuments(docs).map((d) => d.id)).toEqual(['1']);
  });
});

// ── HCWD coverage scoring + narrowing ────────────────────────────────────────

describe('scoreHcwdCoverageDocument', () => {
  it('rewards the MA-2180 current document', () => {
    // 2.5 (MA-2180) + 0.5 (current); plain title triggers none of the penalties.
    expect(scoreHcwdCoverageDocument(makeDoc({ id: '1', policyNumber: 'MA-2180', title: 'General Coverage' }), 'hcwd')).toBe(
      3.0,
    );
  });

  it('penalizes administrative-form titles', () => {
    // 0.5 (current) - 2.5 (administrative form "authorization").
    expect(
      scoreHcwdCoverageDocument(makeDoc({ id: '1', policyNumber: '99X', title: 'Prior Authorization Form' }), 'hcwd'),
    ).toBe(-2.0);
  });

  it('penalizes a year-specific premium title when the query names no year or chart', () => {
    const withYearTitle = scoreHcwdCoverageDocument(makeDoc({ id: '1', title: 'Premium Amounts 2024' }), 'hcwd premiums');
    const plainPremium = scoreHcwdCoverageDocument(makeDoc({ id: '2', title: 'Premium Schedule' }), 'hcwd premiums');
    expect(withYearTitle).toBeLessThan(plainPremium);
  });
});

describe('narrowHcwdCoverageDocuments', () => {
  it('returns the input unchanged for a single document', () => {
    const docs = [makeDoc({ id: '1' })];
    expect(narrowHcwdCoverageDocuments('hcwd', docs)).toBe(docs);
  });

  it('keeps only the top document when the query names no year or chart', () => {
    const docs = [
      makeDoc({ id: 'form', policyNumber: '99X', title: 'Prior Authorization Form' }),
      makeDoc({ id: 'primary', policyNumber: 'MA-2180', title: 'Income Ranges' }),
    ];
    expect(narrowHcwdCoverageDocuments('hcwd premiums', docs).map((d) => d.id)).toEqual(['primary']);
  });

  it('keeps up to two close documents when the query names a year', () => {
    const docs = [
      makeDoc({ id: 'primary', policyNumber: 'MA-2180', title: 'Income Ranges' }),
      makeDoc({ id: 'second', policyNumber: 'MA-2180', title: 'Income Ranges' }),
    ];
    const result = narrowHcwdCoverageDocuments('hcwd premiums 2024', docs);
    expect(result.length).toBeGreaterThan(1);
  });
});

// ── selectSettingPreferredDocuments ──────────────────────────────────────────

describe('selectSettingPreferredDocuments', () => {
  it('narrows to documents whose titles match the queried care setting', () => {
    const docs = [makeDoc({ id: 'cong', title: 'Congregate PCS' }), makeDoc({ id: 'home', title: 'State Plan PCS' })];
    const result = selectSettingPreferredDocuments('coverage for a congregate setting', docs);
    expect(result.documents.map((d) => d.id)).toEqual(['cong']);
    expect(result.reason).toContain('congregate');
  });

  it('returns all documents with a null reason when the query names no setting', () => {
    const docs = [makeDoc({ id: 'a' }), makeDoc({ id: 'b' })];
    const result = selectSettingPreferredDocuments('what is the eligibility criteria', docs);
    expect(result.documents).toBe(docs);
    expect(result.reason).toBe(null);
  });

  it('returns all documents when the setting is named but no title matches', () => {
    const docs = [makeDoc({ id: 'a', title: 'General Policy' })];
    const result = selectSettingPreferredDocuments('congregate care home', docs);
    expect(result.documents).toBe(docs);
    expect(result.reason).toBe(null);
  });
});

// ── scoreVariantDocument ─────────────────────────────────────────────────────

describe('scoreVariantDocument', () => {
  it('rewards an exact policy-number match and sets the matching reason', () => {
    const matched = scoreVariantDocument(makeDoc({ id: '1', policyNumber: '8C', title: 'Policy 8C' }), 'policy 8c', ['8C']);
    const unmatched = scoreVariantDocument(makeDoc({ id: '2', policyNumber: '9A', title: 'Policy 9A' }), 'policy 8c', ['8C']);
    expect(matched.score).toBeGreaterThan(unmatched.score);
    expect(matched.reason).toBe('Exact policy-number match from the query.');
  });

  it('penalizes change-notice / amendment documents', () => {
    const current = scoreVariantDocument(makeDoc({ id: '1', policyNumber: '8C', title: 'Policy 8C', status: 'current' }), 'q', []);
    const amendment = scoreVariantDocument(
      makeDoc({ id: '2', policyNumber: '8C', title: 'Policy 8C', status: 'amendment' }),
      'q',
      [],
    );
    expect(amendment.score).toBeLessThan(current.score);
  });
});

// ── pickTopDocumentCandidates ────────────────────────────────────────────────

describe('pickTopDocumentCandidates', () => {
  it('sorts by score descending and caps at the frame document limit (3)', () => {
    const candidates = [
      makeCandidate('a', 1),
      makeCandidate('b', 4),
      makeCandidate('c', 2),
      makeCandidate('d', 3),
    ];
    const result = pickTopDocumentCandidates(candidates);
    expect(result.map((d) => d.id)).toEqual(['b', 'd', 'c']);
  });

  it('dedupes by document id, keeping the highest-scored occurrence', () => {
    const candidates = [makeCandidate('a', 5, 'high'), makeCandidate('a', 1, 'low'), makeCandidate('b', 3)];
    const result = pickTopDocumentCandidates(candidates);
    expect(result.map((d) => d.id)).toEqual(['a', 'b']);
    expect(result[0].reason).toBe('high');
  });

  it('honors an explicit limit', () => {
    const candidates = [makeCandidate('a', 3), makeCandidate('b', 2), makeCandidate('c', 1)];
    expect(pickTopDocumentCandidates(candidates, 1).map((d) => d.id)).toEqual(['a']);
  });
});
