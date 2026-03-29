import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { withSession } from '../neo4j.js';

// ─── followReferences ──────────────────────────────────────────────────────────

export const followReferences = createTool({
  id: 'follow-references',
  description:
    'Find all sections and documents that a given section references. ' +
    'Use this to trace cross-references within the policy corpus, e.g. when a section ' +
    'says "see 8C.3" or "pursuant to 42 CFR 440".',
  inputSchema: z.object({
    sectionId: z.string().describe('The section ID to find references from'),
  }),
  outputSchema: z.object({
    references: z.array(
      z.object({
        targetId: z.string(),
        targetType: z.enum(['Section', 'Document']),
        targetTitle: z.string().nullable(),
        targetPolicyNumber: z.string().nullable(),
        relationshipType: z.string(),
        referenceText: z.string().nullable(),
      }),
    ),
  }),
  execute: async (inputData) => {
    const { sectionId } = inputData;

    return await withSession(async (session) => {
      const result = await session.run(
        `MATCH (s:Section {id: $id})-[r:REFERENCES|REFERENCES_DOCUMENT]->(target)
         OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(target)
         RETURN
           target.id AS targetId,
           labels(target)[0] AS targetType,
           CASE WHEN target:Section THEN target.title ELSE target.title END AS targetTitle,
           CASE WHEN target:Section THEN d.policy_number ELSE target.policy_number END AS targetPolicyNumber,
           type(r) AS relationshipType,
           r.text AS referenceText`,
        { id: sectionId },
      );

      const references = result.records.map((rec) => ({
        targetId: rec.get('targetId') as string,
        targetType: rec.get('targetType') as 'Section' | 'Document',
        targetTitle: rec.get('targetTitle') as string | null,
        targetPolicyNumber: rec.get('targetPolicyNumber') as string | null,
        relationshipType: rec.get('relationshipType') as string,
        referenceText: rec.get('referenceText') as string | null,
      }));

      return { references };
    });
  },
});

// ─── getAmendments ─────────────────────────────────────────────────────────────

export const getAmendments = createTool({
  id: 'get-amendments',
  description:
    'Find all amendments (change notices) that amend a given document, and check if the ' +
    'document itself amends another base document. Use this to ensure you are looking at ' +
    'the most current version of a policy and to identify superseded provisions.',
  inputSchema: z.object({
    documentId: z.string().describe('The document ID to look up amendments for'),
  }),
  outputSchema: z.object({
    amendments: z.array(
      z.object({
        id: z.string(),
        title: z.string().nullable(),
        documentType: z.string().nullable(),
        policyNumber: z.string().nullable(),
        effectiveDate: z.string().nullable(),
        url: z.string().nullable(),
      }),
    ),
    baseDocument: z
      .object({
        id: z.string(),
        title: z.string().nullable(),
        documentType: z.string().nullable(),
        policyNumber: z.string().nullable(),
        effectiveDate: z.string().nullable(),
        url: z.string().nullable(),
      })
      .nullable(),
  }),
  execute: async (inputData) => {
    const { documentId } = inputData;

    return await withSession(async (session) => {
      // Documents that amend this document (incoming AMENDS)
      const amendResult = await session.run(
        `MATCH (d:Document {id: $id})<-[:AMENDS]-(amend:Document)
         RETURN
           amend.id AS id,
           amend.title AS title,
           amend.document_type AS documentType,
           amend.policy_number AS policyNumber,
           amend.effective_date AS effectiveDate,
           amend.url AS url
         ORDER BY amend.effective_date DESC`,
        { id: documentId },
      );

      const amendments = amendResult.records.map((rec) => ({
        id: rec.get('id') as string,
        title: rec.get('title') as string | null,
        documentType: rec.get('documentType') as string | null,
        policyNumber: rec.get('policyNumber') as string | null,
        effectiveDate: rec.get('effectiveDate') as string | null,
        url: rec.get('url') as string | null,
      }));

      // Document that this document amends (outgoing AMENDS)
      const baseResult = await session.run(
        `MATCH (d:Document {id: $id})-[:AMENDS]->(base:Document)
         RETURN
           base.id AS id,
           base.title AS title,
           base.document_type AS documentType,
           base.policy_number AS policyNumber,
           base.effective_date AS effectiveDate,
           base.url AS url`,
        { id: documentId },
      );

      const baseDocument =
        baseResult.records.length > 0
          ? {
              id: baseResult.records[0].get('id') as string,
              title: baseResult.records[0].get('title') as string | null,
              documentType: baseResult.records[0].get('documentType') as string | null,
              policyNumber: baseResult.records[0].get('policyNumber') as string | null,
              effectiveDate: baseResult.records[0].get('effectiveDate') as string | null,
              url: baseResult.records[0].get('url') as string | null,
            }
          : null;

      return { amendments, baseDocument };
    });
  },
});
