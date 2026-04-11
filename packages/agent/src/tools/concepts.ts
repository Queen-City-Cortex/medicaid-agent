import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { policyCorpus } from '../policy-corpus.js';

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
  execute: async (inputData) => {
    return { sections: await policyCorpus.findConceptSections(inputData) };
  },
});
