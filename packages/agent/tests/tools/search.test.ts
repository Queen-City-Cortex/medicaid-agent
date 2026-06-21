import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SEARCH_SNIPPET_CHARS } from '@nc-medicaid/policy-corpus';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@mastra/core/tools', () => ({
  createTool: (config: any) => config,
}));

vi.mock('../../src/neo4j.js', () => ({
  withSession: vi.fn(),
}));

import { withSession } from '../../src/neo4j.js';
import { searchSections } from '../../src/tools/search.js';
import { runTool } from '../helpers/run-tool.js';
import { mockRecord, setupSession } from '../helpers/neo4j-session.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupSearchSession(
  handlers: Array<{
    match: (query: string, params: Record<string, unknown>) => boolean;
    result?: { records: ReturnType<typeof mockRecord>[] };
    error?: Error;
  }>,
) {
  const session = {
    run: vi.fn(async (query: string, params: Record<string, unknown> = {}) => {
      const handler = handlers.find((candidate) => candidate.match(query, params));
      if (!handler) {
        return { records: [] };
      }
      if (handler.error) {
        throw handler.error;
      }
      return handler.result ?? { records: [] };
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
    setupSearchSession([
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
      },
      {
        match: (_, params) => Array.isArray(params.docTypes) && (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-2',
              sectionTitle: 'Title 2',
              policyNumber: '1A',
              documentType: 'clinical_policy',
              content: 'Content two',
              score: 0.9,
            }),
          ],
        },
      },
      {
        match: (_, params) => Array.isArray(params.docTypes) && (params.docTypes as string[]).includes('dhhs_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-1',
              sectionTitle: 'Title 1',
              policyNumber: '8C',
              documentType: 'dhhs_policy',
              content: 'Content one',
              score: 0.95,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
    ]);

    const result = await runTool(searchSections, { query: 'test query' });

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
    setupSearchSession([
      {
        match: (query) => query.includes('section_fulltext'),
        result: { records: [] },
      },
      {
        match: (_, params) => Array.isArray(params.docTypes) && (params.docTypes as string[]).includes('dhhs_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-dup',
              sectionTitle: 'Dup Title',
              policyNumber: '8C',
              documentType: 'dhhs_policy',
              content: 'Section content',
              score: 0.8,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-dup',
              sectionTitle: 'Dup Title',
              policyNumber: '8C',
              documentType: 'dhhs_policy',
              content: 'Chunk content',
              score: 0.95,
            }),
          ],
        },
      },
    ]);

    const result = await runTool(searchSections, { query: 'test' });

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].score).toBe(0.95);
    expect(result.sections[0].contentSnippet).toBe('Chunk content');
  });

  it('limits results to topK', async () => {
    mockFetchEmbedding();
    const records = Array.from({ length: 15 }, (_, i) =>
      mockRecord({
        sectionId: `sec-${i}`,
        sectionTitle: `Title ${i}`,
        policyNumber: '8C',
        documentType: 'dhhs_policy',
        content: `Content ${i}`,
        score: 0.99 - i * 0.01,
      }),
    );
    setupSearchSession([
      {
        match: (_, params) => Array.isArray(params.docTypes) && (params.docTypes as string[]).includes('dhhs_policy'),
        result: { records },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
    ]);

    const result = await runTool(searchSections, { query: 'test', topK: 5 });

    expect(result.sections).toHaveLength(5);
  });

  it('truncates content to 500 char snippet', async () => {
    mockFetchEmbedding();
    const longContent = 'A'.repeat(800);
    setupSearchSession([
      {
        match: (_, params) => Array.isArray(params.docTypes) && (params.docTypes as string[]).includes('dhhs_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-long',
              sectionTitle: 'Long',
              policyNumber: '8C',
              documentType: 'dhhs_policy',
              content: longContent,
              score: 0.9,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: { records: [] },
      },
    ]);

    const result = await runTool(searchSections, { query: 'test' });

    expect(result.sections[0].contentSnippet).toHaveLength(SEARCH_SNIPPET_CHARS);
    expect(result.sections[0].contentSnippet).toBe('A'.repeat(SEARCH_SNIPPET_CHARS));
  });

  it('handles chunk_embeddings index failure gracefully', async () => {
    mockFetchEmbedding();
    setupSearchSession([
      {
        match: (_, params) => Array.isArray(params.docTypes) && (params.docTypes as string[]).includes('dhhs_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-1',
              sectionTitle: 'Title 1',
              policyNumber: '8C',
              documentType: 'dhhs_policy',
              content: 'Content',
              score: 0.9,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        error: new Error('chunk_embeddings index does not exist'),
      },
    ]);

    const result = await runTool(searchSections, { query: 'test' });

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].sectionId).toBe('sec-1');
  });

  it('filters generic concept hits so they do not displace numbered semantic sections', async () => {
    mockFetchEmbedding();
    setupSearchSession([
      {
        match: (_, params) => Array.isArray(params.docTypes) && (params.docTypes as string[]).includes('clinical_policy'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-primary',
              sectionTitle: 'Primary',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content: 'Primary content',
              score: 0.9,
            }),
          ],
        },
      },
      {
        match: (query) =>
          query.includes('MATCH (c:PolicyConcept)') && query.includes('s.section_number IS NOT NULL'),
        result: { records: [] },
      },
      {
        match: (query) => query.includes('MATCH (c:PolicyConcept)'),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-generic',
              sectionTitle: 'Revision Information:',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content: 'Generic concept content',
              score: 0.75,
            }),
          ],
        },
      },
      {
        match: (query) => query.includes("CALL db.index.vector.queryNodes('chunk_embeddings'"),
        result: {
          records: [
            mockRecord({
              sectionId: 'sec-supporting',
              sectionTitle: 'Supporting',
              policyNumber: '3K-2',
              documentType: 'clinical_policy',
              content: 'Supporting semantic content',
              score: 0.74,
            }),
          ],
        },
      },
    ]);

    const result = await runTool(searchSections, { query: 'home modifications cap/da', topK: 2 });

    expect(result.sections.map((section) => section.sectionId)).toEqual([
      'sec-primary',
      'sec-supporting',
    ]);
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

    await expect(runTool(searchSections, { query: 'test' })).rejects.toThrow(
      'Voyage API error 401: Unauthorized',
    );
  });
});
