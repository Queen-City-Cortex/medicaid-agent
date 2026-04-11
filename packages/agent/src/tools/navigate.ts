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
  execute: async (inputData) => policyCorpus.getAmendments(inputData.documentId),
});
