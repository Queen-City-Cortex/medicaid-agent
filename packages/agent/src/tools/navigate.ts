import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { withSession } from '../neo4j.js';
import {
  DocumentMetadataSchema,
  documentMetadataReturn,
  mapDocumentMetadataRecord,
} from './document-metadata.js';

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
           r.reference_text AS referenceText`,
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
    'Find all change notices that directly amend a given document. ' +
    'Returns each amendment with a changeSummary describing what was changed, ' +
    'the base document this one amends, and the authoritative document to cite now.',
  inputSchema: z.object({
    documentId: z.string().describe('The document ID to look up amendments for'),
  }),
  outputSchema: z.object({
    amendments: z.array(
      DocumentMetadataSchema.extend({
        changeSummary: z.string().nullable(),
      }),
    ),
    baseDocument: DocumentMetadataSchema.nullable(),
    authoritativeDocument: DocumentMetadataSchema.nullable(),
  }),
  execute: async (inputData) => {
    const { documentId } = inputData;

    return await withSession(async (session) => {
      const currentResult = await session.run(
        `MATCH (d:Document {id: $id})
         RETURN
           ${documentMetadataReturn('d')}`,
        { id: documentId },
      );
      const currentDocument =
        currentResult.records.length > 0 ? mapDocumentMetadataRecord(currentResult.records[0]) : null;

      // Direct amendments: change notices that amend this document
      const amendResult = await session.run(
        `MATCH (d:Document {id: $id})
         OPTIONAL MATCH (amend:Document)-[r:AMENDS]->(d)
         WHERE amend IS NOT NULL
         RETURN
           ${documentMetadataReturn('amend')},
           r.change_description AS changeDescription
         ORDER BY amend.effective_date DESC, amend.id ASC`,
        { id: documentId },
      );

      const amendments = amendResult.records.map((rec) => ({
        ...mapDocumentMetadataRecord(rec),
        changeSummary: rec.get('changeDescription') as string | null,
      }));

      // Base document: the document this one directly amends
      const baseResult = await session.run(
        `MATCH (d:Document {id: $id})-[:AMENDS]->(base:Document)
         RETURN
           ${documentMetadataReturn('base')}
         LIMIT 1`,
        { id: documentId },
      );

      const baseDocument =
        baseResult.records.length > 0
          ? mapDocumentMetadataRecord(baseResult.records[0])
          : null;

      const latestAmendment = amendments[0];
      const authoritativeDocument = latestAmendment
        ? {
            id: latestAmendment.id,
            title: latestAmendment.title,
            documentType: latestAmendment.documentType,
            policyNumber: latestAmendment.policyNumber,
            effectiveDate: latestAmendment.effectiveDate,
            url: latestAmendment.url,
            status: latestAmendment.status,
          }
        : currentDocument;

      return { amendments, baseDocument, authoritativeDocument };
    });
  },
});
