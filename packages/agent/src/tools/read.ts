import { visibleSection } from './section-metadata.js';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { SECTION_WINDOW_CHARS, SECTION_WINDOW_MAX_CHARS } from '@nc-medicaid/policy-corpus';
import { policyCorpus } from '../policy-corpus.js';
import { DocumentMetadataSchema } from './document-metadata.js';

// ─── getSection ────────────────────────────────────────────────────────────────

// Cypher substring() rejects a start above 2^31 - 1. An offset past the end
// of a section is not an error: it returns an empty window with the total.
const SECTION_OFFSET_MAX = 2_147_483_647;

/** The window fields of a section read; a schema that omits them strips them. */
export const SectionWindowSchema = z.object({
  contentOffset: z.number().describe('Where content starts in the section text'),
  totalChars: z.number().describe('Length of the whole section text'),
  nextOffset: z.number().nullable().describe('Offset of the next window; null when content reaches the end'),
  contentNote: z.string().nullable().describe('The range shown and how to continue; null when content is the whole text'),
});

export const getSection = createTool({
  id: 'get-section',
  description:
    'Read the text and metadata of a specific policy section by its ID. ' +
    `One call returns a window of the text (${SECTION_WINDOW_CHARS} characters by default, at most ${SECTION_WINDOW_MAX_CHARS}), not ` +
    'necessarily all of it: totalChars is the full length and nextOffset is where the next window starts, ' +
    'or null when content reaches the end. Call again with offset=nextOffset to read on. ' +
    'Do not conclude that something is absent from a section while nextOffset is not null. ' +
    'A heading with no text of its own returns the text of its sub-sections, paged the same way.',
  inputSchema: z.object({
    sectionId: z.string().describe('The unique section ID (e.g. "doc-123:sec-4.1")'),
    offset: z
      .number()
      .int()
      .min(0)
      .max(SECTION_OFFSET_MAX)
      .optional()
      .describe('Characters to skip before the returned window (default 0); pass the previous nextOffset'),
    length: z
      .number()
      .int()
      .min(1)
      .max(SECTION_WINDOW_MAX_CHARS)
      .optional()
      .describe(`Window size in characters (default ${SECTION_WINDOW_CHARS}, at most ${SECTION_WINDOW_MAX_CHARS})`),
  }),
  outputSchema: z.object({
    section: z
      .object({
        id: z.string(),
        title: z.string().nullable(),
        sectionNumber: z.string().nullable(),
        content: z.string().nullable(),
        ...SectionWindowSchema.shape,
        effectiveDate: z.string().nullable(),
        sourceModifiedDate: z.string().nullable().optional(),
        retrievedAt: z.string().nullable().optional(),
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
  execute: async (inputData) => {
    const section = await policyCorpus.getSection(inputData.sectionId, {
      offset: inputData.offset,
      length: inputData.length,
    });
    return { section: section ? visibleSection(section) : null };
  },
});

// ─── getDocument ────────────────────────────────────────────────────────────────

// One state plan amendment has 2,164 non-empty sections, so the list is paged.
export const DOCUMENT_SECTION_LIMIT = 100;

export const getDocument = createTool({
  id: 'get-document',
  description:
    'Retrieve metadata and section list for a policy document by its ID. ' +
    'Returns the document title, type, policy number, and a list of its sections. ' +
    `The list is capped at ${DOCUMENT_SECTION_LIMIT} per call; sectionCount is the document's full count and ` +
    'sectionsTruncated says whether sections remain after this page. Pass sectionOffset to read the next page.',
  inputSchema: z.object({
    documentId: z.string().describe('The unique document ID'),
    sectionOffset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('How many sections to skip before the returned page (default 0)'),
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
        sectionCount: z.number().describe('How many sections the document has in all'),
        sectionsTruncated: z.boolean().describe('True when sections remain after the returned page'),
      })
      .nullable(),
  }),
  execute: async (inputData) => {
    const document = await policyCorpus.getDocument(inputData.documentId);
    if (!document) return { document: null };
    const offset = inputData.sectionOffset ?? 0;
    const page = document.sections.slice(offset, offset + DOCUMENT_SECTION_LIMIT);
    return {
      document: {
        ...document,
        sections: page.map((section) => ({
          id: section.id,
          number: section.number,
          title: section.title,
          chars: section.chars ?? null,
        })),
        sectionCount: document.sections.length,
        sectionsTruncated: offset + page.length < document.sections.length,
      },
    };
  },
});

// ─── getSectionContext ──────────────────────────────────────────────────────────

export const getSectionContext = createTool({
  id: 'get-section-context',
  description:
    'Retrieve the structural context of a section: its ancestors (parent sections), ' +
    'the nearest sibling sections in document order, and its first direct children. Useful for ' +
    'understanding where a section fits within the document hierarchy. siblingCount and childCount ' +
    'are the full counts; siblingsTruncated and childrenTruncated say whether a list was cut. ' +
    'Call again on the first or last sibling to walk further.',
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
    siblingCount: z.number(),
    siblingsTruncated: z.boolean(),
    children: z.array(
      z.object({ id: z.string(), title: z.string().nullable(), sectionNumber: z.string().nullable() }),
    ),
    childCount: z.number(),
    childrenTruncated: z.boolean(),
  }),
  execute: async (inputData) => policyCorpus.getSectionContext(inputData.sectionId),
});
