import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { withSession } from '../neo4j.js';

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
        documentId: z.string().nullable(),
        documentType: z.string().nullable(),
        policyNumber: z.string().nullable(),
      })
      .nullable(),
  }),
  execute: async ({ context: inputData }) => {
    const { sectionId } = inputData;

    const section = await withSession(async (session) => {
      const result = await session.run(
        `MATCH (s:Section {id: $id})
         OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
         RETURN
           s.id AS id,
           s.title AS title,
           s.section_number AS sectionNumber,
           s.content AS content,
           s.effective_date AS effectiveDate,
           d.id AS documentId,
           d.document_type AS documentType,
           d.policy_number AS policyNumber`,
        { id: sectionId },
      );

      if (result.records.length === 0) return null;

      const rec = result.records[0];
      return {
        id: rec.get('id') as string,
        title: rec.get('title') as string | null,
        sectionNumber: rec.get('sectionNumber') as string | null,
        content: rec.get('content') as string | null,
        effectiveDate: rec.get('effectiveDate') as string | null,
        documentId: rec.get('documentId') as string | null,
        documentType: rec.get('documentType') as string | null,
        policyNumber: rec.get('policyNumber') as string | null,
      };
    });

    return { section };
  },
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
        id: z.string(),
        title: z.string().nullable(),
        documentType: z.string().nullable(),
        policyNumber: z.string().nullable(),
        effectiveDate: z.string().nullable(),
        url: z.string().nullable(),
        sections: z.array(
          z.object({
            number: z.string().nullable(),
            title: z.string().nullable(),
          }),
        ),
      })
      .nullable(),
  }),
  execute: async ({ context: inputData }) => {
    const { documentId } = inputData;

    const document = await withSession(async (session) => {
      const result = await session.run(
        `MATCH (d:Document {id: $id})
         OPTIONAL MATCH (d)-[:HAS_SECTION]->(s:Section)
         RETURN
           d.id AS id,
           d.title AS title,
           d.document_type AS documentType,
           d.policy_number AS policyNumber,
           d.effective_date AS effectiveDate,
           d.url AS url,
           collect({number: s.section_number, title: s.title}) AS sections`,
        { id: documentId },
      );

      if (result.records.length === 0) return null;

      const rec = result.records[0];
      const rawSections = rec.get('sections') as Array<{
        number: string | null;
        title: string | null;
      }>;

      // Filter out null entries from empty OPTIONAL MATCH
      const sections = rawSections.filter((s) => s.number != null || s.title != null);

      return {
        id: rec.get('id') as string,
        title: rec.get('title') as string | null,
        documentType: rec.get('documentType') as string | null,
        policyNumber: rec.get('policyNumber') as string | null,
        effectiveDate: rec.get('effectiveDate') as string | null,
        url: rec.get('url') as string | null,
        sections,
      };
    });

    return { document };
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
  execute: async ({ context: inputData }) => {
    const { sectionId } = inputData;

    return await withSession(async (session) => {
      // Ancestors: walk PARENT_OF in reverse
      const ancestorResult = await session.run(
        `MATCH (s:Section {id: $id})
         MATCH path = (ancestor:Section)-[:PARENT_OF*1..10]->(s)
         RETURN ancestor.id AS id, ancestor.title AS title, ancestor.section_number AS sectionNumber
         ORDER BY length(path) DESC`,
        { id: sectionId },
      );

      const ancestors = ancestorResult.records.map((r) => ({
        id: r.get('id') as string,
        title: r.get('title') as string | null,
        sectionNumber: r.get('sectionNumber') as string | null,
      }));

      // Children: direct PARENT_OF targets
      const childResult = await session.run(
        `MATCH (s:Section {id: $id})-[:PARENT_OF]->(child:Section)
         RETURN child.id AS id, child.title AS title, child.section_number AS sectionNumber
         ORDER BY child.section_number`,
        { id: sectionId },
      );

      const children = childResult.records.map((r) => ({
        id: r.get('id') as string,
        title: r.get('title') as string | null,
        sectionNumber: r.get('sectionNumber') as string | null,
      }));

      // Siblings: sections with the same parent (via NEXT_SIBLING or shared parent)
      const siblingResult = await session.run(
        `MATCH (s:Section {id: $id})
         OPTIONAL MATCH (s)-[:NEXT_SIBLING]->(next:Section)
         OPTIONAL MATCH (prev:Section)-[:NEXT_SIBLING]->(s)
         WITH s, collect(DISTINCT next) + collect(DISTINCT prev) AS sibs
         UNWIND sibs AS sibling
         RETURN sibling.id AS id, sibling.title AS title, sibling.section_number AS sectionNumber`,
        { id: sectionId },
      );

      const siblings = siblingResult.records.map((r) => ({
        id: r.get('id') as string,
        title: r.get('title') as string | null,
        sectionNumber: r.get('sectionNumber') as string | null,
      }));

      return { ancestors, siblings, children };
    });
  },
});
