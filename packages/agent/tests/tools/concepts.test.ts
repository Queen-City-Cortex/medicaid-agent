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

  it('returns sections for concept', async () => {
    setupSession([
      {
        records: [
          mockRecord({
            sectionId: 'sec-1',
            sectionTitle: 'EPSDT Overview',
            sectionNumber: '3.1',
            documentId: 'doc-1',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            relationshipType: 'DEFINES',
          }),
          mockRecord({
            sectionId: 'sec-2',
            sectionTitle: 'EPSDT Services',
            sectionNumber: '3.2',
            documentId: 'doc-1',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            relationshipType: 'GOVERNS',
          }),
        ],
      },
    ]);

    const result = await runTool(findConceptSections, { conceptName: 'EPSDT' });

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toEqual({
      sectionId: 'sec-1',
      sectionTitle: 'EPSDT Overview',
      sectionNumber: '3.1',
      documentId: 'doc-1',
      documentType: 'dhhs_policy',
      policyNumber: '8C',
      relationshipType: 'DEFINES',
    });
    expect(result.sections[1].relationshipType).toBe('GOVERNS');
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
    const session = setupSession([
      {
        records: [
          mockRecord({
            sectionId: 'sec-1',
            sectionTitle: 'Definition',
            sectionNumber: '1.1',
            documentId: 'doc-1',
            documentType: 'dhhs_policy',
            policyNumber: '8C',
            relationshipType: 'DEFINES',
          }),
        ],
      },
    ]);

    const result = await runTool(
      findConceptSections,
      { conceptName: 'EPSDT', relationshipType: 'DEFINES' },
    );

    expect(result.sections).toHaveLength(1);
    expect(session.run).toHaveBeenCalledTimes(1);
    // The query should contain the specific relationship type
    const queryArg = session.run.mock.calls[0][0];
    expect(queryArg).toContain('DEFINES');
  });

  it('rejects invalid relationship types to prevent injection', async () => {
    const session = setupSession([{ records: [] }]);

    const result = await runTool(
      findConceptSections,
      { conceptName: 'EPSDT', relationshipType: 'DEFINES}]->(x) DETACH DELETE x //' },
    );

    expect(result.sections).toHaveLength(0);
    expect(session.run).not.toHaveBeenCalled();
  });
});
