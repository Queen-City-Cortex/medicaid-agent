import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@mastra/core/tools', () => ({
  createTool: (config: any) => config,
}));

vi.mock('../../src/neo4j.js', () => ({
  withSession: vi.fn(),
}));

import { withSession } from '../../src/neo4j.js';
import { searchSections } from '../../src/tools/search.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockRecord(data: Record<string, unknown>) {
  return { get: (key: string) => data[key] };
}

function setupSession(runs: Array<{ records: ReturnType<typeof mockRecord>[] }>) {
  let callIndex = 0;
  const session = {
    run: vi.fn(async () => {
      const result = runs[callIndex] ?? { records: [] };
      callIndex++;
      return result;
    }),
  };
  vi.mocked(withSession).mockImplementation(async (fn) => fn(session as any));
  return session;
}

function mockFetchEmbedding(embedding: number[] = [0.1, 0.2, 0.3]) {
  globalThis.fetch = vi.fn(async () =>
    ({
      ok: true,
      json: async () => ({ data: [{ embedding }] }),
    }) as Response,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('searchSections', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns sections from section_embeddings index', async () => {
    mockFetchEmbedding();
    setupSession([
      {
        records: [
          mockRecord({
            sectionId: 'sec-1',
            title: 'Title 1',
            policyNumber: '8C',
            documentType: 'dhhs_policy',
            content: 'Content one',
            score: 0.95,
          }),
          mockRecord({
            sectionId: 'sec-2',
            title: 'Title 2',
            policyNumber: '1A',
            documentType: 'clinical_policy',
            content: 'Content two',
            score: 0.90,
          }),
        ],
      },
      { records: [] }, // chunk_embeddings returns nothing
    ]);

    const result = await searchSections.execute({ query: 'test query' }, {});

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toEqual({
      sectionId: 'sec-1',
      title: 'Title 1',
      policyNumber: '8C',
      documentType: 'dhhs_policy',
      contentSnippet: 'Content one',
      score: 0.95,
    });
    expect(result.sections[1].sectionId).toBe('sec-2');
  });

  it('deduplicates sections across indices, keeping higher score', async () => {
    mockFetchEmbedding();
    setupSession([
      {
        records: [
          mockRecord({
            sectionId: 'sec-dup',
            title: 'Dup Title',
            policyNumber: '8C',
            documentType: 'dhhs_policy',
            content: 'Section content',
            score: 0.80,
          }),
        ],
      },
      {
        records: [
          mockRecord({
            sectionId: 'sec-dup',
            title: 'Dup Title',
            policyNumber: '8C',
            documentType: 'dhhs_policy',
            content: 'Chunk content',
            score: 0.95,
          }),
        ],
      },
    ]);

    const result = await searchSections.execute({ query: 'test' }, {});

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].score).toBe(0.95);
    expect(result.sections[0].contentSnippet).toBe('Chunk content');
  });

  it('limits results to topK', async () => {
    mockFetchEmbedding();
    const records = Array.from({ length: 15 }, (_, i) =>
      mockRecord({
        sectionId: `sec-${i}`,
        title: `Title ${i}`,
        policyNumber: '8C',
        documentType: 'dhhs_policy',
        content: `Content ${i}`,
        score: 0.99 - i * 0.01,
      }),
    );
    setupSession([{ records }, { records: [] }]);

    const result = await searchSections.execute({ query: 'test', topK: 5 }, {});

    expect(result.sections).toHaveLength(5);
  });

  it('truncates content to 500 char snippet', async () => {
    mockFetchEmbedding();
    const longContent = 'A'.repeat(800);
    setupSession([
      {
        records: [
          mockRecord({
            sectionId: 'sec-long',
            title: 'Long',
            policyNumber: '8C',
            documentType: 'dhhs_policy',
            content: longContent,
            score: 0.9,
          }),
        ],
      },
      { records: [] },
    ]);

    const result = await searchSections.execute({ query: 'test' }, {});

    expect(result.sections[0].contentSnippet).toHaveLength(500);
    expect(result.sections[0].contentSnippet).toBe('A'.repeat(500));
  });

  it('handles chunk_embeddings index failure gracefully', async () => {
    mockFetchEmbedding();
    let callIndex = 0;
    const session = {
      run: vi.fn(async () => {
        callIndex++;
        if (callIndex === 1) {
          return {
            records: [
              mockRecord({
                sectionId: 'sec-1',
                title: 'Title 1',
                policyNumber: '8C',
                documentType: 'dhhs_policy',
                content: 'Content',
                score: 0.9,
              }),
            ],
          };
        }
        throw new Error('chunk_embeddings index does not exist');
      }),
    };
    vi.mocked(withSession).mockImplementation(async (fn) => fn(session as any));

    const result = await searchSections.execute({ query: 'test' }, {});

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].sectionId).toBe('sec-1');
  });

  it('throws on Voyage API error', async () => {
    globalThis.fetch = vi.fn(async () =>
      ({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      }) as Response,
    );

    setupSession([{ records: [] }, { records: [] }]);

    await expect(searchSections.execute({ query: 'test' }, {})).rejects.toThrow(
      'Voyage API error 401: Unauthorized',
    );
  });
});
