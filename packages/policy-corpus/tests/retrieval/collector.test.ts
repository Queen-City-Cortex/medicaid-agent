import { describe, expect, it, vi } from 'vitest';

import type {
  QueryAnalysis,
  RetrievalBackend,
  RetrievalProfile,
} from '../../src/contracts.js';
import type {
  CorpusRetrievalHit,
  SearchSectionsInput,
  SessionExecutor,
} from '../../src/types.js';
import { analyzeQuery } from '../../src/query/analysis.js';

// Only the fulltext backend is mocked — it is the one stage that issues its own
// Cypher and can't be supplied through the injected `backends` map. Stage-1
// backends are passed in directly, change-notice / document-expansion stages
// are left disabled, and every shared.ts helper runs for real, so the rest of
// the suite exercises the genuine merge orchestration with zero stubbing.
vi.mock('../../src/retrieval/backends/fulltext.js', () => ({
  fulltextBackend: { name: 'fulltext', retrieve: vi.fn() },
}));

import { fulltextBackend } from '../../src/retrieval/backends/fulltext.js';
import { collectHybridHitMap, finalizeHybridHits } from '../../src/retrieval/collector.js';

const fulltextRetrieve = vi.mocked(fulltextBackend.retrieve);

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeHit(overrides: Partial<CorpusRetrievalHit> & { sectionId: string }): CorpusRetrievalHit {
  return {
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

/** A stage-1 backend that returns a fixed set of hits, ignoring the session. */
function makeBackend(name: string, hits: CorpusRetrievalHit[]): RetrievalBackend {
  return { name: name as RetrievalBackend['name'], retrieve: async () => hits };
}

function makeProfile(overrides: Partial<RetrievalProfile> = {}): RetrievalProfile {
  return {
    name: 'test',
    lane: 'baseline_hybrid',
    wideningPolicy: 'none',
    hasExplicitDocumentTypes: false,
    typeGroups: [],
    perGroupK: 10,
    enabledBackends: [],
    ...overrides,
  };
}

/** Real analysis from analyzeQuery, with the expansion-triggering flags forced off. */
function makeAnalysis(query = 'physical therapy coverage criteria'): QueryAnalysis {
  const analysis = analyzeQuery(query);
  return {
    ...analysis,
    flags: { ...analysis.flags, isChangeNoticeQuery: false, isLatestChangeNoticeQuery: false },
  };
}

const input: SearchSectionsInput = { query: 'physical therapy coverage criteria' };

// Runs the callback with a throwaway session — the injected backends and the
// mocked fulltext backend ignore it, and no real backend stage executes.
const withSession: SessionExecutor = async (fn) => fn({} as never);

function collect(backends: Map<string, RetrievalBackend>, profile: RetrievalProfile) {
  return collectHybridHitMap({
    withSession,
    input,
    analysis: makeAnalysis(),
    profile,
    embedding: [0.1, 0.2, 0.3],
    backends,
  });
}

// ── collectHybridHitMap: stage-1 merge ───────────────────────────────────────

describe('collectHybridHitMap — backend merge', () => {
  it('merges hits from every enabled backend, keyed by sectionId', async () => {
    const backends = new Map([
      ['section_vector', makeBackend('section_vector', [makeHit({ sectionId: 'a' }), makeHit({ sectionId: 'b' })])],
      ['concept', makeBackend('concept', [makeHit({ sectionId: 'c' })])],
    ]);
    const map = await collect(backends, makeProfile({ enabledBackends: ['section_vector', 'concept'] }));
    expect([...map.keys()].sort()).toEqual(['a', 'b', 'c']);
  });

  it('keeps the higher-scored hit per section (merge-max)', async () => {
    const backends = new Map([
      ['section_vector', makeBackend('section_vector', [makeHit({ sectionId: 'a', score: 1.0 })])],
      ['concept', makeBackend('concept', [makeHit({ sectionId: 'a', score: 2.0 })])],
    ]);
    const map = await collect(backends, makeProfile({ enabledBackends: ['section_vector', 'concept'] }));
    expect(map.get('a')?.score).toBe(2.0);
  });

  it('does not replace an existing hit on an equal score (first-merged wins)', async () => {
    const backends = new Map([
      ['section_vector', makeBackend('section_vector', [makeHit({ sectionId: 'a', score: 1.0, documentTitle: 'first' })])],
      ['concept', makeBackend('concept', [makeHit({ sectionId: 'a', score: 1.0, documentTitle: 'second' })])],
    ]);
    // enabledBackends order drives merge order; Promise.all preserves it.
    const map = await collect(backends, makeProfile({ enabledBackends: ['section_vector', 'concept'] }));
    expect(map.get('a')?.documentTitle).toBe('first');
  });

  it('skips enabled backend names that have no registered implementation', async () => {
    const backends = new Map([['section_vector', makeBackend('section_vector', [makeHit({ sectionId: 'a' })])]]);
    // 'concept' is enabled but absent from the map — must be silently skipped, not throw.
    const map = await collect(backends, makeProfile({ enabledBackends: ['section_vector', 'concept'] }));
    expect([...map.keys()]).toEqual(['a']);
  });

  it('returns an empty map when nothing is enabled or registered', async () => {
    expect((await collect(new Map(), makeProfile({ enabledBackends: [] }))).size).toBe(0);
    expect((await collect(new Map(), makeProfile({ enabledBackends: ['section_vector'] }))).size).toBe(0);
  });
});

// ── collectHybridHitMap: fulltext recovery merge ─────────────────────────────

describe('collectHybridHitMap — fulltext recovery', () => {
  it('boosts already-found sections by FULLTEXT_BOOST and inserts fulltext-only sections mid-range', async () => {
    const backends = new Map([
      ['section_vector', makeBackend('section_vector', [makeHit({ sectionId: 'a', score: 1.0 })])],
    ]);
    // Fulltext returns the already-found 'a' (→ boosted) and a new 'b' (→ inserted).
    fulltextRetrieve.mockResolvedValueOnce([makeHit({ sectionId: 'a' }), makeHit({ sectionId: 'b' })]);

    const map = await collect(backends, makeProfile({ enabledBackends: ['section_vector', 'fulltext'] }));

    // 'a' existed (1.0) and is in the fulltext set → +0.05 = 1.05.
    expect(map.get('a')?.score).toBeCloseTo(1.05, 10);
    // After boosting, min=max=mid=1.05; 'b' is fulltext index 1 → 1.05 - 0.02*1 = 1.03.
    expect(map.get('b')?.score).toBeCloseTo(1.03, 10);
  });

  it('leaves the map untouched when fulltext returns nothing', async () => {
    const backends = new Map([
      ['section_vector', makeBackend('section_vector', [makeHit({ sectionId: 'a', score: 1.0 })])],
    ]);
    fulltextRetrieve.mockResolvedValueOnce([]);
    const map = await collect(backends, makeProfile({ enabledBackends: ['section_vector', 'fulltext'] }));
    expect(map.get('a')?.score).toBe(1.0);
    expect(map.size).toBe(1);
  });
});

// ── finalizeHybridHits: rank + cap ───────────────────────────────────────────

describe('finalizeHybridHits', () => {
  function mapOf(hits: CorpusRetrievalHit[]) {
    return new Map(hits.map((h) => [h.sectionId, h]));
  }

  async function finalize(hits: CorpusRetrievalHit[], topK: number) {
    return finalizeHybridHits({
      input,
      sectionMap: mapOf(hits),
      analysis: makeAnalysis(),
      profile: makeProfile(),
      topK,
      // No reranker → maybeRerankHits returns the baseline (sorted) hits.
    });
  }

  it('returns hits sorted by score descending, capped at topK', async () => {
    const result = await finalize(
      [
        makeHit({ sectionId: 'low', score: 0.3 }),
        makeHit({ sectionId: 'high', score: 0.9 }),
        makeHit({ sectionId: 'mid', score: 0.6 }),
      ],
      2,
    );
    expect(result).toHaveLength(2);
    for (let i = 1; i < result.length; i += 1) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });

  it('returns every hit when topK exceeds the map size', async () => {
    const result = await finalize([makeHit({ sectionId: 'a', score: 0.5 }), makeHit({ sectionId: 'b', score: 0.8 })], 10);
    expect(result).toHaveLength(2);
    expect(result.map((h) => h.sectionId).sort()).toEqual(['a', 'b']);
  });

  it('returns [] for an empty section map', async () => {
    expect(await finalize([], 5)).toEqual([]);
  });
});
