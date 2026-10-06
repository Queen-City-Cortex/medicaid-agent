import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { policyCorpus } from '../policy-corpus.js';
import { DocumentMetadataSchema } from './document-metadata.js';

// A policy-number prefix can match 25 documents with thousands of sections
// between them ("1915(c)": 3,018 on the July 2026 graph).
export const LOOKUP_SECTION_LIMIT = 40;

export const lookupPolicy = createTool({
  id: 'lookup-policy',
  description:
    'Look up a policy document by its policy number (e.g. "8C", "1A-1", "42 CFR 440", "SSA Title 19"). ' +
    'Federal citations may be written naturally ("42 CFR 440", "42 C.F.R. § 440.230") — they are normalized to the stored form. ' +
    'Returns the document metadata and a list of its sections. ' +
    `Each list is capped at ${LOOKUP_SECTION_LIMIT}; sectionCount is the document's full count and sectionsTruncated ` +
    'says whether the list was cut. Use getDocument to page through the rest. ' +
    'If the document has been superseded, the result includes a structured supersession note ' +
    '(what replaced it, effective when, and why) — relay that history when the user asks about the old citation. ' +
    'Use this when the user or a cross-reference mentions a specific policy number.',
  inputSchema: z.object({
    policyNumber: z.string().describe('The policy number to look up (e.g. "8C", "1A-1", "42 CFR 440")'),
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
        sectionCount: z.number().describe('How many sections the document has in all'),
        sectionsTruncated: z.boolean().describe('True when `sections` is only the first part of `sectionCount`'),
        supersession: z
          .object({
            byPolicyNumber: z.string().nullable(),
            byTitle: z.string().nullable(),
            citationLink: z.string().nullable(),
            effective: z.string().nullable(),
            reason: z.string().nullable(),
          })
          .nullable()
          .optional()
          .describe('Present when this document was superseded: what replaced it, effective when, and why.'),
      }),
    ),
  }),
  execute: async (inputData) => ({
    documents: (await policyCorpus.lookupPolicy(inputData)).map((document) => ({
      ...document,
      // PolicyCorpus lists sections in one order, so getDocument's next page continues this list.
      sections: document.sections.slice(0, LOOKUP_SECTION_LIMIT),
      sectionCount: document.sections.length,
      sectionsTruncated: document.sections.length > LOOKUP_SECTION_LIMIT,
    })),
  }),
});
