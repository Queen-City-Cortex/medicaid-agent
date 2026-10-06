import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { policyCorpus } from '../policy-corpus.js';
import { DocumentMetadataSchema } from './document-metadata.js';

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
  execute: async (inputData) => ({ references: await policyCorpus.followReferences(inputData.sectionId) }),
});

// ─── getAmendments ─────────────────────────────────────────────────────────────

const AmendmentSchema = DocumentMetadataSchema.extend({
  changeSummary: z.string().nullable(),
  changeYear: z.number().nullable(),
  changeSequence: z.number().nullable(),
});

export const getAmendments = createTool({
  id: 'get-amendments',
  description:
    'Find the change notices and revisions that directly amend a given document. ' +
    'Returns document (the one you asked about, which is the current text to cite), ' +
    'amendments (its history, newest first, each with a changeSummary; truncated is true when older ones were left out), ' +
    'latestAmendment (the newest one: it describes what changed and is not the current text), ' +
    'and amends (every document the queried one amends, when it is itself a change notice). ' +
    'A DHHS change notice has no effectiveDate: changeYear and changeSequence give its number, ' +
    'which orders it within one manual only.',
  inputSchema: z.object({
    documentId: z.string().describe('The document ID to look up amendments for'),
  }),
  outputSchema: z.object({
    document: DocumentMetadataSchema.nullable(),
    amends: z.array(DocumentMetadataSchema),
    amendments: z.array(AmendmentSchema),
    latestAmendment: AmendmentSchema.nullable(),
    truncated: z.boolean(),
  }),
  execute: async (inputData) => policyCorpus.getAmendments(inputData.documentId),
});
