import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { policyCorpus } from '../policy-corpus.js';
import { DocumentMetadataSchema } from './document-metadata.js';

// ─── getSection ────────────────────────────────────────────────────────────────

export const getSection = createTool({
  id: 'get-section',
  description:
    'Retrieve the full content and metadata of a specific policy section by its ID. ' +
    'Use this when you need to read the complete text of a section found via searchSections.',
  inputSchema: z.object({
    sectionId: z.string().describe('The unique section ID (e.g. "doc-123:sec-4.1")'),
  }),
  outputSchema: z.object({
    section: z
      .object({
        id: z.string(),
        title: z.string().nullable(),
        sectionNumber: z.string().nullable(),
        content: z.string().nullable(),
        effectiveDate: z.string().nullable(),
        lastRevised: z.string().nullable(),
        federalRegisterCite: z.string().nullable(),
        documentId: z.string().nullable(),
        documentTitle: z.string().nullable(),
        documentType: z.string().nullable(),
        policyNumber: z.string().nullable(),
        url: z.string().nullable(),
        citationLink: z.string().nullable(),
        status: z.string().nullable(),
        authorityTier: z.string().nullable(),
        answerRole: z.string().nullable(),
        sourceFormat: z.string().nullable(),
        answerReady: z.boolean().nullable(),
        corpusBucket: z.string().nullable(),
        variantGroup: z.string().nullable(),
        variantDate: z.string().nullable(),
        retrievalReady: z.boolean().nullable(),
      })
      .nullable(),
  }),
  execute: async (inputData) => ({ section: await policyCorpus.getSection(inputData.sectionId) }),
});

// ─── getDocument ────────────────────────────────────────────────────────────────

export const getDocument = createTool({
  id: 'get-document',
  description:
    'Retrieve metadata and section list for a policy document by its ID. ' +
    'Returns the document title, type, policy number, and a list of its sections.',
  inputSchema: z.object({
    documentId: z.string().describe('The unique document ID'),
  }),
  outputSchema: z.object({
    document: z
      .object({
        ...DocumentMetadataSchema.shape,
        sections: z.array(
          z.object({
            id: z.string(),
            number: z.string().nullable(),
            title: z.string().nullable(),
            chars: z.number().nullable(),
          }),
        ),
      })
      .nullable(),
  }),
  execute: async (inputData) => {
    const document = await policyCorpus.getDocument(inputData.documentId);
    return {
      document: document
        ? {
            ...document,
            sections: document.sections.map((section) => ({
              id: section.id,
              number: section.number,
              title: section.title,
              chars: section.chars ?? null,
            })),
          }
        : null,
    };
  },
});

// ─── getSectionContext ──────────────────────────────────────────────────────────

export const getSectionContext = createTool({
  id: 'get-section-context',
  description:
    'Retrieve the structural context of a section: its ancestors (parent sections), ' +
    'sibling sections, and direct children. Useful for understanding where a section ' +
    'fits within the document hierarchy.',
  inputSchema: z.object({
    sectionId: z.string().describe('The unique section ID'),
  }),
  outputSchema: z.object({
    ancestors: z.array(
      z.object({ id: z.string(), title: z.string().nullable(), sectionNumber: z.string().nullable() }),
    ),
    siblings: z.array(
      z.object({ id: z.string(), title: z.string().nullable(), sectionNumber: z.string().nullable() }),
    ),
    children: z.array(
      z.object({ id: z.string(), title: z.string().nullable(), sectionNumber: z.string().nullable() }),
    ),
  }),
  execute: async (inputData) => policyCorpus.getSectionContext(inputData.sectionId),
});
