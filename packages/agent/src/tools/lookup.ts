import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { policyCorpus } from '../policy-corpus.js';
import { DocumentMetadataSchema } from './document-metadata.js';

export const lookupPolicy = createTool({
  id: 'lookup-policy',
  description:
    'Look up a policy document by its policy number (e.g. "8C", "1A-1", "42 CFR 440", "SSA Title 19"). ' +
    'Federal citations may be written naturally ("42 CFR 440", "42 C.F.R. § 440.230") — they are normalized to the stored form. ' +
    'Returns the document metadata and a list of its sections. ' +
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
  execute: async (inputData) => ({ documents: await policyCorpus.lookupPolicy(inputData) }),
});
