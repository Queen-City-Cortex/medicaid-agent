import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { withSession } from '../neo4j.js';

export const findConceptSections = createTool({
  id: 'find-concept-sections',
  description:
    'Find all policy sections that are associated with a named policy concept (e.g. "EPSDT", ' +
    '"Prior Authorization", "Medically Necessary"). Optionally filter by relationship type. ' +
    'Use this to quickly locate all sections that govern a specific program concept.',
  inputSchema: z.object({
    conceptName: z.string().describe('The policy concept name to search for'),
    relationshipType: z
      .string()
      .optional()
      .describe(
        'Optional: filter by relationship type (e.g. "DEFINES", "GOVERNS", "REFERENCES_CONCEPT")',
      ),
  }),
  outputSchema: z.object({
    sections: z.array(
      z.object({
        sectionId: z.string(),
        sectionTitle: z.string().nullable(),
        sectionNumber: z.string().nullable(),
        documentId: z.string().nullable(),
        documentType: z.string().nullable(),
        policyNumber: z.string().nullable(),
        relationshipType: z.string(),
      }),
    ),
  }),
  execute: async ({ context: inputData }) => {
    const { conceptName, relationshipType } = inputData;

    return await withSession(async (session) => {
      const query = relationshipType
        ? `MATCH (s:Section)-[r:${relationshipType}]->(c:PolicyConcept)
           WHERE c.name = $name OR toLower(c.name) = toLower($name)
           OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
           RETURN
             s.id AS sectionId,
             s.title AS sectionTitle,
             s.section_number AS sectionNumber,
             d.id AS documentId,
             d.document_type AS documentType,
             d.policy_number AS policyNumber,
             type(r) AS relationshipType`
        : `MATCH (s:Section)-[r]->(c:PolicyConcept)
           WHERE c.name = $name OR toLower(c.name) = toLower($name)
           OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
           RETURN
             s.id AS sectionId,
             s.title AS sectionTitle,
             s.section_number AS sectionNumber,
             d.id AS documentId,
             d.document_type AS documentType,
             d.policy_number AS policyNumber,
             type(r) AS relationshipType`;

      const result = await session.run(query, { name: conceptName });

      const sections = result.records.map((rec) => ({
        sectionId: rec.get('sectionId') as string,
        sectionTitle: rec.get('sectionTitle') as string | null,
        sectionNumber: rec.get('sectionNumber') as string | null,
        documentId: rec.get('documentId') as string | null,
        documentType: rec.get('documentType') as string | null,
        policyNumber: rec.get('policyNumber') as string | null,
        relationshipType: rec.get('relationshipType') as string,
      }));

      return { sections };
    });
  },
});
