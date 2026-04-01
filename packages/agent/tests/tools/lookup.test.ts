import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@mastra/core/tools', () => ({
  createTool: (config: any) => config,
}));

vi.mock('../../src/neo4j.js', () => ({
  withSession: vi.fn(),
}));

import { withSession } from '../../src/neo4j.js';
import { lookupPolicy } from '../../src/tools/lookup.js';

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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('lookupPolicy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns documents with sections', async () => {
    setupSession([
      {
        records: [
          mockRecord({
            id: 'doc-8c',
            title: 'Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2025-01-01',
            url: 'https://example.com/8C',
            status: 'current',
            sections: [
              { id: 'sec-1', number: '1', title: 'Introduction' },
              { id: 'sec-2', number: '2', title: 'Coverage' },
            ],
          }),
        ],
      },
    ]);

    const result = await lookupPolicy.execute({ policyNumber: '8C' }, {});

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe('doc-8c');
    expect(result.documents[0].policyNumber).toBe('8C');
    expect(result.documents[0].sections).toHaveLength(2);
    expect(result.documents[0].sections[0]).toEqual({
      id: 'sec-1',
      number: '1',
      title: 'Introduction',
    });
  });

  it('filters out null section ids', async () => {
    setupSession([
      {
        records: [
          mockRecord({
            id: 'doc-1',
            title: 'Policy 1A',
            documentType: 'dhhs_policy',
            policyNumber: '1A',
            effectiveDate: '2025-01-01',
            url: null,
            status: 'current',
            sections: [
              { id: 'sec-valid', number: '1', title: 'Valid Section' },
              { id: null, number: null, title: null }, // null from empty OPTIONAL MATCH
            ],
          }),
        ],
      },
    ]);

    const result = await lookupPolicy.execute({ policyNumber: '1A' }, {});

    expect(result.documents[0].sections).toHaveLength(1);
    expect(result.documents[0].sections[0].id).toBe('sec-valid');
  });

  it('returns empty array when no match', async () => {
    setupSession([{ records: [] }]);

    const result = await lookupPolicy.execute({ policyNumber: 'nonexistent' }, {});

    expect(result.documents).toEqual([]);
  });
});
