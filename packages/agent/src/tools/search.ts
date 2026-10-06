import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchPolicySections } from '../policy-corpus.js';

const SectionResult = z.object({
  sectionId: z.string(),
  title: z.string().nullable(),
  policyNumber: z.string().nullable(),
  documentType: z.string().nullable(),
  contentSnippet: z.string().nullable(),
  score: z.number(),
});

export const searchSections = createTool({
  id: 'search-sections',
  description:
    'Hybrid search (semantic + keyword) over NC Medicaid policy sections. ' +
    'Use this to find relevant policy sections for a topic or question. ' +
    'Optionally filter by documentType (e.g. "dhhs_policy", "clinical_policy", "federal_regulation", "beneficiary_guidance").',
  inputSchema: z.object({
    query: z.string().describe('Natural language search query'),
    documentTypes: z
      .array(z.string())
      .optional()
      .describe('Filter results to specific document types'),
    topK: z.number().optional().describe('Number of results to return (default 10)'),
  }),
  outputSchema: z.object({
    sections: z.array(SectionResult),
    retrievalMode: z.enum(['hybrid', 'lexical-degraded']),
  }),
  execute: async (inputData) => {
    return searchPolicySections(inputData);
  },
});
