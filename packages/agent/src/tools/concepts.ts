import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ALLOWED_CONCEPT_RELATIONSHIPS } from '@nc-medicaid/policy-corpus';
import { policyCorpus } from '../policy-corpus.js';

export const findConceptSections = createTool({
  id: 'find-concept-sections',
  description:
    'Find policy sections that are associated with a named policy concept (e.g. "EPSDT", ' +
    '"Prior Authorization", "Medically Necessary"). Optionally filter by relationship type. ' +
    'Returns the best-matching sections first, capped; `total` is the full count and `truncated` ' +
    'says whether the list was cut. When it is, narrow with relationshipType or use searchSections.',
  inputSchema: z.object({
    conceptName: z.string().describe('The policy concept name to search for'),
    // Models write 'defines' as readily as 'DEFINES'; the primitive accepts
    // either, so the schema must not reject what it would have answered.
    relationshipType: z
      .preprocess(
        (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
        z.enum(ALLOWED_CONCEPT_RELATIONSHIPS),
      )
      .optional()
      .describe('Optional: keep only sections that cover, define or restrict the concept'),
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
    total: z.number().describe('How many sections are linked to the concept in all'),
    truncated: z.boolean().describe('True when `sections` is only the first part of `total`'),
  }),
  execute: async (inputData) => policyCorpus.findConceptSections(inputData),
});
