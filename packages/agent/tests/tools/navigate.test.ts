import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@mastra/core/tools', () => ({
  createTool: (config: any) => config,
}));

vi.mock('../../src/neo4j.js', () => ({
  withSession: vi.fn(),
}));

import { withSession } from '../../src/neo4j.js';
import { followReferences, getAmendments } from '../../src/tools/navigate.js';

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

// ── followReferences ─────────────────────────────────────────────────────────

describe('followReferences', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps records to reference objects', async () => {
    setupSession([
      {
        records: [
          mockRecord({
            targetId: 'sec-target-1',
            targetType: 'Section',
            targetTitle: 'Target Section',
            targetPolicyNumber: '1A',
            relationshipType: 'REFERENCES',
            referenceText: 'see section 1A',
          }),
          mockRecord({
            targetId: 'doc-target-1',
            targetType: 'Document',
            targetTitle: 'Target Document',
            targetPolicyNumber: '42 CFR 440',
            relationshipType: 'REFERENCES_DOCUMENT',
            referenceText: 'pursuant to 42 CFR 440',
          }),
        ],
      },
    ]);

    const result = await followReferences.execute({ sectionId: 'sec-1' }, {});

    expect(result.references).toHaveLength(2);
    expect(result.references[0]).toEqual({
      targetId: 'sec-target-1',
      targetType: 'Section',
      targetTitle: 'Target Section',
      targetPolicyNumber: '1A',
      relationshipType: 'REFERENCES',
      referenceText: 'see section 1A',
    });
    expect(result.references[1]).toEqual({
      targetId: 'doc-target-1',
      targetType: 'Document',
      targetTitle: 'Target Document',
      targetPolicyNumber: '42 CFR 440',
      relationshipType: 'REFERENCES_DOCUMENT',
      referenceText: 'pursuant to 42 CFR 440',
    });
  });

  it('returns empty array when no references', async () => {
    setupSession([{ records: [] }]);

    const result = await followReferences.execute({ sectionId: 'sec-orphan' }, {});

    expect(result.references).toEqual([]);
  });
});

// ── getAmendments ────────────────────────────────────────────────────────────

describe('getAmendments', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns amendments and base document', async () => {
    setupSession([
      {
        // Amendments (incoming AMENDS)
        records: [
          mockRecord({
            id: 'amend-1',
            title: 'Change Notice 2025-01',
            documentType: 'change_notice',
            policyNumber: '8C-CN-01',
            effectiveDate: '2025-06-01',
            url: 'https://example.com/cn-01',
          }),
        ],
      },
      {
        // Base document (outgoing AMENDS)
        records: [
          mockRecord({
            id: 'doc-base',
            title: 'Original Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2024-01-01',
            url: 'https://example.com/8C',
          }),
        ],
      },
    ]);

    const result = await getAmendments.execute({ documentId: 'doc-1' }, {});

    expect(result.amendments).toHaveLength(1);
    expect(result.amendments[0]).toEqual({
      id: 'amend-1',
      title: 'Change Notice 2025-01',
      documentType: 'change_notice',
      policyNumber: '8C-CN-01',
      effectiveDate: '2025-06-01',
      url: 'https://example.com/cn-01',
    });
    expect(result.baseDocument).toEqual({
      id: 'doc-base',
      title: 'Original Policy 8C',
      documentType: 'dhhs_policy',
      policyNumber: '8C',
      effectiveDate: '2024-01-01',
      url: 'https://example.com/8C',
    });
  });

  it('returns null baseDocument when none exists', async () => {
    setupSession([
      {
        records: [
          mockRecord({
            id: 'amend-1',
            title: 'Change Notice',
            documentType: 'change_notice',
            policyNumber: '8C-CN',
            effectiveDate: '2025-01-01',
            url: null,
          }),
        ],
      },
      { records: [] }, // No base document
    ]);

    const result = await getAmendments.execute({ documentId: 'doc-1' }, {});

    expect(result.amendments).toHaveLength(1);
    expect(result.baseDocument).toBeNull();
  });
});
