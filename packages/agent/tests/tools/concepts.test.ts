import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@mastra/core/tools', () => ({
  createTool: (config: any) => config,
}));

vi.mock('../../src/neo4j.js', () => ({
  withSession: vi.fn(),
}));

import { findConceptSections } from '../../src/tools/concepts.js';
import { runTool } from '../helpers/run-tool.js';
import { mockRecord, setupSession } from '../helpers/neo4j-session.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('findConceptSections', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const conceptRow = (index: number, relationshipType = 'COVERS') => ({
    sectionId: `sec-${index}`,
    sectionTitle: `Section ${index}`,
    sectionNumber: `3.${index}`,
    documentId: 'doc-1',
    documentType: 'dhhs_policy',
    policyNumber: '8C',
    relationshipType,
  });

  it('returns sections for concept', async () => {
    setupSession([
      { records: [mockRecord({ sections: [conceptRow(1, 'DEFINES'), conceptRow(2, 'RESTRICTS')], total: 2 })] },
    ]);

    const result = await runTool(findConceptSections, { conceptName: 'EPSDT' });

    expect(result).toEqual({
      sections: [conceptRow(1, 'DEFINES'), conceptRow(2, 'RESTRICTS')],
      total: 2,
      truncated: false,
    });
  });

  it('reports the total when the primitive caps the list', async () => {
    const page = Array.from({ length: 40 }, (_, index) => conceptRow(index));
    setupSession([{ records: [mockRecord({ sections: page, total: 2573 })] }]);

    const result = await runTool(findConceptSections, { conceptName: 'Prior Authorization' });

    expect(result.sections).toHaveLength(40);
    expect(result.total).toBe(2573);
    expect(result.truncated).toBe(true);
  });

  it('passes conceptName to query', async () => {
    const session = setupSession([{ records: [] }]);

    await runTool(findConceptSections, { conceptName: 'Prior Authorization' });

    expect(session.run).toHaveBeenCalledTimes(1);
    expect(session.run).toHaveBeenCalledWith(
      expect.any(String),
      { name: 'Prior Authorization' },
    );
  });

  it('works with relationshipType filter', async () => {
    const session = setupSession([{ records: [mockRecord({ sections: [conceptRow(1, 'DEFINES')], total: 1 })] }]);

    const result = await runTool(
      findConceptSections,
      { conceptName: 'EPSDT', relationshipType: 'DEFINES' },
    );

    expect(result.sections).toHaveLength(1);
    expect(session.run).toHaveBeenCalledTimes(1);
    // The query should contain the specific relationship type
    const queryArg = session.run.mock.calls[0][0];
    expect(queryArg).toContain('[r:DEFINES]');
  });

  it('normalizes a lowercase relationship filter to the stored type', async () => {
    const result = await findConceptSections.inputSchema!['~standard'].validate({
      conceptName: 'EPSDT',
      relationshipType: 'defines',
    });

    expect(result).toEqual({ value: { conceptName: 'EPSDT', relationshipType: 'DEFINES' } });
  });

  it('accepts only the relationship types the pipeline writes', async () => {
    const accepts = async (relationshipType: string) => {
      const result = await findConceptSections.inputSchema!['~standard'].validate({
        conceptName: 'EPSDT',
        relationshipType,
      });
      return !result.issues;
    };

    expect(await Promise.all(['COVERS', 'DEFINES', 'RESTRICTS'].map(accepts))).toEqual([true, true, true]);
    expect(await Promise.all(['defines', 'Covers', ' restricts '].map(accepts))).toEqual([true, true, true]);
    expect(
      await Promise.all(['GOVERNS', 'REFERENCES_CONCEPT', 'DEFINES}]->(x) DETACH DELETE x //'].map(accepts)),
    ).toEqual([false, false, false]);
  });
});
