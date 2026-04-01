import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { withSession } from '../neo4j.js';
import {
  DocumentMetadataSchema,
  documentMetadataReturn,
  mapDocumentMetadataRecord,
} from './document-metadata.js';

export const lookupPolicy = createTool({
  id: 'lookup-policy',
  description:
    'Look up a policy document by its policy number (e.g. "8C", "1A-1", "42 CFR 440"). ' +
    'Returns the document metadata and a list of its sections. ' +
    'Use this when the user or a cross-reference mentions a specific policy number.',
  inputSchema: z.object({
    policyNumber: z.string().describe('The policy number to look up (e.g. "8C", "1A-1")'),
  }),
  outputSchema: z.object({
    documents: z.array(
      DocumentMetadataSchema.extend({
        sections: z.array(
          z.object({
            id: z.string(),
            number: z.string().nullable(),
            title: z.string().nullable(),
          }),
        ),
      }),
    ),
  }),
  execute: async (inputData) => {
    const { policyNumber } = inputData;

    return await withSession(async (session) => {
      const result = await session.run(
        `MATCH (d:Document)
         WHERE d.policy_number = $pn
            OR toLower(d.policy_number) = toLower($pn)
            OR d.policy_number STARTS WITH $pn
         OPTIONAL MATCH (d)-[:HAS_SECTION]->(s:Section)
         RETURN
           ${documentMetadataReturn('d')},
           collect({id: s.id, number: s.section_number, title: s.title}) AS sections
         ORDER BY d.effective_date DESC`,
        { pn: policyNumber },
      );

      const documents = result.records.map((rec) => {
        const rawSections = rec.get('sections') as Array<{
          id: string | null;
          number: string | null;
          title: string | null;
        }>;

        // Filter null entries from empty OPTIONAL MATCH
        const sections = rawSections
          .filter((s) => s.id != null)
          .map((s) => ({
            id: s.id as string,
            number: s.number,
            title: s.title,
          }));

        return {
          ...mapDocumentMetadataRecord(rec),
          sections,
        };
      });

      return { documents };
    });
  },
});
