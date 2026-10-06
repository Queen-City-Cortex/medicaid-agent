import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@mastra/core/tools', () => ({
  createTool: (config: any) => config,
}));

vi.mock('../../src/neo4j.js', () => ({
  withSession: vi.fn(),
}));

import { followReferences, getAmendments } from '../../src/tools/navigate.js';
import { runTool } from '../helpers/run-tool.js';
import { mockRecord, setupSession } from '../helpers/neo4j-session.js';

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

    const result = await runTool(followReferences, { sectionId: 'sec-1' });

    expect(result.references).toHaveLength(2);
    expect(result.references[0]).toMatchObject({
      targetId: 'sec-target-1',
      targetType: 'Section',
      targetTitle: 'Target Section',
      targetPolicyNumber: '1A',
      relationshipType: 'REFERENCES',
      referenceText: 'see section 1A',
    });
    expect(result.references[1]).toMatchObject({
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

    const result = await runTool(followReferences, { sectionId: 'sec-orphan' });

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
        // Current document metadata
        records: [
          mockRecord({
            id: 'doc-1',
            title: 'Current Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2025-01-01',
            url: 'https://example.com/8C',
            status: 'current',
          }),
        ],
      },
      {
        // Amendments (direct AMENDS edges with change_description)
        records: [
          mockRecord({
            id: 'amend-2',
            title: 'Change Notice 2025-03',
            documentType: 'change_notice',
            policyNumber: '8C-CN-03',
            effectiveDate: '2025-08-01',
            url: 'https://example.com/cn-03',
            status: 'amendment',
            changeDescription: 'This change notice supersedes the prior revision.',
          }),
          mockRecord({
            id: 'amend-1',
            title: 'Change Notice 2025-01',
            documentType: 'change_notice',
            policyNumber: '8C-CN-01',
            effectiveDate: '2025-06-01',
            url: 'https://example.com/cn-01',
            status: 'amendment',
            changeDescription: 'MA-2180 is revised in the following way...',
          }),
        ],
      },
      {
        // Base document (direct AMENDS in reverse)
        records: [
          mockRecord({
            id: 'doc-base',
            title: 'Original Policy 8C',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2024-01-01',
            url: 'https://example.com/8C',
            status: 'current',
          }),
        ],
      },
    ]);

    const result = await runTool(getAmendments, { documentId: 'doc-1' });

    expect(result.amendments).toHaveLength(2);
    expect(result.amendments[0]).toMatchObject({
      id: 'amend-2',
      title: 'Change Notice 2025-03',
      documentType: 'change_notice',
      policyNumber: '8C-CN-03',
      effectiveDate: '2025-08-01',
      url: 'https://example.com/cn-03',
      status: 'amendment',
      changeSummary: 'This change notice supersedes the prior revision.',
    });
    expect(result.amendments[1]).toMatchObject({
      id: 'amend-1',
      title: 'Change Notice 2025-01',
      documentType: 'change_notice',
      policyNumber: '8C-CN-01',
      effectiveDate: '2025-06-01',
      url: 'https://example.com/cn-01',
      status: 'amendment',
      changeSummary: 'MA-2180 is revised in the following way...',
    });
    expect(result.amends).toMatchObject([
      {
        id: 'doc-base',
        title: 'Original Policy 8C',
        documentType: 'dhhs_policy',
        policyNumber: '8C',
        effectiveDate: '2024-01-01',
        url: 'https://example.com/8C',
        status: 'current',
      },
    ]);
    // The queried document is the current text; the newest notice is history.
    expect(result.document).toMatchObject({ id: 'doc-1', title: 'Current Policy 8C', status: 'current' });
    expect(result.latestAmendment).toMatchObject({ id: 'amend-2', changeYear: null, changeSequence: null });
    expect(result.truncated).toBe(false);
    expect(result).not.toHaveProperty('authoritativeDocument');
    expect(result).not.toHaveProperty('baseDocument');
  });

  it('returns the queried document and an empty amends list when it amends nothing', async () => {
    setupSession([
      {
        records: [
          mockRecord({
            id: 'doc-1',
            title: 'Current Policy',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            effectiveDate: '2025-01-01',
            url: 'https://example.com/8C',
            status: 'current',
          }),
        ],
      },
      {
        records: [
          mockRecord({
            id: 'amend-1',
            title: 'Change Notice',
            documentType: 'change_notice',
            policyNumber: '8C-CN',
            effectiveDate: '2025-01-01',
            url: null,
            status: 'amendment',
            changeDescription: 'A short summary.',
          }),
        ],
      },
      { records: [] }, // No base document
    ]);

    const result = await runTool(getAmendments, { documentId: 'doc-1' });

    expect(result.amendments).toHaveLength(1);
    expect(result.amendments[0].changeSummary).toBe('A short summary.');
    expect(result.amends).toEqual([]);
    expect(result.document?.id).toBe('doc-1');
    expect(result.latestAmendment?.id).toBe('amend-1');
  });
});
